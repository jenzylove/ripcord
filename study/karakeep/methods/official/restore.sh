#!/usr/bin/env bash
# Usage: restore.sh <backup-dir> <new-project-name> <port>
# Official migration guide (docs/06-administration/06-server-migration): `karakeep migrate` from the source server to a new one.
# Needs the source server running (SRC_URL, default http://localhost:9942).
set -euo pipefail
export MSYS_NO_PATHCONV=1
BK="$1"; PROJECT="$2"; PORT="$3"
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
export HOST_PORT="$PORT"
SRC="${SRC_URL:-http://localhost:9942}"; EMAIL="${KK_EMAIL:-study@example.com}"; PASSWORD="${KK_PASSWORD:-StudyPass#2026}"
COMPOSE="docker compose -p $PROJECT -f $HERE/../../docker-compose.yml"
$COMPOSE up -d
until curl -sf "http://localhost:$PORT/api/health" >/dev/null || curl -sf -o /dev/null "http://localhost:$PORT/"; do sleep 3; done
sleep 5
DEST="http://localhost:$PORT"
# destination needs an account and an API key (the guide: "Collect API keys and base URLs for both servers")
curl -sf -X POST "$DEST/api/trpc/users.create" -H 'content-type: application/json' -d "{\"json\":{\"name\":\"Study Owner\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"confirmPassword\":\"$PASSWORD\"}}" >/dev/null
key() { curl -sf -X POST "$1/api/trpc/apiKeys.exchange" -H 'content-type: application/json' -d "{\"json\":{\"keyName\":\"migrate\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.data.json.key))'; }
SK=$(key "$SRC"); DK=$(key "$DEST")
docker run --rm ghcr.io/karakeep-app/karakeep-cli:release --server-addr "${SRC/localhost/host.docker.internal}" --api-key "$SK" migrate --dest-server "http://host.docker.internal:$PORT" --dest-api-key "$DK" --yes
echo "restored into $PROJECT on port $PORT"
