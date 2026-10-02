#!/usr/bin/env bash
# Commit files to GitHub main via the Contents API (direct API commits, per project rule).
# Usage: bash scripts/github-sync.sh "commit message" [file ...]
# With no files: syncs all tracked project files (excluding deps/build/metadata).
# Hardened: token precheck, explicit HTTP error reporting, SHA verification after
# every write, and a final equality pass over all files.
set -euo pipefail
REPO="mahdihemati/Personal-Accounting"
BRANCH="main"
API="https://api.github.com/repos/$REPO/contents"

MSG="${1:-}"; shift || true
[ -n "$MSG" ] || { echo "ERROR: commit message required" >&2; exit 1; }
if [ -z "${GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN is not set" >&2
  exit 1
fi
AUTH="Authorization: Bearer $GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN"

# Fetch the current tree once: local presence + SHA lookups.
declare -A GH_SHA=()
TREE_JSON=$(curl -sf -H "$AUTH" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/git/trees/$BRANCH?recursive=1") || {
  echo "ERROR: cannot fetch repo tree (bad token or network)" >&2; exit 1; }
readarray -t TREE_PAIRS < <(printf '%s' "$TREE_JSON" | python3 -c '
import json,sys
tree=json.load(sys.stdin)
for t in tree.get("tree",[]):
    if t["type"]=="blob":
        print(t["path"]+"\t"+t["sha"])
')
for pair in "${TREE_PAIRS[@]}"; do
  p="${pair%%$'\t'*}"; s="${pair#*$'\t'}"
  GH_SHA["$p"]="$s"
done

# Build the file list.
if [ "$#" -eq 0 ]; then
  mapfile -t FILES < <(find . -type f \
    -not -path './node_modules/*' -not -path './.git' -not -path './.git/*' \
    -not -path './.workspace/*' -not -path './.lovable/*' -not -path './dist/*' \
    -not -path './.output/*' -not -path './.tanstack/*' -not -path './.wrangler/*' \
    -not -name '.env*' -not -name '*.tsbuildinfo' -not -name '*.log' \
    | sed 's|^\./||' | sort)
else
  FILES=("$@")
fi

fail=0
for f in "${FILES[@]}"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$f")
  sha="${GH_SHA[$f]:-}"

  if [ ! -f "$f" ]; then
    if [ -n "$sha" ]; then
      code=$(curl -s -o /tmp/gh_del.json -w "%{http_code}" -X DELETE -H "$AUTH" "$API/$enc" \
        -d "$(python3 -c "import json,sys;print(json.dumps({'message':sys.argv[1],'sha':sys.argv[2],'branch':'$BRANCH'}))" "$MSG" "$sha")")
      if [ "$code" != "200" ]; then
        echo "ERROR DELETE $code $f: $(cat /tmp/gh_del.json)" >&2; fail=1; continue
      fi
      echo "DEL 200 $f"
    fi
    continue
  fi

  python3 - "$f" "$MSG" "$sha" > /tmp/gh_body.json <<'PY'
import base64,json,sys
f,msg,sha=sys.argv[1:4]
b={'message':msg,'content':base64.b64encode(open(f,'rb').read()).decode(),'branch':'main'}
if sha: b['sha']=sha
print(json.dumps(b))
PY
  resp=$(curl -s -w "\n%{http_code}" -X PUT -H "$AUTH" "$API/$enc" --data @/tmp/gh_body.json)
  code="${resp##*$'\n'}"
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "ERROR PUT $code $f: ${resp%$'\n'*}" >&2; fail=1; continue
  fi
  # Verify SHA equality after write.
  newsha=$(curl -sf -H "$AUTH" "$API/$enc?ref=$BRANCH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('sha',''))")
  localsha=$(python3 -c "import hashlib,sys;d=open(sys.argv[1],'rb').read();print(hashlib.sha1(b'blob %d\x00'%len(d)+d).hexdigest())" "$f")
  if [ "$newsha" != "$localsha" ]; then
    echo "ERROR SHA mismatch after PUT $f (gh=$newsha local=$localsha)" >&2; fail=1; continue
  fi
  echo "PUT $code OK $f"
done

# Final verification pass over all synced files.
if [ "$fail" -eq 0 ]; then
  for f in "${FILES[@]}"; do
    [ -f "$f" ] || continue
    enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$f")
    remote=$(curl -sf -H "$AUTH" "$API/$enc?ref=$BRANCH" | python3 -c "import sys,json;print(json.load(sys.stdin).get('sha',''))" || echo "")
    localsha=$(python3 -c "import hashlib,sys;d=open(sys.argv[1],'rb').read();print(hashlib.sha1(b'blob %d\x00'%len(d)+d).hexdigest())" "$f")
    [ "$remote" = "$localsha" ] || { echo "VERIFY FAILED $f" >&2; fail=1; }
  done
  [ "$fail" -eq 0 ] && echo "SYNC OK: all files verified on $BRANCH"
fi
exit $fail
