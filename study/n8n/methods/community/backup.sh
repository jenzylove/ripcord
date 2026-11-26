#!/usr/bin/env bash
# Community method: export workflows and credentials with the n8n CLI (--backup), as in popular guides.
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
LIVE="${LIVE_PROJECT:-study-n8n}"
COMPOSE="docker compose -p $LIVE -f $HERE/../../docker-compose.yml"
OUT="$HERE/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
$COMPOSE exec -T n8n sh -c 'rm -rf /tmp/bk && mkdir -p /tmp/bk/workflows /tmp/bk/credentials && n8n export:workflow --backup --output=/tmp/bk/workflows/ && n8n export:credentials --backup --output=/tmp/bk/credentials/'
$COMPOSE exec -T n8n tar cf - -C /tmp bk > "$OUT/n8n-export.tar"
ls -l "$OUT"
echo "BACKUP=$OUT"
