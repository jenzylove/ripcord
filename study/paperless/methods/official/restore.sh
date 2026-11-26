#!/usr/bin/env bash
# Usage: restore.sh <export.zip> <project-name> <port>
# New compose project with an EMPTY Paperless (docs: the importer must run against a completely empty installation,
# so the admin bootstrap variables are removed from the copy), then document_importer on the zip.
set -euo pipefail
cd "$(dirname "$0")"
ZIP="$1"; PROJECT="$2"; PORT="$3"
COPY="copy-$PROJECT.compose.yml"
sed -e "s/9963/$PORT/g" -e '/PAPERLESS_ADMIN_/d' ../../docker-compose.yml > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d --wait
C=$(docker compose -p "$PROJECT" -f "$COPY" ps -q webserver)
docker cp "$ZIP" "$C:/usr/src/paperless/export/restore.zip"
docker compose -p "$PROJECT" -f "$COPY" exec -T webserver document_importer ../export/restore.zip --no-progress-bar
echo "restored into $PROJECT on http://localhost:$PORT"
