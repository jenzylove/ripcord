#!/usr/bin/env bash
# Official Paperless-ngx method: document_exporter (https://docs.paperless-ngx.com/administration/#exporter)
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${LIVE_PROJECT:-study-paperless}"
NAME="paperless-export-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -p "$PROJECT" exec -T webserver document_exporter ../export -z -zn "$NAME"
C=$(docker compose -p "$PROJECT" ps -q webserver)
mkdir -p backups
docker cp "$C:/usr/src/paperless/export/$NAME.zip" "backups/$NAME.zip"
echo "backup written: backups/$NAME.zip"
