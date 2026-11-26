#!/usr/bin/env bash
# Official: Karakeep's built in full account backup (Settings > Backups, API POST /api/v1/backups), downloaded as a zip.
# The server migration guide (06-server-migration) needs the live source at restore time, see restore.sh.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
SRC="${SRC_URL:-http://localhost:9942}"; EMAIL="${KK_EMAIL:-study@example.com}"; PASSWORD="${KK_PASSWORD:-StudyPass#2026}"
OUT="$HERE/backups/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT"
KEY=$(curl -sf -X POST "$SRC/api/trpc/apiKeys.exchange" -H 'content-type: application/json' -d "{\"json\":{\"keyName\":\"backup\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.data.json.key))')
echo "$SRC" > "$OUT/source-url.txt"
BID=$(curl -sf -X POST "$SRC/api/v1/backups" -H "authorization: Bearer $KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))')
for i in $(seq 30); do
  ST=$(curl -sf "$SRC/api/v1/backups/$BID" -H "authorization: Bearer $KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).status))')
  [ "$ST" = success ] && break; sleep 2
done
echo "backup $BID status $ST"
curl -sf "$SRC/api/v1/backups/$BID/download" -H "authorization: Bearer $KEY" -o "$OUT/karakeep-backup.zip"
ls -l "$OUT"
echo "BACKUP=$OUT"
