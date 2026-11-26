#!/usr/bin/env bash
# Official n8n full backup: external PostgreSQL via its own tool (pg_dump) + the .n8n folder (/home/node/.n8n, holds the encryption key).
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"
LIVE="${LIVE_PROJECT:-study-n8n}"
COMPOSE="docker compose -p $LIVE -f $HERE/../../docker-compose.yml"
OUT="$HERE/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUT/n8n-db.sql"
$COMPOSE exec -T n8n tar czf - -C /home/node .n8n > "$OUT/n8n-folder.tar.gz"
ls -l "$OUT"
echo "BACKUP=$OUT"
