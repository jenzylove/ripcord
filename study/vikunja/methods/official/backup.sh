#!/usr/bin/env bash
# Official Vikunja method: `vikunja dump` inside the container (https://vikunja.io/docs/cli), then copy the zip out.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${LIVE_PROJECT:-study-vikunja}"
C=$(docker compose -p "$PROJECT" ps -q vikunja)
NAME="vikunja-dump-$(date -u +%Y%m%dT%H%M%SZ)"
docker exec "$C" /app/vikunja/vikunja dump -p /tmp -f "$NAME"
mkdir -p backups
docker cp "$C:/tmp/$NAME.zip" "backups/$NAME.zip"
echo "backup written: backups/$NAME.zip"
