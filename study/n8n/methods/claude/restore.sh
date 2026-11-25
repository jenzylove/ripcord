#!/usr/bin/env bash
# restore.sh <backup-dir> <project-name> <port>
#
# Restores a backup made by backup.sh into a BRAND NEW copy of the stack, under a
# different compose project name and host port, so you can verify it without
# touching the live stack. Nothing in the original study-n8n project is modified.
#
#   ./restore.sh backups/20260101-120000 n8n-restore-test 9951
#
# Set RESTORE_START_N8N=0 to restore the data but leave n8n stopped (see warning below).
#
# WARNING: the restored n8n is a full copy. Active workflows will run their
# schedules/triggers and can send real emails, hit real APIs, etc. Use
# RESTORE_START_N8N=0 if that matters, or deactivate workflows before you rely on it.
set -euo pipefail

export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

LIVE_PROJECT="study-n8n"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$HERE/../../docker-compose.yml"
ENV_FILE="$HERE/../../.env"

usage() { echo "Usage: $0 <backup-dir> <project-name> <port>" >&2; exit 2; }
[ $# -eq 3 ] || usage
BACKUP="$1"; PROJECT="$2"; PORT="$3"

# ---- validate inputs -------------------------------------------------------
[ -d "$BACKUP" ] || { echo "ERROR: backup directory not found: $BACKUP" >&2; exit 1; }
BACKUP="$(cd "$BACKUP" && pwd)"
for f in db.dump n8n_storage.tgz; do
  [ -s "$BACKUP/$f" ] || { echo "ERROR: $BACKUP/$f missing or empty" >&2; exit 1; }
done

[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "ERROR: project name must be lowercase letters, digits, - or _" >&2; exit 1; }
[ "$PROJECT" != "$LIVE_PROJECT" ] || { echo "ERROR: refusing to use the live project name '$LIVE_PROJECT'" >&2; exit 1; }

[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || { echo "ERROR: invalid port: $PORT" >&2; exit 1; }
LIVE_PORT="$(grep -E '^[[:space:]]*HOST_PORT=' "$ENV_FILE" | tail -n1 | cut -d= -f2 | tr -d '\r"' || true)"
if [ "$PORT" = "${LIVE_PORT:-9941}" ]; then
  echo "ERROR: port $PORT is the live stack's port" >&2; exit 1
fi
# Best-effort check that the port is free.
if docker ps --format '{{.Ports}}' | grep -Eq "[:]${PORT}->"; then
  echo "ERROR: port $PORT is already published by another container" >&2; exit 1
fi

# HOST_PORT from the shell overrides the one in .env, so the live .env is never edited.
export HOST_PORT="$PORT"
dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# Refuse to restore on top of anything that already exists.
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ] \
   || [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  echo "ERROR: compose project '$PROJECT' already has containers or volumes." >&2
  echo "       Pick a new name, or remove it first: docker compose -p $PROJECT down -v" >&2
  exit 1
fi

# ---- verify backup integrity -----------------------------------------------
if [ -f "$BACKUP/MANIFEST.txt" ]; then
  echo "==> Verifying checksums"
  ( cd "$BACKUP" && grep -E '^[0-9a-f]{64}  ' MANIFEST.txt | sha256sum -c - )
fi

cleanup_on_fail() {
  rc=$?
  if [ $rc -ne 0 ]; then
    echo >&2
    echo "RESTORE FAILED. The partial copy was left for inspection; remove it with:" >&2
    echo "  docker compose -p $PROJECT -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" down -v" >&2
  fi
}
trap cleanup_on_fail EXIT

# ---- create the new stack (containers + volumes, nothing started) -----------
echo "==> Creating project '$PROJECT' (port $PORT)"
dc up --no-start

echo "==> Starting a fresh Postgres"
dc up -d --wait postgres   # init-data.sh creates the non-root n8n DB user on this empty volume

PG_CID="$(dc ps -q postgres)"
N8N_CID="$(dc ps -aq n8n)"
HELPER_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PG_CID")"
STORAGE_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Name}}{{end}}{{end}}' "$N8N_CID")"
[ -n "$STORAGE_VOL" ] || { echo "ERROR: could not find the new n8n_storage volume" >&2; exit 1; }

# ---- restore the database ---------------------------------------------------
echo "==> Restoring database (single transaction; any error rolls it all back)"
dc exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --single-transaction --exit-on-error' \
  < "$BACKUP/db.dump"

# ---- restore the n8n config volume (encryption key, etc.) ------------------
echo "==> Restoring n8n storage volume ($STORAGE_VOL)"
docker run --rm -i -v "$STORAGE_VOL":/data "$HELPER_IMAGE" tar -C /data -xzf - < "$BACKUP/n8n_storage.tgz"

# ---- start n8n and check ----------------------------------------------------
if [ "${RESTORE_START_N8N:-1}" = "0" ]; then
  echo "==> RESTORE_START_N8N=0: leaving n8n stopped."
  echo "    Start it with: HOST_PORT=$PORT docker compose -p $PROJECT -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" up -d n8n"
  trap - EXIT
  exit 0
fi

echo "==> Starting n8n"
dc up -d n8n

echo "==> Waiting for n8n to answer on http://localhost:$PORT/healthz"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/healthz" 2>/dev/null; then ok=1; break; fi
  sleep 2
done
if [ "$ok" -ne 1 ]; then
  echo "ERROR: n8n did not become healthy within 120s. Logs:" >&2
  dc logs --tail 40 n8n >&2
  exit 1
fi

# Sanity: the restored DB should have n8n's tables and the original data.
TABLES="$(dc exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from information_schema.tables where table_schema=current_schema()"' | tr -d '\r')"
WORKFLOWS="$(dc exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from workflow_entity"' 2>/dev/null | tr -d '\r' || echo '?')"
CREDS="$(dc exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from credentials_entity"' 2>/dev/null | tr -d '\r' || echo '?')"

trap - EXIT
echo
echo "Restore complete."
echo "  URL:        http://localhost:$PORT   (log in with the SAME owner account as the original)"
echo "  Tables:     $TABLES"
echo "  Workflows:  $WORKFLOWS"
echo "  Credentials:$CREDS"
echo
echo "Compare those counts with the live stack, open a workflow, and run a credential 'Test'."
echo "Remember: active workflows in this copy are live. When finished, remove it with:"
echo "  docker compose -p $PROJECT -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" down -v"
