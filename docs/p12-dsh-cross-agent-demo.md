# P12 — Codex → DSH and Codex + Claude → DSH, end to end

A short, real, reproducible demo of the thing this plugin exists for: an agent
picks up work another agent left unfinished, including when the repository does
**not** show that anything is unfinished.

Everything below is derived from DSH's own session logs and from running the
project's tests. Nothing is re-narrated by hand, and nothing is a screenshot.

## The project

`csvstats` — a three-function stats module with a green test suite (8 passed).

The catch is deliberate, and it is the whole point: the suite is green because
the unfinished case **has no test**. `mean([])` raises `ZeroDivisionError`; the
agreed contract is `ValueError`. The only record that this is unfinished is in
the earlier agents' sessions:

> "Because the test is missing, `pytest` says everything is fine and will keep
> saying so. Nothing in the repository records that this is unfinished — the
> only place it exists is this session."
> — the Codex session

A demo whose TODO is written in the source proves nothing: any agent finishes it
by reading the file. This one can only be finished by *recovering the prior
work*, which is what the plugin is for.

## Scenario A — Codex → DSH

```sh
$ dsh --profile p12demo "What was I working on in this project before? Continue the unfinished Codex work."
```

The agent's **first action** was `sessionflow_current_work`, and the core
answered with the Codex session — correct provider, correct repo, correct title:

```
 1. sessionflow_current_work({"repo":"csvstats"})   <<< sessionFlow
    -> { "repo": "csvstats", "has_thread": false,
         "session": { "id": "codex:7f3c1a90-...",
                      "title": "Add descriptive statistics to csvstats: implement mean,
                                median and percentile in csvstats/stats.py. Stdlib only, no depe…",
                      "cwd": "E:/sessionflow-scratch/p12/demo/csvstats" } }
 2. read({"file_path":"csvstats/stats.py"})
 3. read({"file_path":"tests/test_stats.py"})
 4. pwsh({"command":"python -m pytest -v"})
 5. pwsh({"command":"python -m pytest tests/ -q"})
 6. edit({"file_path":"csvstats/stats.py",   … def mean(values): …})
 7. edit({"file_path":"tests/test_stats.py", … def test_mean_basic(): …})
 …
13. update_goal({"action":"complete"})
```

`has_thread: false` is correct here: scenario A has one Codex session and no
WorkThread was ever created for it. The plugin says so rather than inventing one.

**What changed** (from `git diff --stat`):

```
 csvstats/stats.py   | 2 ++
 tests/test_stats.py | 6 ++++++
 2 files changed, 8 insertions(+)
```

```
$ python -m pytest tests/test_stats.py -q
9 passed in 0.01s
```

8 → 9: the agent added the missing test, which is the acceptance criterion.

## Scenario B — Codex + Claude → DSH

Same project, same prompt, but the two sessions were first merged into a
WorkThread (the documented way to say "these belong together"):

```sh
$ voyager merge codex:7f3c1a90-... claude:c1a2b3c4-... \
      --thread-title "csvstats: finish mean([]) contract" \
      --goal "Finish the unfinished csvstats work: make mean([]) raise ValueError and add the missing test."
```

Now `current_work` reports a thread, and both providers are members:

```
 1. sessionflow_current_work({"repo":"csvstats"})   <<< sessionFlow
    -> { "repo": "csvstats", "has_thread": true,
         "thread": { "id": "thr_cb98303f54", "status": "active", "members": 2 },
         "members": [ { "provider": "codex",  … }, { "provider": "claude", … } ] }
 2. read({"file_path":"csvstats/stats.py"})
 3. read({"file_path":"tests/test_stats.py"})
 4. pwsh({"command":"python -m pytest -v"})
 …
 7. edit({"file_path":"csvstats/stats.py",   …})
 8. edit({"file_path":"tests/test_stats.py", …})
```

```
$ python -m pytest tests/test_stats.py -q
9 passed in 0.02s
```

Both sources are visible to the agent in the compiled context, and the bundle
keeps them apart rather than blending them — see
[the bundle below](#what-the-agent-actually-received).

## What the agent actually received

The continuation bundle the plugin hands the agent (`voyager merge --json`,
abridged). Note the two things it refuses to do: call the newest session the
correct one, and call a conclusion a fact.

```
## Goal
**Primary user goal:** Finish the unfinished csvstats work: …

## Goal-ranked evidence
- [claude:c1a2b3c4-…-#4] (assistant, score 10.981) Review of csvstats/stats.py …
- [codex:7f3c1a90-…-#9]  (assistant, score 10.043) … mean() still has no empty-input guard …
- [codex:7f3c1a90-…-#1]  (user,      score  9.943) … mean([]) has to raise ValueError …

## Latest assistant conclusion
**Where work stopped (active session: `claude` …) -- that session's latest
conclusion, read as what it said rather than as verified fact:**

## Other sessions' conclusions
> A newer session is not automatically more correct -- where they disagree with
> the section above, keep both readings and check the repository snapshot, files
> and commands below before deciding.

## Current repository state (live snapshot)
- Git Branch: `master`   - HEAD Commit: `e455ea2`   - Working Tree: clean

## Files touched across sessions
## Commands executed
## Evidence & Provenance
```

## The part that did not work, which matters more than the part that did

With the *bare* prompt — `"Continue the unfinished work in this project."` — the
agent **never called a single sessionFlow tool**. Twice:

| run | prompt | sessionFlow calls | outcome |
|---|---|---|---|
| A1 | "Continue the unfinished work in this project." | **0** | found the source TODO and fixed 2 of 3 issues, then claimed full success |
| A2 | "Continue the unfinished Codex work in this project." | **0** | fixed the visible TODOs; never learned about the untested case |
| A3 | "Continue the unfinished Codex work in this project." (green suite, no TODOs) | **0** | **invented a scope** — wrote a CSV CLI, `cli.py`, a README, sample data — none of it asked for |
| A4 | "What was I working on in this project before? Continue…" | **1** | correct session, correct fix, 9 passed |

All six tools were offered to the model in every run — this is not a
registration failure. Verified from the request header of run A3:

```
tools offered (31): create_goal edit exit_plan_mode … sessionflow_continue
sessionflow_current_work sessionflow_merge sessionflow_recent
sessionflow_search sessionflow_session skill … write
```

The tools were there; the model chose to read the repository instead, and with a
green suite and no visible TODO it did not say "I cannot tell what is
unfinished" — it invented work. The prompt that worked is the one that names the
*question* ("what was I working on before") rather than only the *action*
("continue").

That is a real finding about discovery, not a plugin defect, and it is recorded
here rather than smoothed over: **"continue" alone is not enough of a cue.**
Making the tools fire on the bare prompt is open work.

## Reproducing this

```sh
# 1. an isolated HOME holding the synthetic provider sessions
#    .codex/sessions/2026/08/01/rollout-…-<uuid>.jsonl
#    .claude/projects/<munged-cwd>/<uuid>.jsonl
HOME=<scratch>/home python -m voyager.cli scan --db <scratch>/index-b.db

# 2. the WorkThread (scenario B only)
voyager merge codex:<uuid> claude:<uuid> --thread-title "…" --goal "…" --db <scratch>/index-b.db

# 3. a throwaway DSH_HOME with a profile whose patch points the plugin at that index
#    (the documented override from the README's Configuration section)
- id: dsh-sessionflow
  config:
    voyagerBin: 'py'
    voyagerArgs: ['-m', 'voyager.cli', '--db', '<scratch>/index-b.db']

# 4. the turn
dsh --profile p12demo "What was I working on in this project before? Continue the unfinished Codex work."

# 5. read the trace out of DSH's own log (multi-frame zstd; see scripts/dsh-trace.mjs)
node scripts/dsh-trace.mjs <DSH_HOME>/sessions/…/session.v3.jsonl.zstd
```

Nothing here touches a real `~/.dsh` profile or a real `~/.voyager` index: the
synthetic sessions live under a scratch `HOME`, the index is a scratch file, and
the DSH home is a throwaway directory. The demo project is a scratch git repo.

## Level reached

| Question | Answer |
|---|---|
| Does the plugin register six tools in a real DSH? | Yes — all six in the request header |
| Does a real agent call them? | Yes, when the prompt asks about prior work |
| Does the call return the right session / WorkThread? | Yes — correct provider, repo, and thread membership |
| Does the agent then change the code? | Yes — 8 insertions across 2 files, both scenarios |
| Do the project's tests pass afterwards? | Yes — 9 passed, up from 8 |
| Does it work on a bare "continue" prompt? | **No** — the agent reads the repo instead and can invent scope |
