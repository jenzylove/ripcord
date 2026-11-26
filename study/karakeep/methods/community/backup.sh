#!/usr/bin/env bash
# Community method (selfhosting.sh guide): stop the stack, tar the data and meilisearch volumes, start again.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
LIVE="${LIVE_PROJECT:-study-karakeep}"
COMPOSE="docker compose -p $LIVE -f $HERE/../../docker-compose.yml"
OUT="$HERE/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
$COMPOSE down
docker run --rm -v "${LIVE}_data:/data" alpine tar -czf - /data > "$OUT/karakeep-data.tar.gz"
docker run --rm -v "${LIVE}_meilisearch:/meili_data" alpine tar -czf - /meili_data > "$OUT/karakeep-meilisearch.tar.gz"
$COMPOSE up -d
ls -l "$OUT"
echo "BACKUP=$OUT"
