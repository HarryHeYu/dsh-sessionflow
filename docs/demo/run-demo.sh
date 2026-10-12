#!/usr/bin/env bash
#
# Cross-agent continuation demo: continue a Claude Code task inside DSH.
#
# Everything happens inside a throwaway root — a private HOME, a private index,
# a private demo repository. The real ~/.voyager, ~/.codex, ~/.claude and the
# real index are never read or written.
#
# Usage:
#   PYTHON=python3 bash docs/demo/run-demo.sh [root]
#
#   PYTHON   interpreter that has sessionFlow installed (default: python3)
#   root     scratch directory to build in (default: ./demo-run)
#
# Exit status is 0 only if every step behaved as the demo claims.

set -uo pipefail

PYTHON="${PYTHON:-python3}"
ROOT="${1:-$(pwd)/demo-run}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$ROOT"
ROOT="$(cd "$ROOT" && pwd)"
HOME_DIR="$ROOT/home"
REPO="$ROOT/proj/demo"

# Native programs (python, git, voyager.exe) must be handed Windows paths on
# Windows; MSYS would otherwise rewrite "/e/..." into a path on the current
# drive, which silently writes somewhere else.
winpath() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}
ROOT_WIN="$(winpath "$ROOT")"
REPO_WIN="$(winpath "$REPO")"
HOME_WIN="$(winpath "$HOME_DIR")"

step() { printf '\n\033[1m=== %s\033[0m\n' "$*"; }

# ------------------------------------------------------------------ build ---
step "1. Build the isolated environment (synthetic sessions only)"
"$PYTHON" "$HERE/build-env.py" "$ROOT_WIN"

(
  cd "$REPO" || exit 1
  if [ ! -d .git ]; then
    git init -q -b main
    git add -A
    git -c user.email=demo@example.com -c user.name=demo commit -qm "demo: initial CLI"
  fi
)

# Point every path lookup at the throwaway home.  USERPROFILE is what
# pathlib.Path.home() reads on Windows; APPDATA/LOCALAPPDATA cover the
# adapters that use them.
mkdir -p "$HOME_DIR/AppData/Roaming" "$HOME_DIR/AppData/Local"
export USERPROFILE="$HOME_WIN"
export HOME="$HOME_WIN"
export APPDATA="$(winpath "$HOME_DIR/AppData/Roaming")"
export LOCALAPPDATA="$(winpath "$HOME_DIR/AppData/Local")"

voyager() { "$PYTHON" -m voyager.cli "$@"; }

# ------------------------------------------------------------------- scan ---
step "2. Index the local agent history"
voyager scan

step "3. What is in the index"
voyager list

step "4. Cross-agent timeline for the demo repository"
voyager repo "$REPO_WIN"

step "5. Search the history"
voyager search "strict"

# ------------------------------------------------------------- continue -----
step "6. Continue the newest work in this repo"
( cd "$REPO" && voyager continue )

step "7. Hand off to another agent (Context Package)"
( cd "$REPO" && voyager handoff cccccccc --to codex )

echo
echo "--- the package that the target agent reads ---"
cat "$REPO"/handoff-claude-*.md

# -------------------------------------------------------------- ambiguity ---
step "8. Group the work into a WorkThread"
MERGE_OUT="$( cd "$REPO" && voyager merge cccccccc aaaaaaaa )"
printf '%s\n' "$MERGE_OUT"
THR="$(printf '%s\n' "$MERGE_OUT" | sed -n 's/^Thread \(thr_[0-9a-f]*\) created.*/\1/p' | head -1)"
[ -n "$THR" ] || { echo "FAIL: could not read the created thread id" >&2; exit 1; }

step "9. Add a second active WorkThread"
voyager thread create --repo "$REPO_WIN" --title "Add a --json output mode"

step "10. Now nothing guesses which one you meant"
set +e
( cd "$REPO" && voyager continue )
RC=$?
set -e
[ "$RC" -eq 2 ] || { echo "FAIL: expected exit 2 from an ambiguous continue, got $RC" >&2; exit 1; }
( cd "$REPO" && voyager status )

step "11. Name the thread and it proceeds"
( cd "$REPO" && voyager continue --thread "$THR" )

printf '\n\033[1mDemo complete.\033[0m Everything ran under %s — the real index was untouched.\n' "$ROOT"
