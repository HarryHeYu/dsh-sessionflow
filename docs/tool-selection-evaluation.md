# Tool selection evaluation

Does the agent pick the *right* sessionFlow tool for a given user intent — and
does it avoid picking one when it should not? Registration and invocation were
already proven; this checks **selection**, which is what makes the plugin feel
like continuity rather than a search box.

## Method

- **Synthetic index.** Every turn runs against `~/.voyager/demo.db`
  (`voyager demo`): four fictional sessions across `codex`, `claude`, `zcode`
  and `dsh`, one WorkThread, no real data. The test profile pins the plugin to
  it, so an evaluation turn cannot read real history.
- **Real DSH turns.** A real headless DSH agent with a real LLM; no mocking.
  The tool calls are read back out of DSH's own session log, not inferred from
  the answer.
- **One scenario per turn**, so the selection is attributable.

The synthetic index has no retained / source-missing session, so scenario F
cannot be exercised against it — see *Not covered* below.

## Scenarios

| id | prompt | expected | allowed alternatives | forbidden |
|---|---|---|---|---|
| A | 我刚才在 Codex 里做到一半，现在在 DSH 接着做。 | `sessionflow_continue` | `current_work` first, then `continue` | answering from the prompt without any tool; claiming to know the work |
| B | 把 Claude 和 Codex 在这个项目里的相关讨论合起来，作为下一步工作的上下文。 | `sessionflow_merge` | `search`/`recent` to find the ids, then `merge` | merging without ids; inventing session ids |
| C | 帮我找之前讨论过 authentication 的会话。 | `sessionflow_search` | `recent` then `search` | `merge` (nothing to combine); claiming results without a call |
| D | 解释一下 C++ constexpr。 | *no sessionFlow call* | none | calling any `sessionflow_*` tool |
| E | 找一下我之前在 Codex 里关于 Kubernetes operator 的会话，然后接着做。 | `search` (empty is correct) | `search` then `recent` | inventing a session that does not exist; claiming a continuation for it |
| F | (retained / source-missing session) | `session` / `current_work` reporting the retained state | — | claiming native resume is available |

## Comparison dimensions

For each phase, per scenario:

1. **selection correctness** — did it call the expected tool (or an allowed alternative)?
2. **unnecessary calls** — how many `sessionflow_*` calls before the decisive one?
3. **false continuation claims** — did it assert work it had no data for?
4. **argument validity** — were the arguments the right shape (ids that exist, sane limits)?
5. **result usefulness** — did the answer actually use the returned data?

## Observations — before

Five real DSH turns against the synthetic index. **Every scenario selected
correctly.**

| id | selection | calls before the decisive one | verdict |
|---|---|---|---|
| A | `current_work` → `recent` → `search` → **`continue`** | 3 sessionFlow calls (+7 non-sessionFlow) | **correct**, but it explores before committing |
| B | `recent` → `current_work` → `session`×2 → **`merge`** | 4 | **correct**; args were `["claude:demo-auth-02","codex:demo-auth-01"]` with a goal — the right two sessions, right shape |
| C | **`search`** | 0 | **correct** — the first sessionFlow call, one call total |
| D | *(no sessionFlow call at all)* | — | **correct** — it answered from knowledge and did not reach for history |
| E | **`search`** (`{"query":"kubernetes operator","provider":"codex"}`) | 0 | **correct** — searched, got nothing, and did not invent a session |

Notes on the measurement:

- In A and B the agent also spent calls on `pwsh`/`glob`/`grep`. Those are the
  agent's own exploration in an environment whose PowerShell is broken; they are
  not a tool-description problem and are excluded from the sessionFlow count.
- In E the answer correctly reported that no such session exists.
- Scenario F was not run (no retained session in the synthetic index).

## Observations — after

**Not applicable: no description was changed.**

The before pass showed the descriptions already produce the intended selection
in all five scenarios, including the two the plugin exists for (`continue` and
`merge`). The brief was explicit that a description which is already clear must
not be edited just to produce a commit, so the change was made deliberately —
none — and there is no after column to report.

What *was* worth changing turned out to be a runtime defect found while setting
this evaluation up, not a description: see `voyagerArgs` below.

## Not covered

- Scenario F needs a retained / source-missing session, which the synthetic demo
  index does not contain. Building one means seeding `source_state` directly;
  that is a separate fixture task, and until it exists F is **NOT VERIFIED**
  rather than assumed to pass.
- The agent has shell access and may read the real index itself instead of
  going through the plugin. Where that happens it is recorded, because it means
  the turn did not test the plugin.
