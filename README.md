# dsh-sessionflow

[![cold-start](https://github.com/HarryHeYu/dsh-sessionflow/actions/workflows/cold-start.yml/badge.svg)](https://github.com/HarryHeYu/dsh-sessionflow/actions/workflows/cold-start.yml)
[![release](https://img.shields.io/github/v/release/HarryHeYu/dsh-sessionflow)](https://github.com/HarryHeYu/dsh-sessionflow/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/LICENSE)

**Continue work across AI coding agents — directly inside DeepSeek Harness.**

Search, recover context, and continue work from Codex, Claude Code, and other
supported agents using [sessionFlow](https://github.com/HarryHeYu/sessionFlow).

|  |  |
|---|---|
| **What it is** | A thin DSH plugin that exposes the sessionFlow continuity layer as six `sessionflow_*` tools. |
| **Why use it** | Work started in Codex, Claude Code, Grok or ZCode does not have to stop at the agent boundary — pick it back up inside DSH with the goal, files, commands and open items intact. |
| **Install** | `dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow` — [details](#install). Needs a working model provider **and** the sessionFlow core. |
| **Try it** | Ask in plain language: *"Continue the work I was doing in Claude Code on this repo."* Full walkthrough: [5-minute Quick Start](https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md). |
| **Current release** | [v1.1.0](https://github.com/HarryHeYu/dsh-sessionflow/releases/tag/v1.1.0) · DSH 0.1.5-rc.3 / 0.2.0-rc.2 / 0.2.1-alpha.4 (tool calls answered) · Node ≥ 22.19 · bridge schema 1 |
| **Privacy** | Local only. No account, no telemetry, no network calls — [boundary](#what-stays-local) |
| **Known limitation** | Native resume by an agent is **not verified** — see [verification status](#verification-status) |

Not "yet another session manager" — sessionFlow's continuity layer, exposed to
DSH as six tools.

```
User:  Continue the work I was doing in Claude Code on this repo.

DSH:   → sessionflow_current_work
       → sessionflow_continue

       [continues with the previous goal, files, commands and unresolved work]
```

**Say what you are looking for, not just "continue."** The tools fire far more
reliably on a lookup than on a bare action:

```
User:  What was I working on before? Continue from there.
User:  Continue the unfinished Codex work in this project.
User:  Find the previous Claude Code work on this repository.
```

A bare *"Continue the unfinished work in this project"* is the weakest phrasing:
with nothing in the repository marking what is left, the agent may read the files
and start writing instead of consulting history. It will not invent history, but it
can miss work only the earlier sessions record — exactly the case this plugin is
for. See the [Quick Start](https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md).

```
Claude Code ─┐
Codex ───────┤
Grok ────────┤
ZCode ───────┼─ sessionFlow ─ DSH
DSH ─────────┤
Cursor ──────┤
Kiro ────────┘
```

---

## What it is

A thin DSH plugin that exposes [sessionFlow](https://github.com/HarryHeYu/sessionFlow)
(Voyager) as six tools. sessionFlow indexes the session history of every AI
coding agent on your machine; this plugin lets a DSH agent *use* that history —
to find past work, to see what the current project was doing, and to pick it up.

**The core stays the single source of truth.** No session parsing, indexing,
search, WorkThread, ranking, merging or context compilation happens in this
plugin: every call is forwarded to the existing Voyager core over its stable
JSON interface.

## Continuation, not native resume

These are two different things, and this plugin only does the first. Worth
knowing before you expect the second:

| | What it is | Status |
|---|---|---|
| **Native resume** | Hand an agent back its *own* earlier session, so it continues with full native state (`claude --resume`, `codex resume`). | **Not verified.** The plugin can report the command and the core records it, but no scenario here has launched another agent's session — that spends your credentials and writes into your real environment. |
| **Cross-agent continuation** | Compile *other* agents' work — goal, files, commands, open items, provenance — into a context package or bundle, and hand it to whatever agent you are in now. | **Verified.** See [verification status](#verification-status). |

The second row is the point: it is what lets work cross an agent boundary at
all, including when the next agent has no way to resume the previous one.

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)
  — verified on **0.1.5-rc.3** and **0.2.0-rc.2** (`next`), **with a working
  model provider**. A fresh `headless` profile has no LLM adapter and no
  credentials, and DSH stops with
  `MISSING_CREDENTIAL: … no credential for provider route "…"`. That is the
  host's configuration, not this plugin's: **this plugin does not provide model
  access** and cannot work around a missing provider. Set up the provider
  before installing anything here.
- [sessionFlow / Voyager](https://github.com/HarryHeYu/sessionFlow) — **a
  separate, standalone dependency**. This plugin is a thin DSH adapter and ships
  no Python core of its own. Without the core the six tools still register, and
  every call fails with a message naming the install command.
- Node.js **22.19+**

So there are two independent dependencies: DSH needs a model provider to run at
all, and this plugin needs the sessionFlow core to answer anything. The plugin
adds no third one.

The core is not on PyPI: the `voyager` name there belongs to an unrelated
nearest-neighbour library, so a bare `pip install voyager` installs the wrong
project. Always keep the `@ git+…` part of the command in the quick install
below.

### Core compatibility

The plugin is tested against a specific core release. Newer cores should work;
an older one is refused by name rather than misbehaving silently.

| plugin | core | bridge schema |
|---|---|---|
| **1.1.0** | `v1.3.0` | `1` |

**The two repos are versioned independently** — plugin `1.1.0` against core
`1.3.0` is the current, correct pairing, and the numbers are not meant to match.
What binds them is the **bridge schema**: `REQUIRED_SCHEMA_VERSION` in
`src/bridge.ts` is the value the plugin demands, and `voyager integration-info
--json` is where the core reports it.

What that compatibility rests on: the six tools are verified by **non-model
contract tests** (input → bridge call → result formatting) against a real core
on a seeded index. Model-driven *selection* of those tools has been observed in
recorded real-model runs, but there is **no repeatable end-to-end suite** for it —
see [verification status](#verification-status) and the prompt-shape note at the
top. Do not read "the tools work" as "the model will always reach for them".

> **Core v1.3.0 is released and is what the pin below installs.** It is tested
> against plugin v1.1.0: the six tools and the bridge schema (`1`) are
> unchanged, so no plugin upgrade is needed.  v1.3.0 adds evidence references
> inside bundle text and a new `voyager evidence` subcommand -- additive only;
> the plugin passes bundle text through and does not parse it, which is why it
> needs no change.

## Install

Two pieces, two different channels — there is no single command, and one of them
is deliberately not on a package registry:

| | Where it comes from | Install |
|---|---|---|
| **Core** — sessionFlow | a **GitHub tag**; not on PyPI | `pipx install "voyager[all] @ git+…@v1.3.0"` |
| **Plugin** — this repo | **DSH's plugin mechanism**; not on npm | `dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow` |

Install the core first: without it the six tools still register, but every call
fails with a message naming the missing binary.

Two things people get wrong here:

- **`pip install voyager` installs the wrong project.** That PyPI name belongs to
  an unrelated nearest-neighbour library. The core is not published to PyPI, so
  the `@ git+…` form below is the only correct one. `pipx` is the recommended
  runner because it keeps the CLI in its own environment — the tag install is
  what makes a reinstall reproducible.
- **The plugin is not an npm package.** `dsh plugin add dsh-sessionflow` finds
  nothing; use the `github:` specifier.

### Quick install

The core first, pinned to the release this plugin version was tested against:

```sh
pipx install "voyager[all] @ git+https://github.com/HarryHeYu/sessionFlow.git@v1.3.0"
voyager --version     # must print 1.3.0
voyager scan          # build the index from your real agent history
voyager doctor        # confirm the core runs and reports bridge schema 1
```

No `pipx`? `python -m pip install "voyager[all] @ git+https://github.com/HarryHeYu/sessionFlow.git@v1.3.0"`
works too. `python -m pip` is deliberate: on Windows `pip` is often not on `PATH`
while `python` is.

Then the plugin:

```sh
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

The install is non-editable and pinned, so reinstalling reproduces the same
build — which a `git clone` plus `pip install -e .` does not.

### Working on the core itself

Developing against a checkout instead of an installed core:

```sh
git clone https://github.com/HarryHeYu/sessionFlow
cd sessionFlow && pip install -e .
voyager scan
```

That is a developer path. It is not what the quick install does, and it is not
what the plugin's error messages recommend.

pnpm blocks build scripts for git-hosted packages until you allow them, so the
first `add` will stop and print the exact key it wants. Put that key in the
profile's `pnpm-workspace.yaml` and run the same `add` again:

```yaml
# <profile>/pnpm-workspace.yaml — the key is printed by the failing `add`
allowBuilds:
  dsh-sessionflow@git+https://github.com/HarryHeYu/dsh-sessionflow.git#<sha>: true
```

The plugin needs that build step: it is TypeScript, and `prepare` compiles
`lib/` on install.

### From a local checkout

Working on the plugin itself? Use a `file:` specifier:

```sh
git clone https://github.com/HarryHeYu/dsh-sessionflow
cd dsh-sessionflow && npm install && npm run build
dsh plugin --profile web add file:$PWD
```

Use `file:`, not a bare path. A bare path becomes a pnpm `link:` dependency,
and DSH's `nodeLinker: hoisted` does not create the symlink for those — the
install looks like it worked, but the profile never sees `dsh.bundle` and the
plugin does not load. `file:` copies instead, which works.

### Verify

```sh
dsh --profile web --dump-config | grep dsh-sessionflow
```

You should see `- id: dsh-sessionflow`. If the core is missing, the tools still
register but every call fails with a clear message naming the `voyager` binary —
see [Troubleshooting](#troubleshooting).

## Tools

| Tool | What it answers |
|---|---|
| `sessionflow_search` | "Find the session where I fixed the parser." |
| `sessionflow_recent` | "What have I been doing this week?" |
| `sessionflow_session` | "Show me what that one session was about." |
| `sessionflow_current_work` | "Where did I leave off on *this* project?" |
| `sessionflow_continue` | "Pick the work back up." |
| `sessionflow_merge` | "Put these sessions together and let me continue." |

All six share the `sessionflow_*` prefix — there is no second `voyager_*` set.
Every tool returns structured data and a model-readable rendering.

### When a repo has more than one WorkThread

A project can carry several active WorkThreads at once (two lines of work, or a
thread that was reopened after being closed). The tools will **not** choose
between them for you:

* `sessionflow_current_work` answers with `thread_ambiguous: true`, lists every
  candidate under `thread_candidates` (`id`, `title`, `updated_at`, `goal`), and
  still returns the most recently active one as `thread` — labelled by
  `thread_default_reason` as a default, because activity time is not a decision
  you made;
* `sessionflow_continue` and `sessionflow_merge` accept `thread_id`, so the
  agent can pass the one you pick;
* with exactly one thread nothing extra is added, and a `thread_id` that does
  not exist is reported rather than quietly replaced by another thread.

Ask the agent which thread you mean, or name the id yourself. The same rule
holds outside DSH: `voyager continue` / `voyager switch` refuse with the
candidate list instead of guessing, and `voyager status` reports `AMBIGUOUS`
rather than `NO_THREAD`.

## Configuration

The plugin finds the core by trying, in order: a configured `voyagerBin`, then
`voyager` on `PATH` (and `voyager.exe` on Windows), then `py` / `python` /
`python3` running `-m voyager.cli`. Each candidate is proven with a version
probe, so a machine with several Python installs picks the one that actually
has the package.

Override it in the profile patch:

```yaml
# cordis.patch.yml
- id: dsh-sessionflow
  config:
    voyagerBin: 'C:/path/to/voyager.exe'   # optional
    timeoutMs: 30000                        # optional, per call
```

If the core is missing, the tools fail with an actionable message rather than
an empty result.

## DSH host compatibility

Stated per channel, and at the level actually reached. The peer ranges admit the
`0.1.5` / `0.1.6` / `0.1.7` and `0.2.x` prerelease lines; how far each was taken
is a separate question:

| Plugin | DSH | bridge schema | install resolves | DSH loads it | tool call answered |
|---|---|---|---|---|---|
| 1.1.0 | `0.1.5-rc.3` | 1 | yes | yes | yes |
| 1.1.0 | `0.1.7-rc.2` | 1 | yes | not run | not run |
| 1.1.0 | `0.2.0-rc.2` (`next`) | 1 | yes | yes | yes |
| 1.1.0 | `0.2.1-alpha.4` (`alpha`) | 1 | yes | yes | yes |

"Not run" is not a euphemism for "probably fine" — `0.1.7-rc.2` is admitted so
that a user on it is not blocked by an install error, and nothing more is
claimed. The `latest` dist-tag is a stale `0.0.1-rc.1` upstream and is
deliberately **not** admitted: there is no evidence the plugin works on the
first release candidate, and claiming it so an install would succeed is the same
mistake in the other direction.

DSH is in Developer Preview and does move. The plugin declares the bridge
`schema_version` it needs and fails clearly against an older core; it does not
claim to support "all future versions". `tests/peer-range.test.ts` pins this
table, so widening a range forces a decision about the new row's status instead
of silently admitting it.

## Verification status

Stated at the level actually reached — nothing below is promoted.

| Capability | Status | Evidence |
|---|---|---|
| Bridge mechanics: resolution, deadline, malformed JSON, non-zero exit, schema gate | **PASS (unit)** | `tests/bridge.test.ts`, stub executables |
| JSON round-trip against the real core | **PASS (integration)** | `tests/bridge.test.ts`, real `voyager` on a seeded index |
| Six tools register through the real `defineTool` | **PASS (unit)** | `tests/plugin.test.ts` |
| DSH bundle discovery | **LIVE VERIFIED** | `dsh plugin --profile … install` added `dsh-sessionflow` to `dsh.profile.bundles` |
| DSH composition tree | **LIVE VERIFIED** | `dsh --profile … --dump-config` shows `- id: dsh-sessionflow` |
| Plugin module imported and applied by DSH | **INSTALL VERIFIED (Linux CI)** | the boot reaches the credential gate with no import error; `--dump-config` alone cannot prove this, it never imports the plugin |
| `github:` install on a clean machine | **INSTALL VERIFIED (Linux CI)** | `dsh plugin add github:HarryHeYu/dsh-sessionflow`, with the `allowBuilds` key pnpm prints |
| `file:` install on a clean machine | **INSTALL VERIFIED (Linux CI)** | `dsh plugin add file:<checkout>` |
| Tool registration visible to a real agent | **LIVE VERIFIED** | all six schemas in the request header of a real DSH turn |
| Natural-language autonomous tool selection | **LIVE VERIFIED** | asked "我之前这个项目做到哪了？" with no tool named; the agent's first action was `sessionflow_current_work` |
| Real agent tool invocation | **LIVE VERIFIED** | 4 `tool/call` records in DSH's session log |
| sessionFlow bridge execution | **LIVE VERIFIED** | results carried real index data (266 sessions / 150,089 events / 8 providers) |
| Cross-agent context retrieval | **LIVE VERIFIED** | the returned WorkThread's members span `claude` and `zcode`; search hits span `zcode`/`claude`/`grok` |
| Continuation context used to pick up another agent's work | **LIVE VERIFIED** | six synthetic scenarios, real model, real index — see [`docs/p8-live-verification.md`](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p8-live-verification.md) |
| Autonomous selection with a deliberately misleading handoff | **LIVE VERIFIED** | the fixture's sessions claim work the checkout does not contain; the agent checked the files and refused to repeat the claim |
| Ambiguous repo: two active WorkThreads | **LIVE VERIFIED** | the agent listed both, refused to pick the newer one, and said why "newest" is not a verdict |
| Continuation from **real provider session files** (discovery → parse → index → agent) | **LIVE VERIFIED** | 3 real Codex rollouts + 3 real Claude Code sessions copied into an isolated HOME, scanned by the real adapters, then continued by a real agent — see [`docs/p9-live-verification.md`](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p9-live-verification.md) |
| `sessionflow_merge` callable and semantically correct | **LIVE VERIFIED** | real `voyager merge --json` in the integration suite (both sources, provenance, conflict kept, deterministic), and a live turn that called it with both ids |
| `sessionflow_merge` chosen *without being named* | **NOT VERIFIED** | the autonomous turn answered correctly via `current_work` + `recent` + `search` + `session` and never called `merge` |
| Multi-thread ambiguity handled, not guessed | **LIVE VERIFIED** | two active WorkThreads in one repo: the agent listed both, refused to take the newer one, and said recency is not a decision |
| Native resume by an agent | **NOT VERIFIED** | no scenario launched another agent's session; retained/`SOURCE_MISSING` sessions were correctly described as context-only. `claude`/`codex` are installed, but a real resume would spend the user's credentials and create a session in their real environment |
| `dsh plugin add <bare local path>` | **DOCUMENTED LIMITATION** | a bare path becomes a pnpm `link:` dependency, and DSH's `nodeLinker: hoisted` does not create the symlink, so the package's `dsh.bundle` is never read. Use `file:` or `github:` — both verified on Linux CI. See [Troubleshooting](#troubleshooting) |

The Linux cold-start jobs run on every push:
[`.github/workflows/cold-start.yml`](.github/workflows/cold-start.yml) drives
`scripts/cold-start.sh` over both install paths in a throwaway `DSH_HOME`, with
the host toolchain pinned (dsh 0.1.5-rc.3 and 0.2.0-rc.2, pnpm 11.22.0,
Node 22.22.2, Python
3.13).  They need no model: the boot stops at the credential gate, which is the
evidence that the plugin loaded.

Full transcript and tool-call records: [`docs/live-verification.md`](docs/live-verification.md).

### The end-to-end demo

[`docs/p12-dsh-cross-agent-demo.md`](docs/p12-dsh-cross-agent-demo.md) is the
short version: a real DSH agent, a real model, a scratch project whose test
suite is *green* because the unfinished case has no test — so the only way to
find the remaining work is to recover the prior sessions. It records both
scenarios (Codex → DSH, and Codex + Claude → DSH), the bundle the agent was
given, the diff it produced, and the tests passing 8 → 9.

It also records the run that **failed**: on a bare "continue the unfinished
work" prompt the agent called none of the six tools and invented a scope instead.
The tools were offered to the model in that run; the prompt just did not ask the
question they answer.

### Automated compatibility (O6.5 consumer closure, 2026-10-06)

The six tools were re-verified as a thin adapter against a pinned core —
input → bridge call → result formatting, nothing else:

| Pinned | SHA |
|---|---|
| sessionFlow core | `3b98bcd` |
| Bridge schema | `1` (no request/response shape change → no bump) |
| dsh-sessionflow | `37e4317` |

Verification for this closure is **automated contract tests only**
(`npm test`: 23 passed at the time; the suite is 54 today, `npm run build`:
clean).  The LIVE VERIFIED rows above are the historical real-agent run and are
*not* re-claimed by this closure; a live DSH rerun was not required because no
public contract changed since that run.

Environment used: `@deepseek-ai/dsh` 0.1.5-rc.3, `@deepseek-ai/cordis` 4.0.2,
Node 22.22.2, Windows.

## Troubleshooting

**The tools are registered but every call fails.**
The core is missing or not on `PATH`. Check it directly:

```sh
voyager --version
```

If that fails, install the core (see [Install](#install)) and make
sure the interpreter that provides the `voyager` entry point is the one DSH
inherits. The error text names the binary it tried to run.

**`pip install voyager` installed the wrong thing.**
It did — the `voyager` name on PyPI is an unrelated nearest-neighbour library.
Uninstall it and install from the sessionFlow repository instead.

**`dsh plugin add dsh-sessionflow` cannot find the package.**
The plugin is not on npm. Use the GitHub specifier instead:

```sh
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
```

**`add` fails with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`.**
pnpm will not run a git-hosted package's build script until you allow it. The
error prints the exact key — put it under `allowBuilds` in the profile's
`pnpm-workspace.yaml` and run the same `add` again. The plugin cannot skip this:
it ships TypeScript, and `prepare` is what compiles `lib/`.

Use the key exactly as printed, including the resolved commit. With pnpm 11 the
short form (`dsh-sessionflow: true`) is *not* enough — it still fails with the
same error. Measured against pnpm 11.22.0.

**`add` reported `declares no dsh.bundle`, and `node_modules` is empty.**
You added a bare local path. pnpm turns that into a `link:` dependency, and with
DSH's `nodeLinker: hoisted` no symlink is created, so the profile cannot read the
package's `dsh.bundle`. Use `file:` instead:

```sh
dsh plugin --profile web add file:$PWD
```

The same warning with a `github:` or `file:` specifier means something else —
check that `lib/` exists in the package, since DSH reads the manifest from the
installed copy.

**The plugin loads but a profile shows no `dsh-sessionflow` line.**
Run `dsh --profile <p> --dump-config` and look for `- id: dsh-sessionflow`.
If it is absent, the bundle was not discovered — see the two entries above.

## What stays local

Everything. This is the part worth being precise about, because the whole value
proposition is that your coding history does not leave your machine.

- **No account, no telemetry, no analytics.** The plugin makes no network calls
  of any kind — not even a version check. (`grep -rE 'fetch\(|https?://' src/`
  finds one string, in a help message.)
- **It does not read your session files.** It reads the index sessionFlow already
  built. Scanning provider directories — `~/.codex`, `~/.claude`, and the rest —
  is the core's job, and it is what `voyager scan` does; the plugin never opens
  those files, never copies them and never uploads them.
- **The only write is `voyager merge`**, which persists a WorkThread in your own
  local index. Every other call is read-only.
- **No shell string is ever built.** Arguments reach `spawn` as an argv array, so
  a query containing `;`, `"`, or CJK text is data, not syntax. There is no
  path by which a search query becomes a command.
- **The model sees what you would expect it to see.** Continuation context is
  assembled locally and then passed to your configured model provider — that
  provider is the only place any of it goes, and that is your provider choice,
  not this plugin's.

## Development

```sh
npm install
npm run build     # tsc -> lib/
npm test          # build, then node --test — 54 tests (bridge mechanics + live core)
```

`tests/bridge.test.ts` covers resolution, timeouts, malformed JSON, non-zero
exits and the compatibility gate against stub executables, then runs the real
JSON round-trip against the installed core on a seeded temporary index. Those
indexes are created under the OS temp directory and **removed when the suite
exits**; set `SESSIONFLOW_TEST_TMPDIR` to put them somewhere else.

## License

MIT. See [LICENSE](LICENSE).

---

[中文说明](README.zh-CN.md) · [sessionFlow](https://github.com/HarryHeYu/sessionFlow)
