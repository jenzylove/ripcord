#!/usr/bin/env bash
# Community method: pg_dump of the database + a copy of the media folder (what the "dump the database and copy
# your documents folder" guides describe). The data folder (search index, classifier) is not included.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${LIVE_PROJECT:-study-paperless}"
mkdir -p backups/media
docker compose -p "$PROJECT" exec -T db pg_dump -U paperless -d paperless > backups/paperless-db.sql
C=$(docker compose -p "$PROJECT" ps -q webserver)
rm -rf backups/media && mkdir -p backups/media
docker cp "$C:/usr/src/paperless/media/." backups/media/
ls -l backups/paperless-db.sql; du -sh backups/media
