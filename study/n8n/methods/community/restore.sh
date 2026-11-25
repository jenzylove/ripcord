#!/usr/bin/env bash
# Usage: restore.sh <backup-dir> <new-project-name> <port>
# Community restore: start a fresh n8n, then import:workflow / import:credentials --separate. NEW project and port.
set -euo pipefail
export MSYS_NO_PATHCONV=1
BK="$1"; PROJECT="$2"; PORT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
export HOST_PORT="$PORT"
COMPOSE="docker compose -p $PROJECT -f $HERE/../../docker-compose.yml"
$COMPOSE up -d --wait postgres
$COMPOSE up -d n8n
until curl -sf "http://localhost:$PORT/healthz" >/dev/null; do sleep 2; done
$COMPOSE exec -T n8n sh -c 'rm -rf /tmp/bk && mkdir -p /tmp && tar xf - -C /tmp' < "$BK/n8n-export.tar"
$COMPOSE exec -T n8n n8n import:workflow --separate --input=/tmp/bk/workflows/
$COMPOSE exec -T n8n n8n import:credentials --separate --input=/tmp/bk/credentials/
$COMPOSE restart n8n
echo "restored into $PROJECT on port $PORT"
