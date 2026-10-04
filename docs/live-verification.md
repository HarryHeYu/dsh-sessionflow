# Live verification

What was actually run, against what, and what it proved. Nothing here is
promoted: a row says what the evidence shows and no more.

## Environment

| Item | Value |
|---|---|
| DSH | `@deepseek-ai/dsh` 0.1.5-rc.3 |
| Cordis | `@deepseek-ai/cordis` 4.0.2 |
| Node | 22.22.2 |
| npm / pnpm | 10.9.7 / 11.22.0 |
| sessionFlow / Voyager | commit `13e4372` (editable install, `voyager` on PATH) |
| dsh-sessionflow | commit `9b64848` |
| Profile | `sessionflow-test` (base + headless + opencode-go + dsh-sessionflow) |
| Test repository | `E:\code\voyager` |
| Platform | Windows |

The agent runs the real headless DSH app against a real LLM turn; no part of
the loop is mocked. Evidence is read from DSH's own session log
(`~/.dsh/sessions/…/session.v3.jsonl.zstd`), which records every `tool/call`
and `tool/result`.

## Live Test 1 — natural-language tool discovery

**Prompt** (no tool name mentioned):

> 我之前这个项目做到哪了？查看一下之前的工作，告诉我当前进度和接下来应该继续什么。

**Result: PASS.** The agent's *first action* was the sessionFlow tool.

Tool schemas present in the request header — all six:
`sessionflow_search`, `sessionflow_recent`, `sessionflow_session`,
`sessionflow_current_work`, `sessionflow_continue`, `sessionflow_merge`.

Tool calls actually made (4):

| # | step | tool | arguments |
|---|---|---|---|
| 1 | 1 | `sessionflow_current_work` | `{"repo":"E:\\code\\voyager"}` |
| 2 | 6 | `sessionflow_recent` | `{"repo":"voyager","hours":400,"limit":10}` |
| 3 | 8 | `sessionflow_search` | `{"query":"DSH bridge dsh-sessionflow","repo":"voyager","limit":10}` |
| 4 | 9 | `sessionflow_search` | `{"limit":12,"query":"DSH bridge machine-readable ops thin client"}` |

Each call has a matching `tool/result`. The results carried **real index data**,
not a stub:

`sessionflow_current_work` returned a real WorkThread —

```json
{ "repo": "E:\\code\\voyager", "has_thread": true,
  "thread": { "id": "thr_0854d50b88", "title": "Continuity Engine build-out",
              "repo_root": "E:/code/voyager", "status": "active",
              "goal": "complete the roadmap", "members": 15 },
  "members": [ { "provider": "zcode",  "id": "zcode:sess_f331595d-…" },
               { "provider": "claude", "id": "claude:08563967-…" }, … ] }
```

`sessionflow_recent` returned the real index census —

```json
{ "stats": { "sessions": 266, "events": 150089,
             "by_provider": { "codex": 108, "zcode": 78, "grok": 25,
                              "dsh": 21, "antigravity": 14, "claude": 9,
                              "kiro": 7, "cursor": 4 } } }
```

The two searches returned `count: 0` — correct: neither phrase is in the index
yet (they describe this very work). Empty is a valid answer, not a failure.

The agent's final answer (≈32 KB) reasoned over that data — it named the real
thread `thr_0854d50b88`, the real open debts, and what to do next — rather than
restating the prompt.

**Proves:** tool registration visible to a real agent; autonomous natural-language
tool selection; real agent tool invocation; the Voyager bridge executed through
DSH; cross-agent history retrieved (thread members span `claude` and `zcode`;
the index spans eight providers).

## Live Test 2 — explicit invocation

**Prompt:**

> 请使用 sessionflow_current_work 工具检查当前仓库，告诉我之前做到哪里了。…

**Result: PASS.** `tool/call` records: `sessionflow_current_work`. Tool schemas
present in the request header. The turn was cut short by a sandbox file-access
interception before a final answer, but the invocation and its result are
recorded.

## Live Test 3 — cross-agent continuation

**Prompt:**

> 找一下我之前在其他 coding agent（Codex/Claude/Grok/ZCode 等）里对这个项目做过的最近工作，把相关上下文整理出来，并告诉我现在应该从哪里继续。

**Result: PASS.** Eight `tool/call` records, a logically correct chain:

| step | tool | arguments |
|---|---|---|
| 2 | `sessionflow_current_work` | `{"budget":"balanced","repo":"voyager"}` |
| 3 | `sessionflow_recent` | `{"hours":96,"limit":15,"repo":"voyager"}` |
| 5 | `sessionflow_session` | `{"budget":"balanced","session_id":"codex:01a0e7a2-6b1f-7011-ad65-103e17fb1094"}` |
| 6 | `sessionflow_recent` | `{"hours":240,"limit":20}` |
| 6 | `sessionflow_search` | `{"query":"O6 truth-up","limit":10}` |
| 8 | `sessionflow_recent` | `{"hours":240,"provider":"dsh","limit":10}` |
| 8 | `sessionflow_search` | `{"limit":10,"query":"dsh-sessionflow"}` |
| 11 | `sessionflow_search` | `{"limit":12,"provider":"dsh","query":"voyager"}` |

The agent's own narration in the transcript: *"The sessionFlow MCP gave a rich
continuation bundle."* The returned data carried a real codex session id
(`codex:01a0e7a2-…`) and a real dsh session, and the agent's final answer
(≈95 KB) is built from that cross-agent history rather than from the prompt.

## Live Test 4 — search with a keyword that exists

**Prompt:**

> …然后用 sessionflow_search 搜索 'continuation bundle' 相关的历史会话，列出前 3 条（provider、title、repo、时间）。

**Result: PASS.** `sessionflow_search` returned **20 hits**, and the agent
de-duplicated them into distinct sessions with provider / title / repo / time:

```
1. zcode:sess_f331595d  "探索仓库并检索玩具项目创意"      E:/code/voyager   2026-09-19
2. claude:08563967      "hello"                            E:/code/voyager   2026-09-24
3. grok:01a0aa4b        "Cross-agent chat switch: …"       E:/code/voyager/  2026-09-16
4. zcode:sess_ec903769  "（Phase A 门禁…"                  E:/code/voyager   2026-09-28
```

Earlier searches for phrases that do not exist in the index correctly returned
`count: 0` — an empty result is a valid answer, not a failure.

## Tools exercised live

| Tool | Live-invoked |
|---|---|
| `sessionflow_current_work` | yes |
| `sessionflow_recent` | yes |
| `sessionflow_session` | yes |
| `sessionflow_search` | yes |
| `sessionflow_continue` | no — but the continuation engine ran inside `sessionflow_current_work`, whose result carries the compiled bundle (`continuation`, `estimated_tokens`, `dropped`, `trimmed`) |
| `sessionflow_merge` | no — registered and visible to the agent, but not chosen in these turns |

## Known limitation on the tested machine

`dsh plugin add` / `install` for a **local path** (`link:` / `file:`) did not
materialise the package link under pnpm 11.22.0 with the `hoisted` linker, so
the profile's `node_modules` entry had to be created as a junction. This is not
specific to this package: the known-good third-party bundle `dsh-save-money`
failed identically in the same profile. Registry dependencies install normally.
Bundle discovery and composition were verified regardless.

A second environment note: the sandbox's terminal executor fails to start
PowerShell in this environment, so the agent could not use shell tools during
the turns. That did not affect the sessionFlow tools, which are native tools
rather than shell commands — which is precisely the point of the bridge.

