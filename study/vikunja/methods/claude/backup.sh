#!/usr/bin/env bash
# Back up the Vikunja stack (compose project "study-vikunja") into ./backups/.
#
# Produces one file: backups/vikunja-<UTC timestamp>.tar.gz containing
#   db.dump              pg_dump custom-format dump of the "vikunja" database
#   files.tar            everything in the vikunja-files volume (/app/vikunja/files, i.e. task attachments, avatars)
#   docker-compose.yml   the compose file the stack was running with (so restore uses the same image tags)
#   MANIFEST             what/when/which versions, plus row counts for later comparison
#
# The stack is NOT stopped: pg_dump takes a consistent snapshot of the database.
# Attachments are copied right after, so a file uploaded in that short gap can be
# in files.tar without a DB row (harmless). Stop vikunja first if you want it exact.
#
# Usage: ./backup.sh
set -euo pipefail

# Git Bash on Windows rewrites arguments like /app/... into C:/Program Files/Git/app/...; stop that.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

PROJECT="${VIKUNJA_PROJECT:-study-vikunja}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
COMPOSE_FILE="../../docker-compose.yml"
BACKUP_DIR="./backups"

die() { echo "backup: ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"
[ -f "$COMPOSE_FILE" ] || die "compose file not found at $HERE/$COMPOSE_FILE"

dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

# The database container must be running, otherwise there is nothing to dump.
if [ -z "$(dc ps --status running -q db)" ]; then
  die "db container of project '$PROJECT' is not running (start it: docker compose -p $PROJECT -f $COMPOSE_FILE up -d)"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
WORK="$(mktemp -d "$BACKUP_DIR/.work-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

echo "backup: dumping database..."
# Credentials come from the container's own environment; nothing is hard-coded here.
dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d vikunja -Fc' > "$WORK/db.dump"
[ -s "$WORK/db.dump" ] || die "database dump is empty"
# Prove the dump is readable before trusting it.
dc exec -T db pg_restore -l < "$WORK/db.dump" > "$WORK/db.toc" || die "database dump failed validation"
[ -s "$WORK/db.toc" ] || die "database dump has no table of contents"

echo "backup: archiving files volume..."
# One-shot container that mounts the vikunja-files volume (works even if vikunja itself is stopped).
dc run --rm --no-deps -T --entrypoint tar files-perms -C /app/vikunja/files -cf - . > "$WORK/files.tar"
tar -tf "$WORK/files.tar" >/dev/null || die "files archive failed validation"

cp "$COMPOSE_FILE" "$WORK/docker-compose.yml"

echo "backup: recording row counts..."
COUNTS="$(dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d vikunja -At -c "
select '"'"'users='"'"'||count(*) from users union all
select '"'"'projects='"'"'||count(*) from projects union all
select '"'"'tasks='"'"'||count(*) from tasks union all
select '"'"'labels='"'"'||count(*) from labels"' 2>/dev/null || echo "counts=unavailable")"
IMAGE="$(grep -E '^\s*image:\s*vikunja/' "$COMPOSE_FILE" | head -1 | awk '{print $2}')"
{
  echo "created_utc=$TS"
  echo "compose_project=$PROJECT"
  echo "vikunja_image=$IMAGE"
  echo "format=1"
  echo "$COUNTS"
} > "$WORK/MANIFEST"

OUT="$BACKUP_DIR/vikunja-$TS.tar.gz"
tar -czf "$OUT.partial" -C "$WORK" db.dump files.tar docker-compose.yml MANIFEST
tar -tzf "$OUT.partial" >/dev/null || die "final archive failed validation"
mv "$OUT.partial" "$OUT"

echo
echo "backup: done -> $HERE/$OUT ($(du -h "$OUT" | cut -f1))"
sed 's/^/  /' "$WORK/MANIFEST"
echo
echo "Copy this file somewhere off this machine too; a backup on the same disk won't survive losing the disk."
