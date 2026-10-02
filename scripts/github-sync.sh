#!/usr/bin/env bash
# Commit changed files to GitHub main via the Contents API.
# Usage: bash scripts/github-sync.sh "commit message" [file ...]
# With no files: syncs all tracked project files (excluding deps/build output).
set -euo pipefail
REPO="mahdihemati/Personal-Accounting"
BRANCH="main"
MSG="$1"; shift || true
API="https://api.github.com/repos/$REPO/contents"
AUTH="Authorization: Bearer $GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN"

if [ "$#" -eq 0 ]; then
  mapfile -t FILES < <(find . -type f \
    -not -path './node_modules/*' -not -path './.git' -not -path './.git/*' -not -path './.workspace/*' -not -path './dist/*' \
    -not -path './.output/*' -not -path './.tanstack/*' -not -path './.wrangler/*' \
    -not -name '.env*' | sed 's|^\./||' | sort)
else
  FILES=("$@")
fi

for f in "${FILES[@]}"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$f")
  sha=$(curl -s -H "$AUTH" "$API/$enc?ref=$BRANCH" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('sha',''))
except: print('')")
  if [ ! -f "$f" ]; then
    [ -n "$sha" ] && curl -s -o /dev/null -w "DEL %{http_code} $f\n" -X DELETE -H "$AUTH" "$API/$enc" \
      -d "$(python3 -c "import json,sys;print(json.dumps({'message':sys.argv[1],'sha':sys.argv[2],'branch':'$BRANCH'}))" "$MSG" "$sha")"
    continue
  fi
  python3 - "$f" "$MSG" "$sha" > /tmp/gh_body.json <<'PY'
import base64,json,sys
f,msg,sha=sys.argv[1:4]
b={'message':msg,'content':base64.b64encode(open(f,'rb').read()).decode(),'branch':'main'}
if sha: b['sha']=sha
print(json.dumps(b))
PY
  curl -s -o /dev/null -w "PUT %{http_code} $f\n" -X PUT -H "$AUTH" "$API/$enc" --data @/tmp/gh_body.json
done
