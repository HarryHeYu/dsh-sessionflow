# P9 — Real-Provider Continuation and Tool-Contract Verification

P8 proved a real DSH agent could continue work from a **synthetic** index.  P9
asks the harder question: does the chain still hold when the sessions came from
the real provider CLIs, and are the six tools' contracts what they claim?

Everything below is read-only with respect to user data.  The isolated HOME is
`E:\sessionflow-scratch\p9\p92\home`; the user's real `~/.codex`, `~/.claude`,
`~/.dsh` profiles and Voyager index were never written to, and the one profile
whose patch layer was used was restored to `[]`.

## Environment

| | |
|---|---|
| DSH | `0.1.5-rc.3` |
| Node | `22.22.2` |
| Python (core) | `py` launcher, `voyager` installed editable from the checkout |
| Core | `bdd4a1d` (P9.1) |
| Plugin | `7bb324d` / `952fd18` |
| Real CLIs present | `claude` 2.1.78, `codex-cli` 0.157.1 |

## P9.2 — real provider session files

### What the two halves are

| half | what it is | label |
|---|---|---|
| **A** | 3 real Codex `rollout-*.jsonl` + 3 real Claude Code `<sessionId>.jsonl`, produced by those CLIs on this machine, **copied** into an isolated HOME | REAL PROVIDER FILES |
| **B** | two sessions written in the same documented formats, whose `cwd` is a synthetic git repo | REAL-FORMAT FIXTURE VERIFIED |

Nothing measured on half B is evidence about a real CLI's behaviour, and the
labels above are kept apart throughout.  Half A is what makes the discovery →
parse → index part real; half B is what makes the *continuation* scenario
possible, because a real session points at a real project and this run must not
touch one.

### The chain, measured

```
real + real-format files
  → adapter discovery      codex 4, claude 4, every other provider 0
  → parsing + SQLite       8 sessions / 33 events
  → WorkThread             thr_d153900c2a, created by `voyager merge`
  → DSH plugin → LLM       one real turn
  → continuation context   agent implemented the outstanding item
```

Per-session checks (all PASS): provider identified, session id resolves
unambiguously, repo attribution matches the work repo, the source is
`ACTIVE_SOURCE`, the key facts are retrievable (the implemented helpers, the
test run, the boundary issue, the explicit "NOT implemented" note), user-channel
records carry a structural origin, and FTS search reaches both sessions.

### Fixture inventory

| | |
|---|---|
| isolated HOME | `E:\sessionflow-scratch\p9\p92\home` |
| real files | 3 × `rollout-*.jsonl` (Codex) + 3 × `<uuid>.jsonl` (Claude Code) |
| continuation repo | `...\p92\work` — `calc.py` + `tests/test_calc.py` |
| continuation sessions | `codex:a1b2c3d4-0000-1111-2222-333344445555`, `claude:p92-claude-1` |
| merge repo | `...\p92\mergework` — `parser.py` + `tests/test_parser.py` |
| merge sessions | `codex:b2c3d4e5-0000-1111-2222-333344445555`, `claude:p93-claude-1` |
| index | `...\p92\index3.db` (8 sessions), `...\p92\index4.db` (10, adds the merge pair) |

The WorkThread the continuation turn used, `thr_d153900c2a`, was created with
`voyager merge` — the documented way to get one from sessions, since the plugin
has no thread-create tool.  Nothing was injected into the index directly: both
scenarios are `.jsonl` files read by the real adapters.

### An isolation finding worth keeping

Redirecting **HOME alone is not enough to isolate a scan**.  The first run was
supposed to see 8 sessions and saw **15**: the Kiro adapter resolves its root
from `%APPDATA%`, not from HOME, so it indexed the machine's real Kiro history.
`APPDATA` and `LOCALAPPDATA` had to be redirected too before the scan contained
only what the fixture put there.

This is not a defect — each provider stores its data where it stores it — but it
is a trap for anyone writing an isolation test or a sandbox, so the fixture sets
all four variables and the scan is asserted to contain exactly `{codex, claude}`.

### The continuation turn

Prompt (nothing about tools, and it does not name a session):

> 查阅这个项目之前在 Codex 和 Claude Code 中做过的工作，确认已经完成的内容和还没有完成的问题，然后接着做下一步。可以直接改代码并运行测试。

The agent:

1. found WorkThread `thr_d153900c2a` through the plugin and named both members;
2. reported Codex's session as **completed** (add/mul implemented, tests written)
   and Claude's as **review only**, quoting its explicit *"I have NOT
   implemented it — this is still open"*;
3. **checked the repository** before believing either: `calc.py` had only
   `add`/`mul`, the tests only `test_add`/`test_mul`, worktree clean at HEAD;
4. implemented the outstanding item exactly as the earlier session specified —
   `div(a, b)` raising `ValueError('division by zero')` — and added two tests,
   without touching `add`/`mul`;
5. **said plainly that it could not run the tests**, because this machine's
   PowerShell host fails to start (`exit code 4294901760`), and did not claim
   they passed.

Independent check of its work (run by the harness, not by the agent):

```
python -m pytest tests/test_calc.py -q   →   4 passed in 0.03s
git diff --stat                          →   calc.py +6, tests/test_calc.py +13
```

**Labels**

| capability | result |
|---|---|
| CONTEXT HANDOFF VERIFIED | **PASS** |
| TASK CONTINUATION EXECUTED | **PASS** (repo modified; the result independently runs) |
| TEST EXECUTION BY THE AGENT | **NOT VERIFIED** — the sandbox's shell is broken; the agent said so instead of asserting success |
| NATIVE RESUME | **NOT VERIFIED** — see below |

### Native resume — why it is still NOT VERIFIED

`claude` and `codex` are both installed and both answer `--version`, and their
adapters declare `can_resume`.  A real resume was still not run, because doing
so would (a) invoke the model — the user's credentials and quota, which needs
authorisation — and (b) create a new session inside the user's real agent
environment, which this stage is explicitly forbidden from polluting.  A
redirected HOME cannot substitute: the session being resumed lives in the real
one.

So: `codex`, `claude`, `dsh`, `grok` stay **NOT VERIFIED** for native resume;
`zcode`, `cursor`, `kiro`, `antigravity` stay **UNSUPPORTED** (`can_resume =
False`).  The README's capability matrix now says explicitly that its `Resume`
column names a command, not a verified outcome.

## P9.3 — the six tools

### Contract matrix

| tool | bridge target | required args | covered by |
|---|---|---|---|
| `sessionflow_search` | `api search` | `query` | unit + integration (incl. CJK, spaced repo, empty) |
| `sessionflow_recent` | `api overview` | — | **integration (new)** + empty case |
| `sessionflow_session` | `api bundle_preview` | `session_id` | **integration (new)** + unknown ref |
| `sessionflow_current_work` | `api current_work` | — | unit + integration + **ambiguity passthrough (new)** |
| `sessionflow_continue` | `api continue_context` | — | unit + integration + no-sessions error |
| `sessionflow_merge` | `voyager merge --json` | `session_ids` | unit + **integration (new)** + live |

Common to all six, asserted in the suite: the six names are exactly what
`apply` registers, each carries a description, the required-argument tools
reject a missing argument, each forwards the documented op, results are
structured JSON, and failures arrive as typed bridge errors (`BAD_JSON`,
`TIMEOUT`, `CLI_FAILED`, `INCOMPATIBLE`, `VOYAGER_NOT_FOUND`) rather than
crashes.  P8's rule — a configured core is authoritative and cannot be silently
swapped for another index — is covered by its own tests.

### Merge: three conclusions, kept apart

The P8 report could only say "not called".  P9 separates the three claims:

| claim | result | evidence |
|---|---|---|
| **Tool callable** | **PASS** | integration test runs the real `voyager merge --json`: creates a WorkThread, `member_count == 2`, both sources present with provenance, the review finding survives, re-merging does not fork a second thread, the context is byte-identical across runs, and a merge naming an unknown session does not silently succeed |
| **Agent autonomously selected it** | **NOT VERIFIED** | the autonomous turn (28 tool calls, no tool named) reached a correct answer with `current_work` + `recent` + `search` + `session`×3 and never called `merge` |
| **Merge output semantically correct** | **PASS** | the explicit turn called `sessionflow_merge` with both ids; the answer carried a common goal, completion status, the conflict, and the outstanding items |

The autonomous turn is not a failure of the tool — it answered the question
correctly, and `session` + `search` was a reasonable route.  It does mean the
model does not reach for `merge` unprompted, which is a tool-selection
observation, not a contract defect, and the description was deliberately left
alone (P8 measured that editing these descriptions for selection reasons makes
selection worse).

### What the live turns actually caught

Both merge turns, and the P9.2 turn, independently checked the sessions'
claims against the checkout instead of repeating them.  In the merge scenario
that meant reporting that **both** agents' headline claims were unsupported:

* Codex's "five tests pass" — the test file defines one test;
* Codex's "add an LRU cache next" — no profiling artefact exists, and the
  premise is unverifiable;
* Claude's "the boundary check is off by one" — `parser.py` has no boundary
  check at all;
* and a provenance mismatch: the session metadata records branch `main`, the
  checkout is on `master`.

The fixture's claims were written to be plausible-but-unverified; the agent
falsified them rather than merging them into a summary.  That is the behaviour
the "an assistant statement is not verified fact" work (P5/P8) was for, seen
from the far end.
