#!/usr/bin/env bash
# backup.sh - back up the study-n8n stack into ./backups/<timestamp>/
#
# Each backup directory contains:
#   db.dump           pg_dump custom-format dump of the n8n Postgres database
#   n8n_storage.tgz   the /home/node/.n8n volume (holds the encryption key that
#                     decrypts your saved credentials - the DB is useless without it)
#   env.backup        copy of the compose .env (secrets! the directory is mode 700)
#   MANIFEST.txt      n8n version, timestamp, and sha256 checksums
#
# Usage: ./backup.sh        (the stack must be running)
set -euo pipefail

# Stop Git Bash on Windows from rewriting /paths passed to docker.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

PROJECT="study-n8n"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$HERE/../../docker-compose.yml"
ENV_FILE="$HERE/../../.env"
BACKUP_ROOT="$HERE/backups"

[ -f "$COMPOSE_FILE" ] || { echo "ERROR: $COMPOSE_FILE not found" >&2; exit 1; }
[ -f "$ENV_FILE" ]     || { echo "ERROR: $ENV_FILE not found" >&2; exit 1; }

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
TMP="$BACKUP_ROOT/.incomplete-$STAMP"

umask 077
mkdir -p "$TMP"
# Remove half-written backups if anything fails.
trap 'rc=$?; if [ $rc -ne 0 ]; then rm -rf "$TMP"; echo "BACKUP FAILED - nothing kept." >&2; fi' EXIT

# Postgres must be up to dump it.
PG_CID="$(dc ps -q postgres || true)"
if [ -z "$PG_CID" ] || [ "$(docker inspect -f '{{.State.Running}}' "$PG_CID")" != "true" ]; then
  echo "ERROR: postgres container of project '$PROJECT' is not running. Start it with: docker compose -p $PROJECT up -d" >&2
  exit 1
fi

# Locate the n8n config volume and a helper image to tar it (reuse the postgres image: already pulled).
N8N_CID="$(dc ps -aq n8n || true)"
[ -n "$N8N_CID" ] || { echo "ERROR: n8n container not found in project '$PROJECT'" >&2; exit 1; }
STORAGE_VOL="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Name}}{{end}}{{end}}' "$N8N_CID")"
[ -n "$STORAGE_VOL" ] || { echo "ERROR: could not find the n8n_storage volume" >&2; exit 1; }
HELPER_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PG_CID")"
N8N_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$N8N_CID")"

echo "==> Dumping Postgres database"
# Credentials come from the container's own environment; nothing secret on this command line.
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$TMP/db.dump"
[ -s "$TMP/db.dump" ] || { echo "ERROR: db.dump is empty" >&2; exit 1; }

echo "==> Archiving n8n storage volume ($STORAGE_VOL)"
docker run --rm -v "$STORAGE_VOL":/data:ro "$HELPER_IMAGE" tar -C /data -czf - . > "$TMP/n8n_storage.tgz"
tar -tzf "$TMP/n8n_storage.tgz" >/dev/null   # sanity: archive is readable

echo "==> Saving .env"
cp "$ENV_FILE" "$TMP/env.backup"

echo "==> Verifying the dump is readable"
dc exec -T postgres pg_restore -l < "$TMP/db.dump" >/dev/null

{
  echo "created:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "project:  $PROJECT"
  echo "n8n:      $N8N_IMAGE"
  echo "postgres: $HELPER_IMAGE"
  echo
  echo "sha256:"
  ( cd "$TMP" && sha256sum db.dump n8n_storage.tgz env.backup )
} > "$TMP/MANIFEST.txt"

mv "$TMP" "$DEST"
chmod 700 "$DEST"
trap - EXIT

echo
echo "Backup complete: $DEST"
ls -lh "$DEST"
echo
echo "Copy this directory off the machine too - it contains your encryption key and .env secrets."
