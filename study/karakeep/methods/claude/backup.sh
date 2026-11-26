#!/usr/bin/env bash
# backup.sh - back up the Karakeep stack (compose project: study-karakeep)
#
# Usage: ./backup.sh
# Output: ./backups/karakeep-<project>-<UTC timestamp>.tar.gz
#
# What is saved:
#   - the `data` volume        (SQLite database + all saved assets/screenshots)
#   - the `meilisearch` volume (search index; rebuildable, but saved for a faithful copy)
#   - .env                     (NEXTAUTH_SECRET, MEILI_MASTER_KEY, pinned version)
#   - docker-compose.yml
#
# To get a consistent copy of the live SQLite DB, `web` and `meilisearch` are
# stopped for the few seconds the volumes are read, then started again
# (also on error or Ctrl-C).
#
# NOTE: the archive contains your .env secrets. It is created with mode 600;
# keep it somewhere private.
set -euo pipefail

PROJECT="${KARAKEEP_PROJECT:-study-karakeep}"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/backups"

# Git Bash on Windows rewrites paths that look like /data; we only use
# stdin/stdout streaming, but keep conversion off to be safe.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

die() { echo "ERROR: $*" >&2; exit 1; }
dc()  { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --project-directory "$COMPOSE_DIR" "$@"; }

command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"
[ -f "$COMPOSE_FILE" ] || die "missing $COMPOSE_FILE"
[ -f "$ENV_FILE" ]     || die "missing $ENV_FILE"

for vol in data meilisearch; do
  docker volume inspect "${PROJECT}_${vol}" >/dev/null 2>&1 \
    || die "volume ${PROJECT}_${vol} not found - is the project name '$PROJECT' right?"
done

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/karakeep-${PROJECT}-${TS}.tar.gz"
mkdir -p "$BACKUP_DIR"
STAGE="$(mktemp -d "$BACKUP_DIR/.stage.XXXXXX")"

# Remember which services were running so we only restart those.
RUNNING="$(dc ps --status running --services 2>/dev/null || true)"
RESTART=()
for svc in web meilisearch; do
  if printf '%s\n' "$RUNNING" | grep -qx "$svc"; then RESTART+=("$svc"); fi
done

restart_services() {
  if [ "${#RESTART[@]}" -gt 0 ]; then
    echo "==> Starting ${RESTART[*]} again"
    dc start "${RESTART[@]}" >/dev/null || echo "WARNING: failed to restart ${RESTART[*]} - run: docker compose -p $PROJECT start" >&2
    RESTART=()
  fi
}
cleanup() {
  restart_services
  rm -rf "$STAGE"
}
trap cleanup EXIT
trap 'echo "Interrupted" >&2; exit 130' INT TERM

if [ "${#RESTART[@]}" -gt 0 ]; then
  echo "==> Stopping ${RESTART[*]} for a consistent snapshot"
  dc stop "${RESTART[@]}" >/dev/null
fi

for vol in data meilisearch; do
  echo "==> Archiving volume ${PROJECT}_${vol}"
  docker run --rm -v "${PROJECT}_${vol}:/v:ro" "$HELPER_IMAGE" \
    tar -C /v -cf - . > "$STAGE/${vol}.tar"
  # Fail loudly on an empty/corrupt archive.
  tar -tf "$STAGE/${vol}.tar" >/dev/null || die "archive of volume ${vol} is unreadable"
done

# Data is captured; services can come back before we package.
restart_services

cp "$COMPOSE_FILE" "$STAGE/docker-compose.yml"
cp "$ENV_FILE"     "$STAGE/env"

cat > "$STAGE/MANIFEST.txt" <<EOF
karakeep backup
created_utc=$TS
source_project=$PROJECT
volumes=data,meilisearch
EOF

( cd "$STAGE" && sha256sum data.tar meilisearch.tar docker-compose.yml env MANIFEST.txt > SHA256SUMS )

echo "==> Writing $OUT"
umask 077
tar -C "$STAGE" -czf "$OUT" data.tar meilisearch.tar docker-compose.yml env MANIFEST.txt SHA256SUMS
chmod 600 "$OUT"

# Verify the final archive is readable and complete.
tar -tzf "$OUT" >/dev/null || die "final archive failed verification: $OUT"

echo
echo "Backup complete: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Contains secrets from .env - keep it private. Test it with:"
echo "  ./restore.sh \"$OUT\" karakeep-check 9943"
