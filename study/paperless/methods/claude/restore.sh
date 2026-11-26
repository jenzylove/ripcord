#!/usr/bin/env bash
# Restore a backup made by backup.sh into a brand new copy of the stack, so you can
# check it without touching the live one.
#
# Usage: ./restore.sh <backup-dir> <project-name> <port>
#   backup-dir    a directory created by backup.sh (./backups/paperless-<timestamp>)
#   project-name  new compose project name, e.g. paperless-check (must not be study-paperless)
#   port          host port for the copy's web UI, e.g. 9964
#
# The copy gets its own containers and its own volumes (named <project-name>_*).
# Nothing of the original stack is read or changed. To remove the copy afterwards:
#   docker compose -p <project-name> -f <backup-dir>/docker-compose.yml down -v
# (run it against the "restored" compose file printed at the end)
set -euo pipefail

ORIGINAL_PROJECT="${ORIGINAL_PROJECT:-study-paperless}"
TAR_IMAGE="docker.io/library/postgres:18"

export MSYS_NO_PATHCONV=1

die() { echo "ERROR: $*" >&2; exit 1; }

[ $# -eq 3 ] || { echo "Usage: $0 <backup-dir> <project-name> <port>" >&2; exit 2; }
BACKUP="${1%/}"; PROJECT="$2"; PORT="$3"

command -v docker >/dev/null || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "cannot talk to the Docker daemon"

# ---- validate arguments ----
[ -d "$BACKUP" ] || die "backup directory not found: $BACKUP"
BACKUP="$(cd "$BACKUP" && pwd)"
for f in db.dump data.tar.gz media.tar.gz docker-compose.yml SHA256SUMS; do
  [ -f "$BACKUP/$f" ] || die "backup is incomplete, missing $f"
done

[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "project name must be lowercase letters, digits, - or _"
[ "$PROJECT" != "$ORIGINAL_PROJECT" ] || die "project name must differ from the live project '$ORIGINAL_PROJECT'"

[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "port must be a number between 1 and 65535"
ORIG_PORT="$(grep -oE '"[0-9]+:8000"' "$BACKUP/docker-compose.yml" | head -n1 | tr -dc '0-9:' | cut -d: -f1)"
[ "$PORT" != "$ORIG_PORT" ] || die "port $PORT is the live stack's port; choose another"

# Refuse to reuse an existing project: its volumes would be overwritten or mixed in.
if [ -n "$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT")" ] || \
   [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  die "a compose project named '$PROJECT' already exists (containers or volumes); pick a new name or remove it first"
fi
# Port already taken on the host?
if docker ps --format '{{.Ports}}' | grep -qE "(:|^)$PORT->"; then
  die "port $PORT is already published by another container"
fi

# ---- verify the backup ----
echo "Verifying checksums..."
( cd "$BACKUP" && sha256sum -c --quiet SHA256SUMS ) || die "checksum mismatch; backup is damaged"

# ---- build the compose file for the copy ----
WORKDIR="$BACKUP/restored-$PROJECT"
mkdir -p "$WORKDIR"
COMPOSE_FILE="$WORKDIR/docker-compose.yml"
sed -e "s|\"$ORIG_PORT:8000\"|\"$PORT:8000\"|" \
    -e "s|http://localhost:$ORIG_PORT|http://localhost:$PORT|" \
    "$BACKUP/docker-compose.yml" > "$COMPOSE_FILE"
grep -q "\"$PORT:8000\"" "$COMPOSE_FILE" || die "could not set the port in the compose file"

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

failed() {
  local rc=$?
  if [ $rc -ne 0 ]; then
    echo >&2
    echo "Restore FAILED (exit $rc). The partial copy was left for inspection; remove it with:" >&2
    echo "  docker compose -p $PROJECT -f \"$COMPOSE_FILE\" down -v" >&2
  fi
}
trap failed EXIT

# ---- create containers and empty volumes, without starting anything ----
echo "Creating new stack '$PROJECT' (not started yet)..."
dc create >/dev/null

volume_name() {
  local v
  v="$(docker volume ls -q \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.volume=$1")"
  [ -n "$v" ] || die "volume '$1' of project '$PROJECT' was not created"
  printf '%s' "$v"
}

# ---- restore files ----
for key in data media; do
  vol="$(volume_name "$key")"
  echo "Restoring volume '$key' into $vol..."
  docker run --rm -i -v "$vol":/dst "$TAR_IMAGE" tar xzf - -C /dst < "$BACKUP/$key.tar.gz"
done

# ---- restore database ----
echo "Starting database and broker..."
dc up -d db broker >/dev/null

echo -n "Waiting for PostgreSQL"
for i in $(seq 1 90); do
  if dc exec -T db pg_isready -h 127.0.0.1 -U paperless -d paperless >/dev/null 2>&1; then
    echo " ready."; break
  fi
  echo -n "."; sleep 2
  [ "$i" -lt 90 ] || { echo; die "PostgreSQL did not become ready"; }
done

echo "Restoring database..."
dc exec -T db pg_restore -U paperless -d paperless --no-owner --exit-on-error < "$BACKUP/db.dump"

# ---- start the web app ----
echo "Starting webserver..."
dc up -d >/dev/null

echo -n "Waiting for http://localhost:$PORT"
UP=""
for i in $(seq 1 90); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null || true)"
  case "$code" in 200|301|302|401|403) UP=1; break;; esac
  echo -n "."; sleep 3
done
echo
[ -n "$UP" ] || die "the copy did not answer on port $PORT in time; check: docker compose -p $PROJECT -f \"$COMPOSE_FILE\" logs webserver"

trap - EXIT
echo
echo "Restored copy is running: http://localhost:$PORT   (project: $PROJECT)"
echo "Log in with the same credentials as the original stack, then check your documents."
echo "Remove the copy when done:"
echo "  docker compose -p $PROJECT -f \"$COMPOSE_FILE\" down -v"
