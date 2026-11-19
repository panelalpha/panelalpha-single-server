#!/usr/bin/env bash
#
# Regenerates tests/Feature/Docs/client-area-paths.txt, the committed list of
# Client Area source paths and their line counts the CA citation guard checks
# `// CA: <path>:<line>` and `// CA reads: <path>:<line>` against. Run it
# whenever the Client Area reference checkout moves; commit the result.
#
# The Client Area repo is read-only reference and is not part of this checkout
# (its `packages/client-area` submodule is empty in a worktree), so the path is
# configurable:
#
#   CLIENT_AREA_REPO=/path/to/client-area scripts/generate-client-area-paths.sh
#
# The format is one `packages/client-area/<path>\t<lineCount>` per line. Paths
# under `src/` and `fm/` are the only ones a CA citation may name, and the
# `packages/client-area/` prefix makes both the full path and a shorter
# `src/...` / `fm/...` suffix resolve through the scanner's suffix index.
set -euo pipefail

client_repo="${CLIENT_AREA_REPO:-/home/miodek/projects/panelalpha-app-lite/packages/client-area}"
out="$(cd "$(dirname "$0")/.." && pwd)/tests/Feature/Docs/client-area-paths.txt"

# `git grep -c ''` prints `HEAD:path:count` for every text file; strip the `HEAD:`
# prefix, turn the trailing `:count` into a tab and prefix the reference root.
git -C "$client_repo" grep -c '' HEAD -- src fm \
  | sed -E 's|^HEAD:||' \
  | sed -E 's|^([^\t]+):([0-9]+)$|packages/client-area/\1\t\2|' > "$out"

echo "wrote $(wc -l < "$out") Client Area paths with line counts to $out"
