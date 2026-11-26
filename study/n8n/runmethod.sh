#!/usr/bin/env bash
# Usage: runmethod.sh <method> <port>  -> runs backup, restore into study-n8n-<method>, verify; evidence in evidence/<method>/
M=$1; PORT=$2; HERE="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"; E="$HERE/evidence/$M"; mkdir -p "$E"; export MSYS_NO_PATHCONV=1
cd "$HERE/methods/$M"
bash backup.sh > "$E/backup.log" 2>&1; echo "backup exit code: $?" >> "$E/backup.log"
BK=$(grep -h '^BACKUP=' "$E/backup.log" | tail -1 | cut -d= -f2-)
[ -z "$BK" ] && BK=$(ls -dt "$HERE/methods/$M/backups"/* 2>/dev/null | head -1)
echo "backup dir: $BK" >> "$E/backup.log"
bash restore.sh "$BK" study-n8n-$M $PORT > "$E/restore.log" 2>&1; echo "restore exit code: $?" >> "$E/restore.log"
for i in $(seq 40); do curl -sf localhost:$PORT/rest/settings >/dev/null && break; sleep 3; done
"$HERE/verify.sh" $PORT study-n8n-$M > "$E/verify.txt" 2>&1
diff <(sed -n '/row counts/,$p' "$HERE/evidence/live-verify.txt") <(sed -n '/row counts/,$p' "$E/verify.txt") > "$E/rowcount-diff.txt"; echo "rowcount diff exit: $?" >> "$E/rowcount-diff.txt"
