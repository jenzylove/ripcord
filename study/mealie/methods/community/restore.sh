#!/usr/bin/env bash
# Usage: restore.sh <dump> <project-name> <port>
# New compose project: start postgres, pg_restore the dump into it, then start mealie.
set -euo pipefail
cd "$(dirname "$0")"
DUMP="$1"; PROJECT="$2"; PORT="$3"
COPY="copy-$PROJECT.compose.yml"
sed "s/9961/$PORT/g" ../../docker-compose.yml > "$COPY"
docker compose -p "$PROJECT" -f "$COPY" up -d postgres --wait
docker compose -p "$PROJECT" -f "$COPY" exec -T postgres pg_restore -U mealie -d mealie --no-owner < "$DUMP"
docker compose -p "$PROJECT" -f "$COPY" up -d mealie
echo "restored into $PROJECT on http://localhost:$PORT"
