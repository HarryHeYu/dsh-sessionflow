# P13 — sessionFlow Agent Discovery & Tool Selection

P12 concluded that a bare "continue the unfinished work" prompt never triggers
the sessionFlow tools, and drew the wrong reason from it. This round reproduces
the behaviour under controls, tests one intervention, and reports what happened.

**Outcome: REVERT — no code change. The shipped code is unchanged at `c4a6143`.**

## Environment — held constant across every run

| | |
|---|---|
| model | `qwen/qwen3-coder` via OpenRouter |
| index | `p12/index-b.db` (one Codex session + one Claude session) |
| project | `p12/demo/csvstats`, suite green, `mean([])` raises `ZeroDivisionError` |
| the hidden work | *only* in the sessions — no test covers it, so the repo looks finished |
| DSH home / profile | `p12/dshhome` / `p12demo`, plugin pointed at that index |
| tool registry | 31 tools; all six `sessionflow_*` in every request header |

The last row matters: a run that calls none of the six is not a registration
failure. Verified from the request header of a zero-call run.

## Phase 1 — baseline, 3 prompt variants × 3 repeats

| prompt | n | sessionFlow **first** action | Codex member returned | hidden work done | suite still passing |
|---|---|---|---|---|---|
| A "Continue the unfinished work in this project." | 3 | **1/3** | 1/3 | **1/3** | 1/3 |
| B "Continue the unfinished **Codex** work in this project." | 3 | **3/3** | 3/3 | **3/3** | 3/3 |
| C "What was I working on before? Continue from there." | 3 | **3/3** | 3/3 | **3/3** | 3/3 |

Two controls, because the constraint list forbids the obvious "fix".

A **negative** control — a fresh task that needs no history at all:

| prompt | n | sessionFlow calls | outcome |
|---|---|---|---|
| D "Add a stdev() function to csvstats.stats with tests…" | 3 | **0/3 — correct** | wrote stdev; broke the suite in **3/3 on its own** |

D is why "call sessionFlow more often" is the wrong objective: the model's
baseline coding is unreliable, so forcing an extra retrieval step would not
repair anything and would add a failure mode.

An **ambiguity** control — a second active WorkThread on the same repo, plus the
vague prompt:

| prompt | n | sessionFlow calls | behaviour |
|---|---|---|---|
| E "Continue the unfinished work…", 2 active threads | 3 | 1/3 | the one call returned `thread_ambiguous: true` + `thread_candidates` with **both** ids — no silent pick |

The safety property holds: with two threads the tool reports the ambiguity and
lists candidates rather than guessing, which is what the core already promises
and is now confirmed at the agent layer.

## Phase 2 — what the failure is *not*

The obvious hypothesis — the descriptions are missing the trigger — is false, and
the repository disproves it. `sessionflow_continue` has said this since before
this round:

```ts
'This is the core of the plugin: call it when the user says ' +
'"continue", "keep going", or "pick this up".'
```

Prompt A is literally that phrase, and 2 of 3 runs ignored the tool anyway. The
trigger words are already published; the model still reads "continue the
unfinished work" as an instruction to *write code*, not to *look anything up*.
That is a retrieval-initiative problem, and it is the same reason P5's
description rewrite made things worse and had to be reverted.

Two further findings from scoring itself:

- The trace displayer cuts tool results at 400 characters, and the member list
  sits **after** the cut. A scorer that reads the reported trace therefore
  returns `saw_codex_session: false` for runs that demonstrably received the
  Codex member. The scorer was corrected to read the session log, not the trace.
  Worth recording because it nearly produced a false negative about the most
  important capability in this repo.
- Model randomness is real but small at n=3: A and E each produced one
  retrieving run out of three.

## Phase 3 — the one candidate worth testing

Not a rewrite. One sentence appended to the existing description, stating the
thing the model cannot infer from a green repository:

> When the request is to continue or finish work, call it *before* editing: a
> repository whose tests pass does not show which work an earlier agent left
> unfinished, and that is exactly what this returns.

No system prompt, no forced behaviour, no claim the tool does not earn.

## Phase 4 — controlled comparison

| | first action = sessionFlow | sessionFlow used | hidden work done | suite 9-passed | invented files (>2) |
|---|---|---|---|---|---|
| A baseline | 1/3 | 1/3 | 1/3 | 1/3 | 1/3 |
| X with the sentence | 1/3 | 1/3 | 1/3 | 1/3 | **3/3** |
| D control (fresh task) baseline | 0/3 | 0/3 | 0/3 | 0/3 | 1/3 |
| Y control (fresh task) with it | **0/3** | **0/3** | 0/3 | 0/3 | 3/3 |

The one thing the sentence accomplished was the thing it had to avoid: it did
**not** make sessionFlow fire on a fresh task (0/3 both arms). That is the
constraint respected.

The thing it was supposed to accomplish did not happen: retrieval on the failing
prompt stayed at **1/3**. n=3 cannot separate "no effect" from "slightly worse",
and the invented-file count moved the wrong way in both experiment arms — with
the description change present, the loose prompts produced more stray files.

## Phase 5 — decision: REVERT

No stable benefit on the scenario the change targeted, no evidence of benefit
anywhere else, and a direction that also made noise worse. Reverted; the plugin
is byte-identical to `c4a6143`.

The negative-control result is the useful part: **0/3 calls on a fresh task is
the correct behaviour, and it held.** The tools do not fire where they should
not. The gap is narrow and specific — a vague "continue" instruction on a repo
that hides its own unfinished work.

## What is genuinely recommended

- **Prompt side, not description side.** B and C — naming the earlier agent, or
  asking what was being worked on — retrieve correctly in 3/3. The P12 demo now
  says this, and says that "question vs action" was the wrong lesson.
- The repo's own quickstart can name the phrasing that works. That is
  documentation, costs nothing, and is reversible.
- Rewriting descriptions again should be treated as a known-bad move, on the
  strength of P5 and now this.

## Verification

- `npm run build` clean; `npm test` **50/50, 0 skipped**; `npm pack --dry-run`
  24 files, 30.3 kB.
- Live re-verification after revert, same environment: prompt C →
  `sessionflow_current_work` first, Codex member returned, `mean([])` now raises
  `ValueError`, **9 passed**.
- No native-resume overclaim added; no real HOME/profile touched — every run
  used the isolated `DSH_HOME`, and `~/.voyager/bundles/` stayed at 189.
- The ambiguity-testing thread was archived afterwards, restoring the demo index
  to the single thread the P12 doc describes.
- Plugin GitHub Actions: green on `c4a6143` (the commit the shipped code is).
