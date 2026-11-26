#!/usr/bin/env bash
# Usage: restore.sh <backup-dir> <new-project-name> <port>
# The guide has no restore text; this unpacks the two archives into the volumes of a NEW project and starts it.
set -euo pipefail
export MSYS_NO_PATHCONV=1
BK="$1"; PROJECT="$2"; PORT="$3"
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
export HOST_PORT="$PORT"
COMPOSE="docker compose -p $PROJECT -f $HERE/../../docker-compose.yml"
$COMPOSE create
docker run --rm -i -v "${PROJECT}_data:/data" alpine tar -xzf - -C / < "$BK/karakeep-data.tar.gz"
docker run --rm -i -v "${PROJECT}_meilisearch:/meili_data" alpine tar -xzf - -C / < "$BK/karakeep-meilisearch.tar.gz"
$COMPOSE up -d
echo "restored into $PROJECT on port $PORT"
