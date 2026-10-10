#!/usr/bin/env bash
#
# Cold-start verification for dsh-sessionflow.
#
# Installs the plugin the way a new user would — into a throwaway DSH_HOME that
# has never seen this project — and then proves the install actually loads.
# Nothing here reads the developer's real HOME, ~/.dsh, ~/.voyager or session
# data: everything lives under COLD_ROOT, which the caller owns and cleans.
#
# Usage:
#   COLD_ROOT=/tmp/cold bash scripts/cold-start.sh <spec> <profile> [core-python]
#
#   <spec>          install specifier: github:HarryHeYu/dsh-sessionflow,
#                   file:/abs/path, or a bare path (expected to fail — see
#                   the `link:` case in the README troubleshooting section)
#   <profile>       profile name to create inside the throwaway DSH_HOME
#   [core-python]   python interpreter holding the core; defaults to python3
#
# Exit status: 0 only when every check below passed.  Each check prints a
# `LEVEL: ...` line so a failure names the layer — install, load, or bridge —
# instead of dumping a log and leaving the reader to guess.

set -uo pipefail

SPEC="${1:?usage: cold-start.sh <spec> <profile> [core-python]}"
PROFILE="${2:?usage: cold-start.sh <spec> <profile> [core-python]}"
CORE_PYTHON="${3:-python3}"

: "${COLD_ROOT:?COLD_ROOT must point at an empty scratch directory}"

export DSH_HOME="$COLD_ROOT/dshhome"
WORK="$COLD_ROOT/work"
mkdir -p "$DSH_HOME" "$WORK"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

cd "$WORK" || fail "cannot enter $WORK"

# ---------------------------------------------------------------- install ---
echo "--- creating profile '$PROFILE' under $DSH_HOME"
# --dump-config is what makes this exit 0: without it DSH creates the profile
# and then boots the headless app, which wants a task argument and fails.
dsh --from-default-profile headless --profile "$PROFILE" --dump-config \
  > "$COLD_ROOT/init.log" 2>&1 \
  || { tail -20 "$COLD_ROOT/init.log" >&2; fail "profile creation"; }

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
[ -f "$PROFILE_DIR/package.json" ] || fail "profile has no package.json"

# The first attempt may be refused because pnpm will not run a git-hosted
# package's `prepare` script until it is allowlisted.  DSH prints the exact
# key; this is the documented two-step, automated — not a workaround.
echo "--- dsh plugin add $SPEC"
dsh plugin --profile "$PROFILE" add "$SPEC" > "$COLD_ROOT/add-1.log" 2>&1
ADD_RC=$?

if [ "$ADD_RC" -ne 0 ]; then
  if grep -q 'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED' "$COLD_ROOT/add-1.log"; then
    # The key contains a URL, so it holds colons: match greedily up to the
    # trailing `: true` rather than stopping at the first one.
    KEY=$(sed -n 's/^[[:space:]]\{1,\}\(dsh-sessionflow@.*: *true\)[[:space:]]*$/\1/p' \
            "$COLD_ROOT/add-1.log" | tail -1)
    [ -n "$KEY" ] || { cat "$COLD_ROOT/add-1.log" >&2; fail "prepare was blocked but no allowBuilds key was printed"; }
    WS="$PROFILE_DIR/pnpm-workspace.yaml"
    [ -f "$WS" ] || fail "no pnpm-workspace.yaml to allowlist in"
    if grep -q '^allowBuilds:' "$WS"; then
      printf '  %s\n' "$KEY" >> "$WS"
    else
      printf '\nallowBuilds:\n  %s\n' "$KEY" >> "$WS"
    fi
    echo "--- prepare blocked; allowlisted '$KEY' and retrying"
    dsh plugin --profile "$PROFILE" add "$SPEC" > "$COLD_ROOT/add-2.log" 2>&1 \
      || { tail -20 "$COLD_ROOT/add-2.log" >&2; fail "dsh plugin add after allowBuilds"; }
  else
    tail -20 "$COLD_ROOT/add-1.log" >&2
    fail "dsh plugin add"
  fi
fi
pass "INSTALL VERIFIED: dsh plugin add $SPEC exited 0"

# ------------------------------------------------------------ bundle wiring ---
node -e '
  const fs = require("fs");
  const p = process.argv[1];
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const bundles = j?.dsh?.profile?.bundles ?? j?.dsh?.bundles ?? [];
  if (!bundles.includes("dsh-sessionflow"))
    { console.error("bundles =", JSON.stringify(bundles)); process.exit(1); }
  console.log("bundles =", bundles.join(", "));
' "$PROFILE_DIR/package.json" || fail "the plugin never made it into the profile's bundles"
pass "BUNDLE DISCOVERED: dsh-sessionflow is in the profile's bundles"

INSTALLED="$PROFILE_DIR/node_modules/dsh-sessionflow"
[ -d "$INSTALLED" ] || fail "node_modules/dsh-sessionflow is missing (dependency was not materialised)"
[ -f "$INSTALLED/lib/index.js" ] \
  || fail "installed package has no lib/index.js — the prepare script did not run"
pass "PREPARE RAN: the installed package ships a built lib/"

dsh --profile "$PROFILE" --dump-config > "$COLD_ROOT/dump.log" 2>&1 \
  || { tail -20 "$COLD_ROOT/dump.log" >&2; fail "--dump-config"; }
grep -q 'dsh-sessionflow' "$COLD_ROOT/dump.log" \
  || fail "the plugin is absent from the composed profile tree"
pass "RUNTIME LOADED: the plugin is in the composed profile tree"

# -------------------------------------------------------------- tool surface ---
# Import the *installed* copy, not the checkout: this is what the user got.
node --input-type=module -e '
  import { pathToFileURL } from "node:url";
  const installed = process.argv[1];
  const index = await import(pathToFileURL(installed + "/lib/index.js").href);
  const expected = ["searchTool","recentTool","sessionTool","currentWorkTool","continueTool","mergeTool"];
  for (const n of expected)
    if (typeof index[n] !== "function") { console.error("missing export:", n); process.exit(1); }
  const names = expected.map(k => index[k]({}).name);
  const want = ["sessionflow_search","sessionflow_recent","sessionflow_session",
                "sessionflow_current_work","sessionflow_continue","sessionflow_merge"];
  for (const w of want)
    if (!names.includes(w)) { console.error("not registered:", w, "saw", names.join(",")); process.exit(1); }
  if (new Set(names).size !== 6) { console.error("duplicate names:", names.join(",")); process.exit(1); }
  if (JSON.stringify(index.inject) !== JSON.stringify(["tools"])) {
    console.error("inject =", JSON.stringify(index.inject)); process.exit(1); }
  console.log("tools =", names.join(", "));
' "$INSTALLED" || fail "the installed plugin does not expose the six sessionflow tools"
pass "TOOL REGISTERED: the installed copy exposes six distinct sessionflow_ tools"

# --------------------------------------------------------------- bridge call ---
# Real core, real subprocess.  No model is involved, so this runs in CI.
VOYAGER_PYTHON="$CORE_PYTHON" node --input-type=module -e '
  import { pathToFileURL } from "node:url";
  const installed = process.argv[1];
  const bridge = await import(pathToFileURL(installed + "/lib/bridge.js").href);
  const cmd = await bridge.resolveVoyager({});
  const info = await bridge.integrationInfo({});
  if (typeof info.schema_version !== "number") {
    console.error("no schema_version in integration-info"); process.exit(1); }
  bridge.assertCompatible(info);
  console.log("voyager =", cmd.command, (cmd.args || []).join(" "));
  console.log("schema_version =", info.schema_version);
' "$INSTALLED" || fail "the bridge could not talk to the installed core"
pass "BRIDGE EXECUTED: the installed plugin reached a real core over the JSON bridge"

echo "ALL CHECKS PASSED ($SPEC)"
