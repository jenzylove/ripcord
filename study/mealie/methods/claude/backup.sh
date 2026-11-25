#!/usr/bin/env bash
# Back up the study-mealie stack into ./backups/ (next to this script).
#
# What goes in the backup (one .tar.gz file):
#   db.dump         pg_dump (custom format) of the Mealie Postgres database
#   mealie-data.tar the whole mealie-data volume (recipe images, assets, mealie's own backups)
#   MANIFEST.txt    when/what was backed up, image versions
#
# Mealie is stopped for the few seconds the backup takes so the database and the
# data volume are captured at the same moment, then started again.
#
# Usage: bash backup.sh
set -euo pipefail

# Git Bash on Windows rewrites arguments like /data into C:/Program Files/Git/data.
# This stops that; it does nothing on Linux/macOS.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

PROJECT="study-mealie"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="$SCRIPT_DIR/backups"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "==> $*"; }

# docker compose against the live stack (run from the compose dir so paths stay relative)
dc() { (cd "$COMPOSE_DIR" && docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"); }

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "docker daemon is not running"
[ -f "$COMPOSE_DIR/$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_DIR/$COMPOSE_FILE"

PG_CID="$(dc ps -q postgres)"
[ -n "$PG_CID" ] || die "postgres container of project '$PROJECT' not found"
[ "$(docker inspect -f '{{.State.Running}}' "$PG_CID")" = "true" ] \
  || die "postgres container is not running - start the stack first"

DATA_VOLUME="${PROJECT}_mealie-data"
docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 || die "volume $DATA_VOLUME not found"

# Reuse the postgres image for the helper container so nothing new has to be pulled.
HELPER_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PG_CID")"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FINAL="$BACKUP_DIR/mealie-backup-$STAMP.tar.gz"
STAGE="$(mktemp -d "$BACKUP_DIR/.staging.XXXXXX")"

MEALIE_WAS_RUNNING=0
if [ -n "$(dc ps -q --status running mealie)" ]; then
  MEALIE_WAS_RUNNING=1
fi

cleanup() {
  rc=$?
  rm -rf "$STAGE"
  if [ "$MEALIE_WAS_RUNNING" = "1" ]; then
    log "Starting mealie again"
    dc start mealie >/dev/null || echo "WARNING: could not restart mealie - run: docker compose -p $PROJECT start mealie" >&2
  fi
  if [ $rc -ne 0 ]; then
    rm -f "$FINAL.partial"
    echo "BACKUP FAILED (exit $rc)" >&2
  fi
}
trap cleanup EXIT

if [ "$MEALIE_WAS_RUNNING" = "1" ]; then
  log "Stopping mealie briefly for a consistent snapshot"
  dc stop mealie >/dev/null
fi

log "Dumping the database"
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" -Fc' > "$STAGE/db.dump"
[ -s "$STAGE/db.dump" ] || die "database dump is empty"
# Check the dump is readable (lists its table of contents)
dc exec -T postgres pg_restore --list < "$STAGE/db.dump" >/dev/null || die "database dump failed verification"

log "Archiving the mealie-data volume"
docker run --rm -v "$DATA_VOLUME:/data:ro" --entrypoint tar "$HELPER_IMAGE" \
  -C /data --numeric-owner -cf - . > "$STAGE/mealie-data.tar"
[ -s "$STAGE/mealie-data.tar" ] || die "data archive is empty"
tar -tf "$STAGE/mealie-data.tar" >/dev/null || die "data archive failed verification"

{
  echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "project=$PROJECT"
  echo "mealie_image=$(docker inspect -f '{{.Config.Image}}' "$(dc ps -aq mealie)")"
  echo "postgres_image=$HELPER_IMAGE"
  echo "data_volume=$DATA_VOLUME"
} > "$STAGE/MANIFEST.txt"

log "Writing $FINAL"
tar -C "$STAGE" -czf "$FINAL.partial" db.dump mealie-data.tar MANIFEST.txt
tar -tzf "$FINAL.partial" >/dev/null || die "final archive failed verification"
mv "$FINAL.partial" "$FINAL"

echo
echo "Backup complete: $FINAL ($(du -h "$FINAL" | cut -f1))"
echo "Copy it somewhere off this machine too - a backup on the same disk is not much protection."
