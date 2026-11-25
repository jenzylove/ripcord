#!/usr/bin/env bash
# Restore a backup made by backup.sh into a brand new, separate copy of the stack.
# The live stack (study-mealie) is never touched, so you can check the restore first.
#
# Usage: bash restore.sh <backup-file> <new-project-name> <port>
#   e.g. bash restore.sh backups/mealie-backup-20261125-120000.tar.gz study-mealie-check 9962
#
# Creates a copy of ../../docker-compose.yml in ./restored/<project-name>/ with the
# port changed, brings up Postgres, loads the database and the data volume, then
# starts Mealie on http://localhost:<port>.
#
# To throw the copy away afterwards:
#   docker compose -p <project-name> -f restored/<project-name>/docker-compose.yml down -v
set -euo pipefail

export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

LIVE_PROJECT="study-mealie"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_COMPOSE="$(cd "$SCRIPT_DIR/../.." && pwd)/docker-compose.yml"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "==> $*"; }

[ $# -eq 3 ] || die "usage: bash restore.sh <backup-file> <new-project-name> <port>"
BACKUP_ARG="$1"
PROJECT="$2"
PORT="$3"

# ---- validate arguments --------------------------------------------------
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] \
  || die "project name must be lowercase letters, digits, '-' or '_' (and start with a letter or digit)"
[ "$PROJECT" != "$LIVE_PROJECT" ] \
  || die "refusing to restore over the live project '$LIVE_PROJECT' - pick a different name"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] \
  || die "port must be a number between 1 and 65535"

if [ -f "$BACKUP_ARG" ]; then
  BACKUP="$BACKUP_ARG"
elif [ -f "$SCRIPT_DIR/backups/$BACKUP_ARG" ]; then
  BACKUP="$SCRIPT_DIR/backups/$BACKUP_ARG"
else
  die "backup file not found: $BACKUP_ARG"
fi
BACKUP="$(cd "$(dirname "$BACKUP")" && pwd)/$(basename "$BACKUP")"

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "docker daemon is not running"
[ -f "$SOURCE_COMPOSE" ] || die "compose file not found: $SOURCE_COMPOSE"

# ---- make sure we will not clobber anything ------------------------------
if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ] \
   || [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  die "a compose project named '$PROJECT' already has containers or volumes. Pick another name, or remove it first: docker compose -p $PROJECT down -v"
fi
if docker ps --format '{{.Ports}}' | grep -Eq "(^|[ ,])[^ ,]*:${PORT}->"; then
  die "port $PORT is already published by another container"
fi

# ---- unpack and check the backup -----------------------------------------
STAGE="$(mktemp -d "$SCRIPT_DIR/.restore-staging.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

log "Unpacking $BACKUP"
tar -xzf "$BACKUP" -C "$STAGE" || die "could not unpack the backup"
for f in db.dump mealie-data.tar MANIFEST.txt; do
  [ -s "$STAGE/$f" ] || die "backup is missing $f - not a backup made by backup.sh?"
done
tar -tf "$STAGE/mealie-data.tar" >/dev/null || die "mealie-data.tar in the backup is corrupt"

# Warn if the compose file now uses a different Mealie version than the backup
BACKUP_MEALIE="$(sed -n 's/^mealie_image=//p' "$STAGE/MANIFEST.txt")"
COMPOSE_MEALIE="$(sed -n 's/^[[:space:]]*image:[[:space:]]*\(ghcr.io\/mealie-recipes\/mealie[^[:space:]]*\).*/\1/p' "$SOURCE_COMPOSE" | head -n1)"
if [ -n "$BACKUP_MEALIE" ] && [ "$BACKUP_MEALIE" != "$COMPOSE_MEALIE" ]; then
  echo "WARNING: backup was made with $BACKUP_MEALIE but the compose file now uses $COMPOSE_MEALIE." >&2
  echo "         Mealie upgrades the database on start; a newer version is usually fine, an older one is not." >&2
fi

# ---- build the compose file for the copy ---------------------------------
OUT_DIR="$SCRIPT_DIR/restored/$PROJECT"
mkdir -p "$OUT_DIR"
COMPOSE_FILE="docker-compose.yml"
sed -E \
  -e "s/\"[0-9]+:9000\"/\"${PORT}:9000\"/" \
  -e "s#(BASE_URL:[[:space:]]*http://localhost:)[0-9]+#\1${PORT}#" \
  "$SOURCE_COMPOSE" > "$OUT_DIR/$COMPOSE_FILE"
grep -q "\"${PORT}:9000\"" "$OUT_DIR/$COMPOSE_FILE" \
  || die "could not set the port in the generated compose file (is the ports line still \"<port>:9000\"?)"

dc() { (cd "$OUT_DIR" && docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"); }

# ---- bring up the new stack ----------------------------------------------
log "Creating containers and volumes for project '$PROJECT'"
dc up --no-start >/dev/null

PG_CID="$(dc ps -aq postgres)"
HELPER_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PG_CID")"
DATA_VOLUME="${PROJECT}_mealie-data"
docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 || die "expected volume $DATA_VOLUME was not created"

log "Starting a fresh Postgres"
dc up -d --wait postgres >/dev/null

log "Restoring the database"
dc exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" --no-owner --exit-on-error' \
  < "$STAGE/db.dump"

log "Restoring the mealie-data volume"
docker run --rm -i -v "$DATA_VOLUME:/data" --entrypoint tar "$HELPER_IMAGE" \
  -C /data --numeric-owner -xf - < "$STAGE/mealie-data.tar"

log "Starting Mealie on port $PORT"
dc up -d mealie >/dev/null

# ---- wait for it to answer -----------------------------------------------
URL="http://localhost:${PORT}"
if command -v curl >/dev/null 2>&1; then
  log "Waiting for $URL (up to 3 minutes)"
  ok=0
  for _ in $(seq 1 36); do
    if curl -fsS -o /dev/null "$URL/api/app/about" 2>/dev/null; then ok=1; break; fi
    sleep 5
  done
  [ "$ok" = "1" ] || die "Mealie did not answer in time. Check: docker compose -p $PROJECT -f $OUT_DIR/$COMPOSE_FILE logs mealie"
fi

echo
echo "Restore complete. The copy is running at $URL"
echo "Log in with your usual account and check your recipes."
echo "Logs:   docker compose -p $PROJECT -f \"$OUT_DIR/$COMPOSE_FILE\" logs -f mealie"
echo "Remove: docker compose -p $PROJECT -f \"$OUT_DIR/$COMPOSE_FILE\" down -v"
