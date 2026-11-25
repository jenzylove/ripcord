#!/usr/bin/env bash
# Usage: restore.sh <backup-dir> <new-project-name> <port>
# Official restore: restore the .n8n folder, restore the PostgreSQL database, start n8n. Targets a NEW compose project and port.
set -euo pipefail
export MSYS_NO_PATHCONV=1
BK="$1"; PROJECT="$2"; PORT="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"
export HOST_PORT="$PORT"
COMPOSE="docker compose -p $PROJECT -f $HERE/../../docker-compose.yml"
$COMPOSE up -d --wait postgres
$COMPOSE exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BK/n8n-db.sql" > /dev/null
$COMPOSE create n8n
docker run --rm -i -v "${PROJECT}_n8n_storage:/home/node" alpine tar xzf - -C /home/node < "$BK/n8n-folder.tar.gz"
$COMPOSE up -d n8n
echo "restored into $PROJECT on port $PORT"
