#!/usr/bin/env bash
# Usage: restore.sh <dump.zip> <project-name> <port>
# New compose project with an empty Vikunja, then `vikunja restore <zip>` inside its container (official docs).
set -euo pipefail
cd "$(dirname "$0")"
ZIP="$1"; PROJECT="$2"; PORT="$3"
COPY="copy-$PROJECT.compose.yml"
sed "s/9962/$PORT/g" ../../docker-compose.yml > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d --wait
C=$(docker compose -p "$PROJECT" -f "$COPY" ps -q vikunja)
docker cp "$ZIP" "$C:/tmp/restore.zip"
printf 'Yes, I understand

' | docker exec -i "$C" /app/vikunja/vikunja restore /tmp/restore.zip
echo "restored into $PROJECT on http://localhost:$PORT"
