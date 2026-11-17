#!/usr/bin/env bash
# Will this build open the work users saved on prod? (tests/upgrade/)
#   1. check out the prod code (default origin/master) beside this one
#   2. run saveOnProd there: real edits, saved the way prod saves them
#   3. run openOnDev here against that saved work
# usage: scripts/upgrade-check.sh [prod-ref]
set -euo pipefail
ref=${1:-origin/master}
here=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'git -C "$here" worktree remove --force "$work/prod" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

git -C "$here" worktree add --detach "$work/prod" "$ref" >/dev/null
if [ -n "${CI:-}" ]; then (cd "$work/prod" && npm ci --no-audit --no-fund >/dev/null)
else ln -s "$(readlink -f "$here/node_modules")" "$work/prod/node_modules"; fi
mkdir -p "$work/prod/tests/upgrade"
cp "$here/tests/upgrade/base.js" "$here/tests/upgrade/saveOnProd.test.js" "$work/prod/tests/upgrade/"

echo "== saving on prod ($(git -C "$work/prod" rev-parse --short HEAD))"
(cd "$work/prod" && UPGRADE_OUT="$work/saved.json" npx vitest run tests/upgrade/saveOnProd.test.js)
# A skipped or failed save must not pass as "nothing to check".
node -e 'const s=require(process.argv[1]).saved; if(!(s.ps.length&&s.rs.length&&s.db.length)) {console.error("prod saved nothing:", s); process.exit(1)}' "$work/saved.json"

echo "== reopening on this build ($(git -C "$here" rev-parse --short HEAD))"
cd "$here" && UPGRADE_SAVED="$work/saved.json" npx vitest run tests/upgrade/openOnDev.test.js
