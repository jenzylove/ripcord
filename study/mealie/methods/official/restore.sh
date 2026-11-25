#!/usr/bin/env bash
# Usage: restore.sh <backup.zip> <project-name> <port>
# Starts a NEW, empty Mealie stack and restores the backup into it through the official
# restore feature (upload the zip on /admin/backups, then Restore).
set -euo pipefail
cd "$(dirname "$0")"
BACKUP="$1"; PROJECT="$2"; PORT="$3"
COMPOSE_SRC="../../docker-compose.yml"
COPY="copy-$PROJECT.compose.yml"
sed "s/9961/$PORT/g" "$COMPOSE_SRC" > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d
URL="http://localhost:$PORT"
for i in $(seq 1 60); do curl -sf "$URL/api/app/about" >/dev/null && break; sleep 4; done
# a fresh Mealie has only the default admin
TOKEN=$(curl -sf -X POST "$URL/api/auth/token" -d "username=changeme@example.com&password=MyPassword" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
NAME=$(basename "$BACKUP")
curl -sf -X POST "$URL/api/admin/backups/upload" -H "Authorization: Bearer $TOKEN" -F "archive=@$BACKUP;filename=$NAME" >/dev/null
curl -sf -X POST "$URL/api/admin/backups/$NAME/restore" -H "Authorization: Bearer $TOKEN"
echo; echo "restored into $PROJECT on $URL"
