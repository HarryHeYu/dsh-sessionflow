# Community announcement (draft — not posted)

Everything here is a **draft**. Nothing has been posted, submitted or emailed.
Claims are limited to what the project has actually verified; see
[Accuracy rules](#accuracy-rules) before editing.

---

## Title

**dsh-sessionflow — Continue Codex and Claude Code work inside DeepSeek Harness**

*(short variants)*

- `dsh-sessionflow: cross-agent session continuity for DeepSeek Harness`
- `Continue another agent's work in DSH — with the context that was missing`

---

## Summary (134 words)

Your coding history is scattered across Codex, Claude Code, Grok and ZCode.
`dsh-sessionflow` brings it into DeepSeek Harness. It is a thin DSH plugin over
**sessionFlow**, a local indexer that reads the session files your agents already
write and builds one searchable SQLite index on your machine — no cloud, no
telemetry, no account. Six `sessionflow_*` tools let a DSH agent search past
sessions, see what the current project was doing, and pick the work back up with
the goal, files, commands and open items intact. Cross-agent continuation has
been verified live with a real DSH agent, against both a synthetic index and real
provider session files. Native resume is **not** verified end to end. The core is
a separate, general-purpose tool; this plugin is one client of it.

---

## Full introduction

### The problem

Every coding agent keeps its own history in its own format. Codex writes rollout
JSONL, Claude Code writes project JSONL, ZCode uses SQLite, DSH compresses JSONL
with zstd. When you move from one to another, the reasoning, the files you
touched and the thing you were about to do next stay behind. Copy-pasting a
summary loses exactly the part that matters: *where the work actually stopped.*

### What this is

**sessionFlow** indexes all of that history into one local SQLite database —
incremental, read-only over the provider files, entirely on your machine.
**dsh-sessionflow** exposes it to DeepSeek Harness as six tools, so a DSH agent
can answer "where did I leave off on this project?" and then act on the answer.

The plugin is a thin adapter, deliberately. It parses nothing, indexes nothing,
ranks nothing. Every call is forwarded to the core over a versioned JSON bridge
(`schema_version 1`), and the core stays the single source of truth. If you also
use the core from a terminal, or from another agent over MCP, you get the same
answers.

### How it works

```
Claude Code ─┐
Codex ───────┤
Grok ────────┼─ sessionFlow (local index) ─ dsh-sessionflow ─ DSH
ZCode ───────┤
Cursor ──────┘
```

A typical turn:

```
User:  Continue the work I was doing in Claude Code on this repo.
DSH:   → sessionflow_current_work
       → sessionflow_continue
       [continues with the previous goal, files, commands and unresolved work]
```

The agent is not told which tool to call; it chooses from the descriptions. That
autonomous selection has been observed in a live run.

### What makes it different from a session viewer

- **Continuity, not archiving.** The output is a Context Package — goal, files
  touched, commands run, errors, and the last thing that was said — not a
  transcript dump.
- **Ambiguity is reported, not resolved.** If a repository has two active lines
  of work, the tools return `thread_ambiguous: true` with every candidate and
  refuse to pick one. Recency may suggest a default; it never establishes intent.
- **Evidence over assertion.** Under context-budget pressure the compiler keeps
  the repository snapshot and the commands, and demotes an assistant's
  self-report. A conclusion is presented as *what was said*, never as verified
  fact.
- **Local-first.** No account, no cloud, no telemetry. Provider files are opened
  read-only.

### Core features

| Feature | What it gives you |
|---|---|
| Unified local session indexing | Codex, Claude Code, DSH, Grok, ZCode, Cursor, Kiro, Antigravity → one SQLite index |
| Cross-agent full-text search | Trigram FTS5, so CJK substring search works; filters by provider, repo, date, kind, tool, file |
| Project timelines | `voyager repo <path>` — every agent that touched a project, in order |
| WorkThread continuity | Task-centric session groups with an explicit lifecycle |
| Context handoff | A Context Package another agent reads and continues from |
| Provenance-aware summaries | Each turn carries where it came from; bootstrap text is distinguishable from what you typed |
| Local-first operation | Nothing leaves the machine; the index is a file you own |

---

## Install

Two pieces, both from Git. Neither is published to npm or PyPI.

```sh
# 1. the core
git clone https://github.com/HarryHeYu/sessionFlow
cd sessionFlow
pip install -e .
voyager scan

# 2. the plugin, into a DSH profile
dsh plugin --profile web add github:HarryHeYu/dsh-sessionflow
dsh --profile web
```

pnpm blocks build scripts for git-hosted packages until you allow them. The first
`add` prints the exact `allowBuilds` key it wants — add **that** key (it includes
the resolved commit) to the profile's `pnpm-workspace.yaml` and re-run the same
`add`. The plugin needs that step: it is TypeScript and `prepare` compiles
`lib/`.

Verify the install actually loaded:

```sh
dsh --profile web --dump-config | grep dsh-sessionflow   # expect: - id: dsh-sessionflow
```

DSH needs a working model provider. **This plugin does not supply model access**
and cannot work around a missing one.

---

## Try it

A fully synthetic, reproducible demo — no credentials, no real session data, no
network:

```sh
git clone https://github.com/HarryHeYu/dsh-sessionflow
cd dsh-sessionflow
PYTHON=python3 bash docs/demo/run-demo.sh /tmp/sf-demo
```

It builds a throwaway `HOME`, a scratch git repository and two controlled agent
sessions (one Codex, one Claude Code), then walks the whole story: index → search
→ cross-agent timeline → handoff package → WorkThread → the ambiguity refusal.
Captured output is in
[`docs/demo/expected-output.md`](https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/demo/expected-output.md).

---

## Links

| | |
|---|---|
| Plugin (this repo) | https://github.com/HarryHeYu/dsh-sessionflow |
| Core | https://github.com/HarryHeYu/sessionFlow |
| Plugin v1.1.0 release | https://github.com/HarryHeYu/dsh-sessionflow/releases/tag/v1.1.0 |
| Core v1.1.0 release | https://github.com/HarryHeYu/sessionFlow/releases/tag/v1.1.0 |
| Quick Start | https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md |
| Live verification (synthetic index) | https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p8-live-verification.md |
| Live verification (real provider files) | https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p9-live-verification.md |

---

## Compatibility and limitations

| | |
|---|---|
| DSH | tested against **0.1.5-rc.3** |
| Node.js | **≥ 22.19** |
| sessionFlow core | **v1.1.0**, bridge **schema_version 1** |
| Plugin version | **1.1.0** |

Stated at the level actually reached — nothing below is promoted:

- **Cross-agent continuation: verified.** A real DSH agent, a real model, a real
  core — six synthetic scenarios, then three real Codex rollouts plus three real
  Claude Code sessions parsed by the real adapters.
- **Native resume: NOT verified.** The core exposes a resume path for some
  providers and the adapters build the command, but **no resume has been observed
  working end to end on any provider.** `zcode`, `cursor`, `kiro` and
  `antigravity` report no resume path at all.
- **Provider capability varies.** Agents expose different levels of persistence
  detail; file-edit tracking and token accounting are stronger on some than
  others.
- **This is not format conversion.** sessionFlow does **not** translate one
  agent's native session format into another's. It extracts the goal, the
  evidence and the open items, and hands those to the next agent as context.
  Hidden tool state and provider runtime state never move.
- **`sessionflow_merge` is not selected unprompted.** The model reaches the same
  answer with `session` + `search`; whether `merge` is the better route is an
  open tool-selection question.
- **Install is from Git.** No npm package, no PyPI package, no prebuilt tarball
  attached to the Release yet.

---

## Feedback

- Bugs and questions: **https://github.com/HarryHeYu/dsh-sessionflow/issues**
- Core-side issues: **https://github.com/HarryHeYu/sessionFlow/issues**

When reporting a problem, `dsh --profile <p> --dump-config` output and the exact
tool call help more than a description.

---

## Accuracy rules

Keep these true when editing:

1. Never write that native resume works, or that "all agents resume seamlessly".
2. Never claim all provider capabilities are equal.
3. Never imply the plugin converts native session formats.
4. Never state a test count, tool count or provider count that the code does not
   have.
5. Say "verified" only for what the verification tables in
   `README.md` list as verified, and name the level (unit / integration / live).
