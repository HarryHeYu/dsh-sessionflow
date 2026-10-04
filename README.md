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
  — tested against **0.1.5-rc.3**
- [sessionFlow / Voyager](https://github.com/HarryHeYu/sessionFlow) installed
  and indexed: `pipx install voyager`, then `voyager scan`
- Node.js **22.19+**

## Install

```sh
# 1. the core, plus an initial index
pipx install voyager
voyager scan

# 2. this plugin, into a DSH profile
dsh plugin --profile web add dsh-sessionflow
dsh --profile web
```

From a local checkout:

```sh
git clone https://github.com/HarryHeYu/dsh-sessionflow
cd dsh-sessionflow && npm install && npm run build
dsh plugin --profile web add .
```

Verify it loaded:

```sh
dsh --profile web --dump-config | grep dsh-sessionflow
```

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

| Claim | Level | Evidence |
|---|---|---|
| Bridge mechanics: resolution, deadline, malformed JSON, non-zero exit, schema gate | **UNIT TESTED** | `tests/bridge.test.ts`, stub executables |
| JSON round-trip against the real core | **INTEGRATION TESTED** | `tests/bridge.test.ts`, real `voyager` on a seeded temporary index |
| All six tools register with the real `defineTool` | **UNIT TESTED** | `tests/plugin.test.ts` |
| `dsh.bundle` manifest is recognised and the bundle joins the profile layer stack | **LIVE VERIFIED** | `dsh plugin --profile sessionflow-test install` added `dsh-sessionflow` to `dsh.profile.bundles` |
| The plugin row reaches the composed profile tree | **LIVE VERIFIED** | `dsh --profile sessionflow-test --dump-config` shows `- id: dsh-sessionflow` |
| An agent calls the tools inside a real DSH turn | **NOT VERIFIED** | requires an LLM turn; not run here |
| `dsh plugin add` materialises the package link | **NOT VERIFIED** | pnpm 11.22.0 in the test environment did not create the link; a known-good third-party bundle failed identically, so this is environmental, not specific to this package |

Environment used: `@deepseek-ai/dsh` 0.1.5-rc.3, `@deepseek-ai/cordis` 4.0.2,
Node 22.22.2, Windows.

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
