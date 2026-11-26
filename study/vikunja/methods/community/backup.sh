#!/usr/bin/env bash
# Community method: plain SQL pg_dump of the database through docker exec (database only).
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${LIVE_PROJECT:-study-vikunja}"
mkdir -p backups
docker compose -p "$PROJECT" exec -T db pg_dump -U vikunja vikunja > backups/vikunja.sql
ls -l backups/vikunja.sql
