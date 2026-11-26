#!/usr/bin/env bash
# Usage: kane-study.sh <app> <method> <copy-port>   (live and copy stacks must be running)
set -u
APP=$1; M=$2; PORT=$3; HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/$APP"; mkdir -p kane
node "$HERE/../dist/cli.js" prove -c ripcord.study.yml --copy-url "http://localhost:$PORT" --label "$APP-$M" > "kane/$M.log" 2>&1
echo "exit $?" >> "kane/$M.log"
R=$(grep -o 'proof-[0-9TZ]*\.html' "kane/$M.log" | tail -1); cp ".ripcord/reports/${R%.html}.json" "kane/$M.json" 2>/dev/null
tail -4 "kane/$M.log"
