#!/usr/bin/env bash
# Community method: dump the Postgres database with pg_dump (the usual "back up the database" guide).
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${LIVE_PROJECT:-study-mealie}"
mkdir -p backups
docker compose -p "$PROJECT" exec -T postgres pg_dump -U mealie -Fc mealie > backups/mealie.dump
ls -l backups/mealie.dump
