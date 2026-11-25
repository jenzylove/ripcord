#!/usr/bin/env bash
# Per table row counts for a compose project's postgres. Usage: counts.sh <project> <user> <db> [service]
export MSYS_NO_PATHCONV=1
P=$1; U=$2; D=$3; S=${4:-postgres}
docker compose -p "$P" exec -T "$S" psql -U "$U" -d "$D" -At -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" | tr -d '\r' | while read t; do
  n=$(docker compose -p "$P" exec -T "$S" psql -U "$U" -d "$D" -At -c "select count(*) from \"$t\"" | tr -d '\r'); echo "$t $n"; done
