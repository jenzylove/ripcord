#!/usr/bin/env bash
# Official Mealie method: the built-in backup feature (Admin > Backups), driven through its API.
set -euo pipefail
cd "$(dirname "$0")"
URL="${LIVE_URL:-http://localhost:9961}"
EMAIL="${MEALIE_EMAIL:-study@example.com}"; PASS="${MEALIE_PASSWORD:-StudyPass123!}"
mkdir -p backups
TOKEN=$(curl -sf -X POST "$URL/api/auth/token" -d "username=$EMAIL&password=$PASS" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
# create the backup (same as the "Create" button on /admin/backups)
curl -sf -X POST "$URL/api/admin/backups" -H "Authorization: Bearer $TOKEN" >/dev/null
NAME=$(curl -sf "$URL/api/admin/backups" -H "Authorization: Bearer $TOKEN" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0)); j.imports.map(i=>i.name).sort().pop()')
# download it (same as the "Download" button)
FT=$(curl -sf "$URL/api/admin/backups/$NAME" -H "Authorization: Bearer $TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).fileToken')
curl -sf "$URL/api/utils/download?token=$FT" -o "backups/$NAME"
echo "backup written: backups/$NAME"
