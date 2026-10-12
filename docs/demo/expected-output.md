# Demo — captured output

Real output of `docs/demo/run-demo.sh`, captured on 2026-10-12 with sessionFlow
**v1.1.0**. `<ROOT>` is the throwaway directory passed to the script; the real
`~/.voyager`, `~/.codex` and `~/.claude` were not read or written.

Volatile values (thread ids, git commit hashes, bundle sizes) differ per run;
everything else is stable.

```text

=== 1. Build the isolated environment (synthetic sessions only)
root      : <ROOT>
home      : <ROOT>/home
repo      : <ROOT>/proj/demo
codex     : <ROOT>/home\.codex\sessions\2026\10\11
claude    : <ROOT>/home\.claude\projects\<ROOT>

Next:
  cd <ROOT>/proj/demo && git init -q -b main && git add -A && git -c user.email=d@e.x -c user.name=demo commit -qm "demo: initial CLI"

=== 2. Index the local agent history
  codex: 1 sessions indexed (1 new/refreshed, 0 unchanged)
  claude: 1 sessions indexed (1 new/refreshed, 0 unchanged)
  zcode: no sources found
  dsh: no sources found
  grok: no sources found
  cursor: no sources found
  kiro: no sources found
  antigravity: no sources found

scan complete: 2 sessions, 15 events (new/refreshed: 2, unchanged: 0)
index: <ROOT>/home\.voyager\index.db

=== 3. What is in the index
ID                                           PROV   UPDATED            MSG TOOL  TITLE
cccccccc-1111-2222-3333-444444444444         claude 2026-10-12 17:01     2    3  Add a --strict flag to app.py that fails on unknown config k
aaaaaaaa-1111-2222-3333-444444444444         codex  2026-10-11 23:01     2    1  Set up config loading from config.json.

2 session(s). Use `voyager show <native-id|prefix>` for details.

=== 4. Cross-agent timeline for the demo repository

<ROOT>/proj/demo  (2 sessions)
  2026-10-12 17:01  claude  "Add a --strict flag to app.py that fails on unknown config k"  2 msgs / 3 tools  branch:main  commit:f285d267b3
  2026-10-11 23:01  codex   "Set up config loading from config.json."  2 msgs / 1 tools  branch:main  commit:0000000

=== 5. Search the history
[claude] cccccccc-1111-2222-3333-444444444444  2026-10-12 17:01
    I added -->>>stri<<<…
[claude] cccccccc-1111-2222-3333-444444444444  2026-10-12 17:01
    Add a -->>>strict<<<…
[claude] cccccccc-1111-2222-3333-444444444444  2026-10-12 17:01
    …n', >>>strict<<<=Fal…

3 hit(s) across 1 session(s). `voyager show <id>` for detail.

=== 6. Continue the newest work in this repo
freshness: scanned in 0.0s, 0 source(s) changed
latest session: [claude] Add a --strict flag to app.py that fails on unknown config keys, then  (2026-10-12 17:01)
$ claude --resume cccccccc-1111-2222-3333-444444444444
add --launch to start it now

=== 7. Hand off to another agent (Context Package)
freshness: scanned in 0.0s, 0 source(s) changed
estimated tokens: ~393
context package: <ROOT>/proj/demo\handoff-claude-cccccccc-1111-2222-3333-.md (1572 chars)
$ codex "<handoff prompt>"
add --launch to start it now

--- the package that the target agent reads ---
# Agent Handoff — Context Package

- Source: **claude** session `cccccccc-1111-2222-3333-444444444444`
- Title: Add a --strict flag to app.py that fails on unknown config keys, then add a test for it.
- Time: 2026-10-12 17:00 → 2026-10-12 17:01
- Repository: `<ROOT>/proj/demo` (branch `main`, commit `f285d267b319`)
- CWD: `<ROOT>/proj/demo`
- Model: claude-sonnet
- Usage: `{"input_tokens": 120, "output_tokens": 80, "cache_read_input_tokens": 10}`

> Note: repository state may have moved on since this session. Re-check `git status` / the files below before editing.

## User goal / instructions

**Original request:**

Add a --strict flag to app.py that fails on unknown config keys, then add a test for it.

## Where the work stopped (last assistant message)

I added --strict to load_config() and a test, but test_strict_rejects_unknown_keys is still failing: strict mode does not raise on unknown keys yet. TODO: raise on unknown keys in strict mode.

## Files this session touched

- `<ROOT>/proj/demo/app.py`

## Commands executed

- `python -m pytest -q`

## Recent timeline (condensed)

- **Assistant** [2026-10-12 17:01]: I added --strict to load_config() and a test, but test_strict_rejects_unknown_keys is still failing: strict mode does not raise on unknown keys yet. TODO: raise on unknown keys in strict mode.
- _tool_ `Bash`: python -m pytest -q
- **User** [2026-10-12 17:00]: Add a --strict flag to app.py that fails on unknown config keys, then add a test for it.

=== 8. Group the work into a WorkThread
freshness: scanned in 0.0s, 0 source(s) changed
Thread thr_d14b834a14 created
repo: <ROOT>/proj/demo
members:
  claude cccccccc-1111-2222-3333-444444444444
  codex aaaaaaaa-1111-2222-3333-444444444444
warning: working tree has 1 uncommitted change(s) in <ROOT>/proj/demo
estimated tokens: ~568
continuation bundle: <ROOT>/home\.voyager\bundles\bundle-merged-2sessions-claude-codex-1791815242.md (2272 chars)
next: pick a target agent, e.g. `voyager merge cccccccc-1111-22 --to claude` (targets with direct launch: claude, codex, grok)

=== 9. Add a second active WorkThread
Thread thr_8e117a914a created

=== 10. Now nothing guesses which one you meant
error: 2 active WorkThreads for this repo — refusing to guess which one you meant.
repo: <ROOT>/proj/demo
  thr_8e117a914a  Add a --json output mode
  thr_d14b834a14  merge: claude:cccccccc-1 + codex:aaaaaaaa-1
Pick one explicitly: --thread <id>
(The most recently active is thr_8e117a914a, but activity time is not a choice you made.)
freshness: scanned in 0.0s, 0 source(s) changed
continuity: AMBIGUOUS — 2 active WorkThreads for this repo; nothing was chosen
  thr_8e117a914a  Add a --json output mode
  thr_d14b834a14  merge: claude:cccccccc-1 + codex:aaaaaaaa-1
  pick one: voyager continue --thread <id>

=== 11. Name the thread and it proceeds
freshness: scanned in 0.0s, 0 source(s) changed
thread thr_d14b834a14  [active]  2 member(s)
warning: working tree has 1 uncommitted change(s) in <ROOT>/proj/demo
$ claude --resume cccccccc-1111-2222-3333-444444444444
add --launch to start it now

Demo complete. Everything ran under <ROOT> — the real index was untouched.
```

## Reproduce

```sh
PYTHON=python3 bash docs/demo/run-demo.sh /tmp/sf-demo
```
