#!/usr/bin/env bash
# restore.sh <backup.tar.gz> <project-name> <port>
#
# Restores a backup made by backup.sh into a brand-new copy of the stack under
# a different compose project name and host port, so you can check it without
# touching the original. Refuses to run if the target project already has
# volumes or containers, or if it is the original project.
#
# The new stack's files (compose + .env from the backup) are placed in
# ./restored/<project-name>/. Remove the copy later with:
#   docker compose -p <project-name> -f restored/<project-name>/docker-compose.yml down -v
set -euo pipefail

SRC_PROJECT_DEFAULT="study-karakeep"
HELPER_IMAGE="${HELPER_IMAGE:-alpine:3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

die() { echo "ERROR: $*" >&2; exit 1; }

[ "$#" -eq 3 ] || die "usage: $0 <backup.tar.gz> <project-name> <port>"
BACKUP="$1"; PROJECT="$2"; PORT="$3"

[ -f "$BACKUP" ] || die "backup file not found: $BACKUP"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "project name must be lowercase letters, digits, '-' or '_'"
[ "$PROJECT" != "$SRC_PROJECT_DEFAULT" ] || die "project name must differ from the original ($SRC_PROJECT_DEFAULT)"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "port must be 1-65535"

command -v docker >/dev/null || die "docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"

# The original stack's port is unknown here, but docker will refuse a port that is
# taken. Pre-check on the host where possible for a clearer message.
if docker ps --format '{{.Ports}}' | grep -Eq "(^|[ ,:])${PORT}->"; then
  die "port $PORT is already published by a running container"
fi

# Refuse to reuse an existing project: never overwrite anything.
for vol in data meilisearch; do
  if docker volume inspect "${PROJECT}_${vol}" >/dev/null 2>&1; then
    die "volume ${PROJECT}_${vol} already exists - pick a new project name"
  fi
done
if [ -n "$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  die "containers for project '$PROJECT' already exist - pick a new project name"
fi

WORK="$SCRIPT_DIR/restored/$PROJECT"
[ ! -e "$WORK" ] || die "$WORK already exists - pick a new project name or remove it"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/karakeep-restore.XXXXXX")"
CREATED_STACK=0
OK=0
cleanup() {
  rm -rf "$STAGE"
  if [ "$OK" -ne 1 ]; then
    echo "Restore did not finish; cleaning up partial '$PROJECT' resources" >&2
    if [ "$CREATED_STACK" -eq 1 ]; then
      docker compose -p "$PROJECT" -f "$WORK/docker-compose.yml" --project-directory "$WORK" down -v >/dev/null 2>&1 || true
    fi
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT
trap 'echo "Interrupted" >&2; exit 130' INT TERM

echo "==> Verifying backup"
tar -xzf "$BACKUP" -C "$STAGE"
for f in data.tar meilisearch.tar docker-compose.yml env SHA256SUMS; do
  [ -f "$STAGE/$f" ] || die "backup is missing '$f' - not a backup from backup.sh?"
done
( cd "$STAGE" && sha256sum -c SHA256SUMS >/dev/null ) || die "checksum mismatch - backup is corrupt"
echo "    checksums OK"

mkdir -p "$WORK"
cp "$STAGE/docker-compose.yml" "$WORK/docker-compose.yml"
# Keep the original secrets (needed so existing sessions/search keys stay valid);
# only the port is changed.
grep -v '^HOST_PORT=' "$STAGE/env" > "$WORK/.env" || true
printf '\nHOST_PORT=%s\n' "$PORT" >> "$WORK/.env"
chmod 600 "$WORK/.env"

dc() { HOST_PORT="$PORT" docker compose -p "$PROJECT" -f "$WORK/docker-compose.yml" --project-directory "$WORK" "$@"; }

echo "==> Creating new stack '$PROJECT' (containers + empty volumes, not started)"
CREATED_STACK=1
dc up --no-start >/dev/null

for vol in data meilisearch; do
  echo "==> Restoring volume ${PROJECT}_${vol}"
  docker run --rm -i -v "${PROJECT}_${vol}:/v" "$HELPER_IMAGE" \
    tar -C /v -xf - < "$STAGE/${vol}.tar"
done

echo "==> Starting '$PROJECT' on port $PORT"
dc up -d >/dev/null

echo "==> Waiting for http://localhost:$PORT (up to 180s)"
READY=0
if command -v curl >/dev/null; then
  for _ in $(seq 1 90); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" || true)"
    if [[ "$code" =~ ^(200|30[0-9])$ ]]; then READY=1; break; fi
    sleep 2
  done
else
  echo "    curl not found; skipping readiness check"
  READY=1
fi

OK=1
echo
if [ "$READY" -eq 1 ]; then
  echo "Restored copy is up: http://localhost:$PORT   (project: $PROJECT)"
else
  echo "Stack started but did not answer on port $PORT within 180s."
  echo "Inspect with: docker compose -p $PROJECT -f \"$WORK/docker-compose.yml\" logs web"
fi
echo "Log in with your existing account and check your bookmarks, lists and assets."
echo "Search results may take a moment to repopulate while Meilisearch settles."
echo
echo "When done, remove the copy (does not touch the original):"
echo "  docker compose -p $PROJECT -f \"$WORK/docker-compose.yml\" down -v && rm -rf \"$WORK\""
