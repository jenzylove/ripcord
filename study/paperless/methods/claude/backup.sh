#!/usr/bin/env bash
# Back up the Paperless-ngx stack (compose project: study-paperless) into ./backups/.
#
# A backup is a directory ./backups/paperless-<UTC timestamp>/ containing:
#   db.dump          pg_dump (custom format) of the "paperless" database
#   data.tar.gz      the "data" volume  (search index, classifier model, logs)
#   media.tar.gz     the "media" volume (your original + archived documents, thumbnails)
#   docker-compose.yml  the compose file in use at backup time (pins the image versions)
#   SHA256SUMS       checksums, verified by restore.sh
#
# The webserver is stopped for the few moments it takes to copy the files so the
# database and the document files agree with each other, then it is started again.
# The "export" and "consume" volumes are not backed up (export is output only,
# consume is an inbox of files not yet imported).
#
# Usage: ./backup.sh
set -euo pipefail

PROJECT="${PROJECT:-study-paperless}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../../docker-compose.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/backups}"

# Image used only to run tar against volumes. Already pulled because the stack uses it.
TAR_IMAGE="docker.io/library/postgres:18"

export MSYS_NO_PATHCONV=1   # keep Git Bash on Windows from rewriting /paths inside docker args

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$COMPOSE_FILE" ] || die "compose file not found: $COMPOSE_FILE"
command -v docker >/dev/null || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "cannot talk to the Docker daemon"

# Find the real volume name for a compose volume key (data, media, ...).
volume_name() {
  local v
  v="$(docker volume ls -q \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.volume=$1")"
  [ -n "$v" ] || die "volume '$1' of project '$PROJECT' not found (is the stack set up?)"
  [ "$(printf '%s\n' "$v" | wc -l)" -eq 1 ] || die "more than one volume matches '$1': $v"
  printf '%s' "$v"
}

# The database must be running to be dumped.
[ -n "$(dc ps --status running -q db)" ] || die "the db service of '$PROJECT' is not running; start the stack first"

DATA_VOL="$(volume_name data)"
MEDIA_VOL="$(volume_name media)"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_ROOT/paperless-$STAMP"
WORK="$BACKUP_ROOT/.paperless-$STAMP.partial"
[ ! -e "$FINAL" ] || die "$FINAL already exists"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT" 2>/dev/null || true
mkdir "$WORK"

WAS_RUNNING=""
[ -n "$(dc ps --status running -q webserver)" ] && WAS_RUNNING=1

cleanup() {
  local rc=$?
  if [ -n "$WAS_RUNNING" ]; then
    echo "Starting webserver again..."
    dc start webserver >/dev/null || echo "WARNING: could not restart webserver; run: docker compose -p $PROJECT start webserver" >&2
  fi
  if [ $rc -ne 0 ]; then
    rm -rf "$WORK"
    echo "Backup FAILED (exit $rc); partial backup removed." >&2
  fi
}
trap cleanup EXIT

if [ -n "$WAS_RUNNING" ]; then
  echo "Stopping webserver so files and database are consistent..."
  dc stop webserver >/dev/null
fi

echo "Dumping database..."
dc exec -T db pg_dump -U paperless -d paperless -Fc > "$WORK/db.dump"
[ -s "$WORK/db.dump" ] || die "database dump is empty"

for pair in "data:$DATA_VOL" "media:$MEDIA_VOL"; do
  key="${pair%%:*}"; vol="${pair#*:}"
  echo "Archiving volume '$key' ($vol)..."
  docker run --rm -i -v "$vol":/src:ro "$TAR_IMAGE" tar czf - -C /src . > "$WORK/$key.tar.gz"
  # Make sure the archive is readable end to end.
  gzip -t "$WORK/$key.tar.gz" || die "archive $key.tar.gz is corrupt"
done

cp "$COMPOSE_FILE" "$WORK/docker-compose.yml"

( cd "$WORK" && sha256sum db.dump data.tar.gz media.tar.gz docker-compose.yml > SHA256SUMS )
chmod -R go-rwx "$WORK" 2>/dev/null || true

mv "$WORK" "$FINAL"
echo
echo "Backup complete: $FINAL"
du -sh "$FINAL" | cut -f1 | sed 's/^/Size: /'
echo "Restore it as a copy with: $SCRIPT_DIR/restore.sh \"$FINAL\" <project-name> <port>"
echo "Note: the backup contains your secret key and admin password (from the compose file). Keep it private."
