#!/usr/bin/env bash
# Per table row counts (exact) for a compose project's postgres. Usage: counts.sh <project> <user> <db> [service]
export MSYS_NO_PATHCONV=1
P=$1; U=$2; D=$3; S=${4:-postgres}
docker compose -p "$P" exec -T "$S" psql -U "$U" -d "$D" -At -F ' ' -c "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" </dev/null | tr -d '\r'
