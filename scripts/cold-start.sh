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
# `LEVEL: ...` line naming the layer it proved, so a failure says which layer
# broke instead of dumping a log and leaving the reader to guess:
#
#   INSTALL VERIFIED    `dsh plugin add` exited 0
#   BUNDLE DISCOVERED   dsh-sessionflow is in the profile's bundles
#   PREPARE RAN         the installed package ships a built lib/
#   LAYER APPLIED       the plugin's patch layer is in the composed tree
#   PLUGIN LOADED       DSH imported the plugin and ran its apply()
#   BRIDGE EXECUTED     the installed bridge reached a real core
#
# What it deliberately does not claim: a real model turn.  There are no
# credentials here, and none are wanted — the boot stops at the credential gate,
# which is exactly the evidence this script needs.

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

# pnpm >= 10 refuses to run a git-hosted package's `prepare` script until the
# package is allowlisted.  The DSH docs show the short form (`dsh-sessionflow:
# true`), but pnpm 11 rejects that and prints the key it actually wants — the
# package plus the resolved commit.  Measured, not assumed: with the short form
# pnpm still fails with ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED.  So take the key
# pnpm printed.  This is the documented two-step, automated, not a bypass.
_allowbuild_add() {
  local key="$1" ws="$PROFILE_DIR/pnpm-workspace.yaml"
  [ -f "$ws" ] || fail "no pnpm-workspace.yaml to allowlist in"
  if grep -q '^allowBuilds:' "$ws"; then
    printf '  %s\n' "$key" >> "$ws"
  else
    printf '\nallowBuilds:\n  %s\n' "$key" >> "$ws"
  fi
}

echo "--- dsh plugin add $SPEC"
dsh plugin --profile "$PROFILE" add "$SPEC" > "$COLD_ROOT/add-1.log" 2>&1
ADD_RC=$?

if [ "$ADD_RC" -ne 0 ]; then
  if grep -q 'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED' "$COLD_ROOT/add-1.log"; then
    KEY=$(sed -n 's/^[[:space:]]\{1,\}\(dsh-sessionflow@.*: *true\)[[:space:]]*$/\1/p' \
            "$COLD_ROOT/add-1.log" | tail -1)
    [ -n "$KEY" ] || { cat "$COLD_ROOT/add-1.log" >&2
                       fail "prepare was blocked but pnpm printed no allowBuilds key"; }
    echo "--- prepare was blocked; allowlisting the key pnpm printed: $KEY"
    _allowbuild_add "$KEY"
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
  || fail "the plugin's patch layer is absent from the composed tree"
pass "LAYER APPLIED: the plugin's layer is in the composed profile tree"

# ------------------------------------------------------- does DSH load it? ---
# --dump-config only composes patch layers; it never imports the plugin, so it
# cannot tell a loadable plugin from a broken one.  A boot can.  With no
# credentials the boot stops at the credential gate — and that gate is reached
# only after the plugin tree has been imported, so getting there proves the
# plugin module loaded and its apply() ran under DSH's own resolution.
#
# A failed import looks nothing like that: DSH reports
# "plugin tree failed to load ... failed to import loader entry dsh-sessionflow".
# (Host packages such as @deepseek-ai/dsh-tools are peers resolved by the running
# DSH, not by the profile's node_modules — so this is the only place that can
# tell whether resolution actually works.)
echo "--- booting the profile to see whether DSH can import the plugin"
env -u DEEPSEEK_API_KEY -u OPENAI_API_KEY -u ANTHROPIC_API_KEY \
  timeout 600 dsh --profile "$PROFILE" "cold-start probe" > "$COLD_ROOT/boot.log" 2>&1
BOOT_RC=$?

if grep -qE "plugin tree failed to load|Cannot find package|ERR_MODULE_NOT_FOUND" "$COLD_ROOT/boot.log"; then
  grep -nE "plugin tree failed to load|Cannot find package|ERR_MODULE_NOT_FOUND" \
    "$COLD_ROOT/boot.log" | head -5 >&2
  fail "DSH could not import the plugin (boot rc=$BOOT_RC)"
fi
grep -q "MISSING_CREDENTIAL" "$COLD_ROOT/boot.log" \
  || { tail -25 "$COLD_ROOT/boot.log" >&2
       fail "the boot did not reach the credential gate (rc=$BOOT_RC), so whether the plugin loaded is unknown"; }
pass "PLUGIN LOADED: DSH imported and applied the plugin, then stopped at the credential gate"

# --------------------------------------------------------------- bridge call ---
# lib/bridge.js imports only Node builtins, so it can be driven directly: this
# is a real subprocess talking to a real core, and it needs no model.
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
