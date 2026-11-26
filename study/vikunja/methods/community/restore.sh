#!/usr/bin/env bash
# Usage: restore.sh <dump.sql> <project-name> <port>
# New compose project: start only the database, pipe the dump into psql, then start vikunja.
set -euo pipefail
cd "$(dirname "$0")"
DUMP="$1"; PROJECT="$2"; PORT="$3"
COPY="copy-$PROJECT.compose.yml"
sed "s/9962/$PORT/g" ../../docker-compose.yml > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d db --wait
docker compose -p "$PROJECT" -f "$COPY" exec -T db psql -U vikunja -d vikunja < "$DUMP"
docker compose -p "$PROJECT" -f "$COPY" up -d --wait vikunja
echo "restored into $PROJECT on http://localhost:$PORT"
