#!/usr/bin/env bash
# Restore a backup made by backup.sh into a brand-new, separate copy of the stack,
# so you can check it without touching the original.
#
# Usage: ./restore.sh <backup.tar.gz> <new-compose-project-name> <port>
# Example: ./restore.sh backups/vikunja-20261125T191652Z.tar.gz vikunja-check 9970
#
# What it does:
#   - refuses to run if the project name is the live one or already has containers/volumes
#   - writes ./restored/<project>/docker-compose.yml (the backed-up compose file with the
#     host port and VIKUNJA_SERVICE_PUBLICURL changed to <port>)
#   - starts a fresh empty database, loads db.dump, unpacks files.tar into a fresh files volume
#   - starts Vikunja and waits until it answers on http://localhost:<port>
# It never touches the original study-vikunja project or its volumes.
#
# Clean up the copy afterwards with the command printed at the end.
set -euo pipefail

export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

die() { echo "restore: ERROR: $*" >&2; exit 1; }

[ $# -eq 3 ] || { echo "Usage: $0 <backup.tar.gz> <project-name> <port>" >&2; exit 2; }
BACKUP="$1"; PROJECT="$2"; PORT="$3"

LIVE_PROJECT="${VIKUNJA_PROJECT:-study-vikunja}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v docker >/dev/null || die "docker not found"
[ -f "$BACKUP" ] || die "backup file not found: $BACKUP"
BACKUP="$(cd "$(dirname "$BACKUP")" && pwd)/$(basename "$BACKUP")"

# --- validate arguments ------------------------------------------------------
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "project name must be lowercase letters, digits, '-' or '_' (got '$PROJECT')"
[ "$PROJECT" != "$LIVE_PROJECT" ] || die "'$PROJECT' is the live project; pick a different name"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "port must be 1-65535 (got '$PORT')"
[ "$PORT" != "9962" ] || die "port 9962 is used by the live stack; pick a different port"

# Must be brand new: no containers and no volumes under that project name.
if [ -n "$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT")" ] ||
   [ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  die "compose project '$PROJECT' already exists; choose an unused name (or remove it: docker compose -p $PROJECT down -v)"
fi
# Best-effort check that the port is free (published ports of any running container).
if docker ps --format '{{.Ports}}' | grep -Eq "(:|^)$PORT->"; then
  die "port $PORT is already published by a running container"
fi

# --- unpack and validate the backup -----------------------------------------
RESTORE_DIR="$HERE/restored/$PROJECT"
mkdir -p "$HERE/restored"
[ ! -e "$RESTORE_DIR" ] || die "$RESTORE_DIR already exists; remove it or choose another project name"
mkdir -p "$RESTORE_DIR"
cleanup_on_fail() { rc=$?; if [ $rc -ne 0 ]; then echo "restore: FAILED (exit $rc). Nothing was done to '$LIVE_PROJECT'. Partial copy can be removed with: docker compose -p $PROJECT down -v" >&2; fi; }
trap cleanup_on_fail EXIT

tar -xzf "$BACKUP" -C "$RESTORE_DIR" || die "could not unpack $BACKUP"
for f in db.dump files.tar docker-compose.yml MANIFEST; do
  [ -s "$RESTORE_DIR/$f" ] || die "backup is missing or has empty '$f'"
done
echo "restore: backup contents:"; sed 's/^/  /' "$RESTORE_DIR/MANIFEST"

# --- build the compose file for the copy ------------------------------------
cd "$RESTORE_DIR"
mv docker-compose.yml docker-compose.original.yml
sed -E \
  -e "s#^([[:space:]]*-[[:space:]]*)\"?[0-9]+:3456\"?[[:space:]]*\$#\1$PORT:3456#" \
  -e "s#(VIKUNJA_SERVICE_PUBLICURL:[[:space:]]*http://localhost:)[0-9]+#\1$PORT#" \
  docker-compose.original.yml > docker-compose.yml
grep -q "^[[:space:]]*-[[:space:]]*$PORT:3456" docker-compose.yml || die "could not set the host port in the compose file"
grep -q "PUBLICURL: http://localhost:$PORT" docker-compose.yml || die "could not set VIKUNJA_SERVICE_PUBLICURL in the compose file"

dc() { docker compose -p "$PROJECT" -f docker-compose.yml "$@"; }

# --- database ----------------------------------------------------------------
echo "restore: starting empty database for '$PROJECT'..."
dc up -d db

echo "restore: waiting for postgres..."
ready=0
for _ in $(seq 1 90); do
  if dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d vikunja -At -c "select 1"' >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || die "database did not become ready in time (docker compose -p $PROJECT logs db)"

echo "restore: loading database dump..."
dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d vikunja --no-owner --exit-on-error' < db.dump

# --- files -------------------------------------------------------------------
echo "restore: restoring attachments into the new files volume..."
dc run --rm --no-deps -T --entrypoint sh files-perms -c \
  'tar -C /app/vikunja/files -xf - && chown -R 1000:0 /app/vikunja/files' < files.tar

# --- start the app -----------------------------------------------------------
echo "restore: starting Vikunja on port $PORT..."
dc up -d

up=0
for _ in $(seq 1 60); do
  if command -v curl >/dev/null; then
    curl -fsS "http://localhost:$PORT/api/v1/info" >/dev/null 2>&1 && { up=1; break; }
  else
    [ "$(dc ps --status running -q vikunja)" ] && sleep 5 && { up=1; break; }
  fi
  sleep 2
done
[ "$up" = 1 ] || die "Vikunja did not answer on port $PORT (docker compose -p $PROJECT logs vikunja)"

echo
echo "restore: row counts now (compare with the MANIFEST above):"
dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d vikunja -At -c "
select '"'"'users='"'"'||count(*) from users union all
select '"'"'projects='"'"'||count(*) from projects union all
select '"'"'tasks='"'"'||count(*) from tasks union all
select '"'"'labels='"'"'||count(*) from labels"' | sed 's/^/  /'

trap - EXIT
echo
echo "restore: done. The copy is running at http://localhost:$PORT (log in with your normal account)."
echo "  Compose file : $RESTORE_DIR/docker-compose.yml"
echo "  Remove copy  : docker compose -p $PROJECT -f \"$RESTORE_DIR/docker-compose.yml\" down -v && rm -rf \"$RESTORE_DIR\""
