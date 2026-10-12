# Community announcement — FINAL, ready to publish

**Status: not posted anywhere.** This text is final and can be published as-is,
but nothing has been sent to Discord, GitHub Discussions, Reddit or any other
channel. Publishing is a separate, explicit decision.

Facts in this document were checked against v1.1.0 on 2026-10-12. Before
publishing, re-check the version numbers and links; before *editing*, read
[Accuracy rules](#accuracy-rules) at the bottom.

---

## Title

**dsh-sessionflow — Continue Codex and Claude Code work inside DeepSeek Harness**

Alternates:

- `dsh-sessionflow: cross-agent session continuity for DeepSeek Harness`
- `Continue another agent's work in DSH — with the context that was missing`

---

## Summary (134 words — for the post body or a directory listing)

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

## Full post

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
use the core from a terminal, you get the same answers.

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

You do not tell the agent which tool to call. It chooses from the tool
descriptions, and that autonomous selection has been observed in a live run.

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
| Project timelines | Every agent that touched a project, in order |
| WorkThread continuity | Task-centric session groups with an explicit lifecycle |
| Context handoff | A Context Package another agent reads and continues from |
| Provenance-aware summaries | Each turn carries where it came from; bootstrap text is distinguishable from what you typed |
| Local-first operation | Nothing leaves the machine; the index is a file you own |

### The six tools

| Tool | What it answers |
|---|---|
| `sessionflow_search` | "Find the session where I fixed the parser." |
| `sessionflow_recent` | "What have I been doing this week?" |
| `sessionflow_session` | "Show me what that one session was about." |
| `sessionflow_current_work` | "Where did I leave off on *this* project?" |
| `sessionflow_continue` | "Pick the work back up." |
| `sessionflow_merge` | "Put these sessions together and let me continue." |

### Install

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

### Try it in two minutes

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

### Links

| | |
|---|---|
| Plugin | https://github.com/HarryHeYu/dsh-sessionflow |
| Core | https://github.com/HarryHeYu/sessionFlow |
| Plugin v1.1.0 | https://github.com/HarryHeYu/dsh-sessionflow/releases/tag/v1.1.0 |
| Core v1.1.0 | https://github.com/HarryHeYu/sessionFlow/releases/tag/v1.1.0 |
| Quick Start | https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md |
| Live verification (synthetic index) | https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p8-live-verification.md |
| Live verification (real provider files) | https://github.com/HarryHeYu/dsh-sessionflow/blob/main/docs/p9-live-verification.md |
| Issues | https://github.com/HarryHeYu/dsh-sessionflow/issues |

### Compatibility and limitations

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
- **Install is from Git.** No npm package, no PyPI package, and no prebuilt
  tarball attached to the Release yet.

### Feedback

- Bugs and questions: https://github.com/HarryHeYu/dsh-sessionflow/issues
- Core-side issues: https://github.com/HarryHeYu/sessionFlow/issues

When reporting a problem, the `dsh --profile <p> --dump-config` output and the
exact tool call help more than a description.

---

## Short version (≈55 words, for a channel with a length limit)

> `dsh-sessionflow` continues work across coding agents inside DeepSeek Harness.
> Six tools read a local session index built by sessionFlow — the history Codex,
> Claude Code, Grok and others already write to disk — so a DSH agent can pick up
> where you left off, with the goal, files and open items intact. Local-first.
> Native resume is not yet verified. https://github.com/HarryHeYu/dsh-sessionflow

---

## Accuracy rules

Keep these true when editing or publishing:

1. Never write that native resume works, or that "all agents resume seamlessly".
2. Never claim all provider capabilities are equal.
3. Never imply the plugin converts native session formats.
4. Never state a test count, tool count or provider count that the code does not
   have.
5. Say "verified" only for what the verification tables in `README.md` list as
   verified, and name the level (unit / integration / live).
6. Do not say the plugin is listed, featured or endorsed anywhere until a
   listing actually merges — a submitted PR is not a listing.
