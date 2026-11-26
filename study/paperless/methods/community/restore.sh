#!/usr/bin/env bash
# Usage: restore.sh <backups-dir> <project-name> <port>
# New compose project: start db only, load the SQL, start the rest, copy the media folder in.
set -euo pipefail
cd "$(dirname "$0")"
DIR="${1%/}"; PROJECT="$2"; PORT="$3"
COPY="copy-$PROJECT.compose.yml"
sed -e "s/9963/$PORT/g" -e '/PAPERLESS_ADMIN_/d' ../../docker-compose.yml > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d db --wait
docker compose -p "$PROJECT" -f "$COPY" exec -T db psql -U paperless -d paperless < "$DIR/paperless-db.sql"
docker compose -p "$PROJECT" -f "$COPY" up -d --wait
C=$(docker compose -p "$PROJECT" -f "$COPY" ps -q webserver)
docker cp "$DIR/media/." "$C:/usr/src/paperless/media/"
docker compose -p "$PROJECT" -f "$COPY" exec -T --user root webserver chown -R paperless:paperless /usr/src/paperless/media
echo "restored into $PROJECT on http://localhost:$PORT"
