#!/usr/bin/env bash
#
# Regenerates tests/Feature/Docs/engine-develop-routes.txt, the committed list of
# Engine route paths the panel's non-WordPress Engine paths are checked against.
#
# The deployed Engine (GitLab `GITHUB/develop`, at
# `daf4ad737`) is the contract for everything outside WordPress. This script snapshots the route paths
# of core/routes/api.php on that ref, one path per line, so EngineDevelopRouteTest
# can fail when the panel calls a path the deployed Engine does not serve. The `$projectRoutes` closure registers its
# `/{username}/...` routes under both prefixes; the panel uses `/projects`, so
# only that prefix is emitted.
#
# The Engine repo is read-only reference and is not part of this checkout, so the
# path is configurable. The default is the deployed ref `origin/GITHUB/develop`
# (it replaced the earlier pin `gitlab-develop-29ae50bc0`, whose routes it keeps):
#
#   ENGINE_REPO=/path/to/engine ENGINE_BRANCH=origin/GITHUB/develop \
#     scripts/generate-engine-develop-routes.sh
#
# The routes of the next Engine, which the panel calls only behind a feature
# check (`EngineFeatures`), go to their own list:
#
#   ENGINE_BRANCH=origin/develop-2-3-0 OUT=tests/Feature/Docs/engine-2-3-0-routes.txt \
#     scripts/generate-engine-develop-routes.sh
#
set -euo pipefail

engine_repo="${ENGINE_REPO:-/home/miodek/projects/engine}"
engine_branch="${ENGINE_BRANCH:-origin/GITHUB/develop}"
out="${OUT:-$(cd "$(dirname "$0")/.." && pwd)/tests/Feature/Docs/engine-develop-routes.txt}"

source="$(mktemp)"
trap 'rm -f "$source"' EXIT
git -C "$engine_repo" show "$engine_branch:core/routes/api.php" > "$source"

start="$(grep -n '^\$projectRoutes = function' "$source" | head -1 | cut -d: -f1)"
if [ -z "$start" ]; then
  echo "could not find the \$projectRoutes closure in $engine_branch:core/routes/api.php" >&2
  exit 1
fi
end="$(awk -v s="$start" 'NR>s && /^\};/{print NR; exit}' "$source")"

{
  # Project routes: closure paths are `/{username}/...`, served under /projects.
  awk -v s="$start" -v e="$end" 'NR>=s && NR<=e' "$source" \
    | grep -oE "Route::(get|post|put|delete|patch)\('[^']+" \
    | sed -E "s/.*\('//" \
    | sed -E "s#^#/projects#"
  # Global routes: everything outside the closure.
  awk -v s="$start" -v e="$end" 'NR<s || NR>e' "$source" \
    | grep -oE "Route::(get|post|put|delete|patch)\('[^']+" \
    | sed -E "s/.*\('//"
} | sort -u > "$out"

echo "wrote $(wc -l < "$out") Engine develop route paths from $engine_branch to $out"
