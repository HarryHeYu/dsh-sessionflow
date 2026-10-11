# dsh-sessionflow v1.1.0

**sessionFlow for DeepSeek Harness — six tools, and a bridge that no longer
answers from the wrong index.**

v1.1.0 is a correctness and trust release. The tool surface is unchanged: same
six names, same arguments, same `schema_version` 1. What changed is what happens
when something is wrong — a misconfigured core, a repository with more than one
line of work, or a test suite that was quietly not running.

---

## The six tools

| Tool | What it answers | Core call |
|---|---|---|
| `sessionflow_search` | "Find the session where I fixed the parser." | `voyager api search` |
| `sessionflow_recent` | "What have I been doing this week?" | `voyager api overview` |
| `sessionflow_session` | "Show me what that one session was about." | `voyager api bundle_preview` |
| `sessionflow_current_work` | "Where did I leave off on *this* project?" | `voyager api current_work` |
| `sessionflow_continue` | "Pick the work back up." | `voyager api continue_context` |
| `sessionflow_merge` | "Put these sessions together and let me continue." | `voyager merge --json` |

All six share the `sessionflow_*` prefix; there is no second `voyager_*` set.
`merge` is the only one that writes — it persists the WorkThread so later calls
find it.

## A configured core is authoritative

`voyagerBin` + `voyagerArgs` is how an operator points the plugin at a specific
index; `--db` rides in the args. A configured executable that failed its probe
used to be **silently replaced** by whatever `voyager`/`py`/`python` was on
`PATH` — without the args. The plugin then answered from a different index and
said nothing about it. Measured: with the fixture index configured,
`sessionflow_recent` returned 305 sessions from the real index, and the agent
believed it.

Now a configured executable that does not work is reported by name, with the
reason the probe rejected it, and the message states that falling back was
refused and how to opt back in. Nothing changes for a user who never configures
a binary.

## Multiple WorkThreads

A repository can carry several active WorkThreads. The tools do not choose:

- `sessionflow_current_work` returns `thread_ambiguous: true` with every
  candidate (`thread_candidates`), keeps the most recently active one in
  `thread`, and labels it a default via `thread_default_reason`;
- `sessionflow_continue` and `sessionflow_merge` accept `thread_id`;
- with exactly one thread nothing extra is added, and a `thread_id` that does
  not exist is reported rather than quietly replaced.

`sessionflow_merge` also no longer attaches sessions in set-iteration order, so
the merged WorkThread and its headline are the same on every run.

## Verification

Kept apart on purpose.

| what | level | evidence |
|---|---|---|
| Six tools register, declare their arguments, forward the documented op | **PASS (unit)** | `npm test` — 40 tests |
| JSON round-trip against a real core | **PASS (integration)** | `search` (incl. CJK and spaced repo filters), `recent`, `session`, `current_work`, `continue`, `merge` — all against a real `voyager` on a seeded index |
| Clean install on Linux, both paths | **INSTALL VERIFIED** | `github:HarryHeYu/dsh-sessionflow` and `file:<checkout>`, in a throwaway `DSH_HOME`, on every push |
| Plugin imported and applied by DSH | **INSTALL VERIFIED** | the boot reaches the credential gate with no import error |
| Real DSH LLM continuation | **LIVE VERIFIED (synthetic index)** | six scenarios — `docs/p8-live-verification.md` |
| Continuation from real provider session files | **LIVE VERIFIED (real files, fixture scenario)** | `docs/p9-live-verification.md` |
| `sessionflow_merge` callable and semantically correct | **LIVE VERIFIED** | integration test plus a live turn that called it |
| `sessionflow_merge` chosen without being named | **NOT VERIFIED** | the autonomous turn answered correctly via `current_work` + `recent` + `search` + `session` and never called `merge` |
| Native resume by an agent | **NOT VERIFIED** | no scenario launched another agent's session |

## What this release fixed

- a configured core could be silently swapped for another index;
- nine integration tests **never actually ran** — a race between the module's
  top-level `await` and a test body that empties `PATH`, with the failure
  swallowed by a bare `catch` and reported as "no python with the voyager
  package". The suite went from 22 executed to 40;
- the test suite ran the core's freshness scan, i.e. read the developer's real
  session directories; it now sets `VOYAGER_NO_SYNC`;
- the README's install steps did not work, and one of them installed the wrong
  project (`voyager` on PyPI is an unrelated library);
- the error message for a missing core pointed at that same wrong project.

## Install

Both pieces come from their Git repositories. Neither is published to npm or
PyPI.

```sh
# 1. the core, from source
git clone https://github.com/HarryHeYu/sessionFlow
cd sessionFlow
pip install -e .
voyager scan

# 2. this plugin, into a DSH profile
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

A local checkout installs with `file:$PWD`; a bare path does not (it becomes a
pnpm `link:` dependency, and DSH's `nodeLinker: hoisted` does not create the
symlink, so the bundle is never discovered). DSH itself needs a working model
provider — this plugin does not supply model access.

## Known limitations

- **Native resume is not verified.** The core exposes resume paths for some
  providers and the adapters build the commands; no resume has been observed
  working end to end.
- **`merge` is not selected unprompted.** The model reaches the same answer with
  `session` + `search`; whether `merge` is the better route is a tool-selection
  question this release does not settle, and the descriptions were deliberately
  left unchanged.
- **The Linux cold-start gate is Linux-only.** Windows installation was verified
  by hand during development; the automated job runs on `ubuntu-latest`.
- **A repository with several active WorkThreads still resolves to a default.**
  The tools now say so, but the choice is yours to make.
