# sessionFlow for DeepSeek Harness

**Cross-agent session continuity for DeepSeek Harness.**

Continue work from Codex, Claude Code, Grok, ZCode and other coding agents
directly inside DSH.

Not "yet another session manager" — sessionFlow's continuity layer, exposed to
DSH as six tools.

```
User:  Continue the work I was doing in Claude Code on this repo.

DSH:   → sessionflow_current_work
       → sessionflow_continue

       [continues with the previous goal, files, commands and unresolved work]
```

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

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)
  — tested against **0.1.5-rc.3**, **with a working model provider**. A fresh
  `headless` profile has no LLM adapter and no credentials, and DSH stops with
  `MISSING_CREDENTIAL: … no API key for provider route`. That is the host's
  configuration, not this plugin's: **this plugin does not provide model
  access** and cannot work around a missing provider. Set up the provider
  before installing anything here.
- [sessionFlow / Voyager](https://github.com/HarryHeYu/sessionFlow), installed
  **from source** and indexed. It is not published to PyPI — the `voyager` name
  on PyPI belongs to an unrelated nearest-neighbour library, so `pip install
  voyager` will install the wrong project.
- Node.js **22.19+**

So there are two independent dependencies: DSH needs a model provider to run at
all, and this plugin needs the sessionFlow core to answer anything. The plugin
adds no third one.

## Install

Both pieces are installed from their Git repositories. Neither is published to
PyPI or npm, so there is no `pipx install` / `dsh plugin add <name>` one-liner
that works today.

```sh
# 1. the core, from source
git clone https://github.com/HarryHeYu/sessionFlow
cd sessionFlow
pip install -e .
voyager scan

# 2. this plugin, straight from GitHub
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

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

## Compatibility

| Plugin | DSH | sessionFlow bridge schema | Status |
|---|---|---|---|
| 0.1.0 | 0.1.5-rc.3 | 1 | tested |

DSH is in Developer Preview and does move. The plugin declares the bridge
`schema_version` it needs and fails clearly against an older core; it does not
claim to support "all future versions".

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
| Continuation context used to pick up another agent's work | **LIVE VERIFIED** | six synthetic scenarios, real model, real index — see [`docs/p8-live-verification.md`](docs/p8-live-verification.md) |
| Autonomous selection with a deliberately misleading handoff | **LIVE VERIFIED** | the fixture's sessions claim work the checkout does not contain; the agent checked the files and refused to repeat the claim |
| Ambiguous repo: two active WorkThreads | **LIVE VERIFIED** | the agent listed both, refused to pick the newer one, and said why "newest" is not a verdict |
| Native resume by an agent | **NOT VERIFIED** | no scenario launched another agent's session; retained/`SOURCE_MISSING` sessions were correctly described as context-only |
| `dsh plugin add <bare local path>` | **DOCUMENTED LIMITATION** | a bare path becomes a pnpm `link:` dependency, and DSH's `nodeLinker: hoisted` does not create the symlink, so the package's `dsh.bundle` is never read. Use `file:` or `github:` — both verified on Linux CI. See [Troubleshooting](#troubleshooting) |

The Linux cold-start jobs run on every push:
[`.github/workflows/cold-start.yml`](.github/workflows/cold-start.yml) drives
`scripts/cold-start.sh` over both install paths in a throwaway `DSH_HOME`, with
the host toolchain pinned (dsh 0.1.5-rc.3, pnpm 11.22.0, Node 22.22.2, Python
3.13).  They need no model: the boot stops at the credential gate, which is the
evidence that the plugin loaded.

Full transcript and tool-call records: [`docs/live-verification.md`](docs/live-verification.md).

### Automated compatibility (O6.5 consumer closure, 2026-10-06)

The six tools were re-verified as a thin adapter against a pinned core —
input → bridge call → result formatting, nothing else:

| Pinned | SHA |
|---|---|
| sessionFlow core | `3b98bcd` |
| Bridge schema | `1` (no request/response shape change → no bump) |
| dsh-sessionflow | `37e4317` |

Verification for this closure is **automated contract tests only**
(`npm test`: 23 passed, `npm run build`: clean).  The LIVE VERIFIED rows
above are the historical real-agent run and are *not* re-claimed by this
closure; a live DSH rerun was not required because no public contract
changed since that run.

Environment used: `@deepseek-ai/dsh` 0.1.5-rc.3, `@deepseek-ai/cordis` 4.0.2,
Node 22.22.2, Windows.

## Troubleshooting

**The tools are registered but every call fails.**
The core is missing or not on `PATH`. Check it directly:

```sh
voyager --version
```

If that fails, install the core from source (see [Install](#install)) and make
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

## Security

- Arguments are passed to `spawn` as an **argv array** — no shell string is
  ever built, so a query containing `;`, `"` or CJK text is data, not syntax.
- The plugin has **no arbitrary shell execution**. It can only call the core's
  read-only interface, plus `voyager merge` (the one write, which persists a
  WorkThread).
- It reads only the index sessionFlow already built. It does not scan, copy or
  upload provider session files, and sends nothing over the network.

## Development

```sh
npm install
npm run build     # tsc -> lib/
npm test          # build, then node --test (bridge mechanics + live core)
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
