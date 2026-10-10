# P8.2 — Real DSH Agent End-to-End Verification

A real DSH agent, with the plugin installed in an isolated profile and pointed at
a **synthetic** index, was asked to pick up work from other agents.  This file
records what it actually did, from DSH's own session logs — not from the final
answer alone.

Everything here is read-only with respect to user data.  No real Voyager index,
no real agent session and no real DSH profile was read or written; the profile's
patch layer was restored to `[]` when the run finished.

## Environment

| | |
|---|---|
| DSH | `0.1.5-rc.3` |
| Node | `22.22.2` |
| Python (core) | `py` launcher → 3.14, `voyager` installed editable from the checkout |
| Core commit | `bd3d2d1` (working tree, includes D20) |
| Plugin | `E:\code\dsh-sessionflow` at the commit under test, symlinked into the profile |
| Profile | `sessionflow-test` (patch layer pointed at the fixture, restored to `[]` afterwards) |
| Index | `E:\sessionflow-scratch\p8\e2e.db` — 7 sessions / 15 events / 4 WorkThreads |
| Workspaces | `E:\sessionflow-scratch\p8\demo-{auth,multi,ambig,empty}` |

The fixture is deliberately adversarial: sessions **claim** work that the
checked-out files do not contain, so an agent that trusts the handoff prose
instead of checking will say something false.

| repo | WorkThread | members | source state |
|---|---|---|---|
| `demo-auth` | `thr_6ca62a6e78` *refresh token rotation* | `claude:e2e-auth-1` | ACTIVE_SOURCE |
| `demo-auth` | (same thread) | `codex:e2e-retained-1` | **SOURCE_MISSING** |
| `demo-multi` | `thr_e5f28deb40` *training pipeline* | `codex:e2e-multi-1`, `claude:e2e-multi-2`, `dsh:e2e-multi-3` | ACTIVE_SOURCE |
| `demo-ambig` | `thr_2aca35c3c8` *ambig one* | `codex:e2e-ambig-1` | ACTIVE_SOURCE |
| `demo-ambig` | `thr_1255b536c4` *ambig two* | `claude:e2e-ambig-2` | ACTIVE_SOURCE |
| `demo-empty` | — | — | — |

All six scenarios ran to completion (`exit=0`).  In every one, all six
`sessionflow_*` schemas were offered to the model.

## Scenario results

| # | What it checks | Result |
|---|---|---|
| A | **Autonomous tool discovery** — nothing told the model to use sessionFlow | **PASS** |
| B | **Explicit tool invocation** — the prompt names the tools | **PASS** |
| C | **Cross-agent continuation** — pick up Claude's work | **PASS** |
| D | **Multi-session synthesis** — combine Codex + Claude + DSH | **PASS** |
| E1 | **Negative control** — repo with no history | **PASS** |
| E2 | **Negative control** — two WorkThreads, ambiguous | **PASS** |

### A — Autonomous discovery

Prompt (no tool named):

> 我之前在这个项目里做到哪里了？请先查阅已有工作记录，再告诉我应该从哪里继续。

12 tool calls.  The model's **first** sessionFlow action was unprompted:

```
2. sessionflow_current_work  {"repo": "E:\\sessionflow-scratch\\p8\\demo-auth"}
4. sessionflow_session       {"session_id": "claude:e2e-auth-1", "budget": "balanced"}
```

It then read the fixture's files and compared them with what the session claimed:

> 它的记录与磁盘不符 … 真正要从头做的是实现：1. 按上述规格真正实现
> `auth/rotation.py` … 2. 实现重放检测 … 3. 用真实测试替换 `assert True` 占位

**AUTONOMOUS TOOL DISCOVERY: PASS.**  **FACTUAL FIDELITY: PASS** — the fixture
claims "Rotation endpoint is implemented and the unit tests pass (12 passed)";
the agent checked the files, found a TODO stub, and refused to repeat the claim.

### B — Explicit invocation

11 tool calls:

```
1. sessionflow_current_work  {"budget": "balanced"}
3. sessionflow_continue      {"goal": "continue refresh-token rotation work: implement replay detection so it can ship"}
4. sessionflow_continue      {"goal": "...", "thread_id": "thr_6ca62a6e78"}
```

`continue` was called with the **correct WorkThread id** for the repo, and the
answer separated the recorded plan (P0) from the recorded TODO (P1: replay
detection) and flagged the test suite as a shell:

> 现有 `tests/test_rotation.py` 是空壳，`pytest -q` 的"12 passed"无从谈起

**EXPLICIT TOOL INVOCATION: PASS.**  **CONTINUATION CONTEXT: PASS.**

### C — Cross-agent continuation

17 tool calls; `sessionflow_current_work` → `sessionflow_session(claude:e2e-auth-1, budget=full)`
→ `sessionflow_recent`.

The agent identified the handoff record as inconsistent with the checkout and
stopped to confirm scope rather than guessing which of two failure modes applied:

> 交接报告本身是夹具产物，描述了一堆从未发生的工作。如果我照着它往下写，会有两种风险：
> 要么我把"假的已完成"当真而漏掉核心实现，要么我重做一遍你手上可能真实存在的实现

It then proposed the concrete next steps (hash storage, per-use rotation,
absolute TTL, replay detection).  **CROSS-AGENT RETRIEVAL: PASS** — it found the
Claude session in the right thread and did not pull in other projects.

### D — Multi-session synthesis

27 tool calls.  It read **all three** providers from the index:

```
10. sessionflow_current_work  {"repo": "demo-multi"}
11. sessionflow_session       {"session_id": "codex:e2e-multi-1",  "budget": "full"}
12. sessionflow_session       {"session_id": "claude:e2e-multi-2", "budget": "full"}
13. sessionflow_session       {"session_id": "dsh:e2e-multi-3",    "budget": "full"}
15-18. sessionflow_search × 4 (checkpoint / eval.py / training pipeline / integration test)
```

It reported the **conflicts** it found rather than flattening them, and gave a
dependency-ordered next-step sequence (1→5).  Most importantly:

> 我的全部结论基于文件内容、sessionFlow 索引与 fixture 源码三方交叉，**未依赖任何
> session 的自我汇报**

**MULTI-SESSION SYNTHESIS: PASS.**  **No fabricated completion states.**

### E1 — Repo with no history

12 tool calls: `current_work` (no thread) → `recent` → `search("demo-empty")` →
`search("only.py")` → 0 hits.

> 关键词搜索 `demo-empty`、`only.py` → 均 0 命中 … 工作区里唯一的文件是 `only.py`，
> 内容只有一行 `pass`

It then noted that the *parent* directory does have other projects, and listed
them — without attributing any of it to `demo-empty`.

**ERROR HANDLING: PASS** — no invented history, and no cross-project bleed.

### E2 — Two WorkThreads, ambiguous

5 tool calls.  `current_work` returned one thread; `recent` revealed a second, and
the agent refused to pick:

> 这个仓库下目前有 **两个都处于 active 状态的 WorkThread**，所以我不能替你猜是哪一个 ——
> 简单按"最近"选会答错

Both threads were listed with their members and their own recorded conclusion,
and then:

> `current_work` 按更新时间自动选了 `ambig two`（它比 `ambig one` 晚约 0.5 秒），
> 但这只是"最新"，不代表你要继续的那条线。

**ERROR HANDLING: PASS.**  This is also a live confirmation of D20's semantics:
"latest activity" is reported as a fact about recency and explicitly not as a
verdict about which line of work is correct.

## What this does and does not prove

**Proven** (real model, real DSH runtime, real plugin, real core subprocess, real
index — no mocks):

- six tools registered and offered to the model
- autonomous selection: the model chose `sessionflow_current_work` unprompted
- explicit selection: `continue`/`session` with correct thread and session ids
- the plugin's results carried the fixture's data, so the bridge really executed
- the model read cross-agent history, distinguished completed from outstanding,
  and refused to repeat unverified self-reports
- negative controls behaved: no invented history, no silent thread choice

**Not proven here:**

- **native resume** was never exercised.  The fixture's `codex:e2e-retained-1`
  is `SOURCE_MISSING`, and the agents correctly described it as context-only
  rather than claiming a native resume — but no agent actually launched another
  agent's session, so *"native resume works"* remains **NOT VERIFIED**.
- `sessionflow_merge` was not called in any scenario.  Scenario D reached the
  same goal with `session`×3 + `search`×4; whether `merge` is the better tool
  there is a question about tool choice, not about correctness, and is not
  settled by this run.
- This is a **synthetic** index.  Nothing here says anything about indexing real
  provider session files.

## Environment caveat (affects the transcripts, not the plugin)

In every scenario the DSH agent's own `pwsh` tool failed with
`[exit code: 4294901760]` (a Windows PowerShell/.NET initialisation error in this
machine's environment), so the models could not run `git` or `pytest` and said so
explicitly.  That is a property of this workstation, not of the plugin or the
core — the plugin's own subprocess calls (through the bridge) worked throughout.

## Reproducing

The harness is development scratch, not shipped code — it hard-codes an `E:`
scratch root and a local profile name, which is fine for a one-off run and not
fine for a repository.  Two scripts, both re-runnable:

```
<scratch>\seed_e2e.py     # builds the fixture index and the demo repos
<scratch>\run_e2e.sh A B C D E1 E2
```

`seed_e2e.py` writes only under its own scratch root: it never reads a real
Voyager index and never writes to a real agent session.  `run_e2e.sh` backs up
the profile's `cordis.patch.yml`, points `voyagerBin`/`voyagerArgs` at the
fixture, runs each scenario in its own demo repo, extracts the tool trajectory
from DSH's session log, and restores the patch to `[]`.

Two things to get right if you rebuild it:

* pass `voyagerBin: 'py'` and `voyagerArgs: ['-m', 'voyager.cli', '--db', <index>]`
  — the configured executable must be able to `import voyager` **from the
  workspace directory**, which a bare `python` on this machine cannot;
* run `dsh` with `PYTHONPATH` and `NODE_OPTIONS` cleared, because this
  workstation injects a Python `sitecustomize` shim through `PYTHONPATH` that
  the plugin's child process would inherit, stalling every bridge call.

To rebuild the harness rather than run it, the shape is: a `Store` at the
fixture path, one `replace_session` per provider with real `new_event` records,
`thread_create` + `thread_attach` for each thread, and — for the retained case —
`UPDATE sessions SET source_state='SOURCE_MISSING'` after the rows exist.
