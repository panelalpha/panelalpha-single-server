#!/usr/bin/env bash
#
# Regenerates tests/Feature/Docs/engine-paths.txt, the committed list of Engine
# source paths and their line counts the citation guard checks
# `// Engine: <path>:<line>` against.
#
# The list is the union of three refs:
#   * `origin/feat/wordpress` – the WordPress endpoints;
#   * the deployed Engine `origin/GITHUB/develop` (`daf4ad737`) – the
#     contract outside WordPress;
#   * the former deploy pin `gitlab-develop-29ae50bc0`, kept
#     so a citation written against it still resolves.
# The committed list also holds `origin/develop-2-3-0` (2026-11-03), for the
# Engine 2.3.0 calls the panel makes behind a feature check (`EngineFeatures`):
# add it to ENGINE_BRANCHES when regenerating.
# A citation may name a file on any of them; a path that exists on several keeps
# the largest line count, so a line from any branch resolves. Run it whenever a
# ref moves and commit the result.
#
# The format is one `core/<path>\t<lineCount>` per line, so a citation can be
# validated against both the path and the line it names.
#
# The Engine repo is read-only reference and is not part of this checkout, so the
# path is configurable. Override the refs with ENGINE_BRANCHES (space-separated)
# or ENGINE_BRANCH (single):
#
#   ENGINE_REPO=/path/to/engine ENGINE_BRANCHES="gitlab-develop-29ae50bc0 origin/GITHUB/develop origin/feat/wordpress" \
#     scripts/generate-engine-paths.sh
#
set -euo pipefail

engine_repo="${ENGINE_REPO:-/home/miodek/projects/engine}"
branches="${ENGINE_BRANCHES:-${ENGINE_BRANCH:-gitlab-develop-29ae50bc0 origin/GITHUB/develop origin/feat/wordpress}}"
out="$(cd "$(dirname "$0")/.." && pwd)/tests/Feature/Docs/engine-paths.txt"

# `git grep -c ''` prints `branch:path:count` for every text file; strip the
# branch prefix and turn the trailing `:count` into a tab. Only the three
# Engine roots a citation may name are emitted.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
: > "$tmp"
for branch in $branches; do
  git -C "$engine_repo" grep -c '' "$branch" -- core/app core/config core/database \
    | sed -E "s|^${branch//./\\.}:||" \
    | sed -E 's|:([0-9]+)$|\t\1|' >> "$tmp"
done

# Dedupe by path, keeping the largest line count, so a path present on both refs
# is not ambiguous.
awk -F'\t' 'NF==2 { if (!($1 in c) || $2+0 > c[$1]) c[$1]=$2+0 } END { for (p in c) print p"\t"c[p] }' "$tmp" \
  | LC_ALL=C sort > "$out"

echo "wrote $(wc -l < "$out") Engine paths with line counts from $branches to $out"
