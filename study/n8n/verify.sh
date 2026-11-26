#!/usr/bin/env bash
# API level look (no browser agent). Usage: verify.sh <port> <compose-project>
D="$(cd "$(dirname "$0")" && { pwd -W 2>/dev/null || pwd; })"; PORT=$1; P=$2; B=http://localhost:$PORT; J=$(mktemp)
echo "healthz: $(curl -s -o /dev/null -w '%{http_code}' $B/healthz)"
curl -s -c $J -H 'content-type: application/json' -H 'browser-id: v' -d '{"emailOrLdapLoginId":"study@example.com","password":"StudyPass#2026"}' $B/rest/login -w '\nlogin http %{http_code}\n' | cut -c1-200
echo "--- workflows"; curl -s -b $J -H 'browser-id: v' "$B/rest/workflows" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.count??j.data?.length, (j.data||[]).map(w=>w.name).join(" | "))}catch(e){console.log(s.slice(0,300))}})'
echo "--- credentials list"; curl -s -b $J -H 'browser-id: v' "$B/rest/credentials" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=j.data||j;console.log(a.length,JSON.stringify(a.map(c=>({id:c.id,name:c.name}))))}catch(e){console.log(s.slice(0,300))}})'
CID=$(curl -s -b $J -H 'browser-id: v' "$B/rest/credentials" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=j.data||j;console.log((a.find(c=>c.name=="Acme Billing API key")||{}).id||"")}catch(e){}})')
echo "--- credential with data (id=$CID)"
curl -s -b $J -H 'browser-id: v' "$B/rest/credentials/$CID?includeData=true" -w '\nhttp %{http_code}\n' | cut -c1-400
echo "--- row counts (exact count per table)"
docker compose -p $P -f "$D/docker-compose.yml" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' < "$D/rowcounts.sql"
