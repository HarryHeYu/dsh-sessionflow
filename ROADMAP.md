# Roadmap

Where this plugin is going, in an order that can actually be worked on. Each
item is written so it can become one issue with a clear scope, and so a
contributor can pick it up without re-deriving the whole design.

Two repos, one system:

- **sessionFlow** (core) — adapters, index, search, continuity, WorkThread,
  provenance, evidence. https://github.com/HarryHeYu/sessionFlow
- **dsh-sessionflow** (this plugin) — six `sessionflow_*` tools, the bridge, DSH
  host compatibility. It does not re-implement core behaviour.

Verification levels used below: `UNIT_TESTED`, `INTEGRATION_TESTED`,
`LIVE_VERIFIED`, `NOT_VERIFIED`, `BLOCKED`. A feature is not "done" until its
level is stated.

---

## Milestone A — Correctness & release

Goal: the fixes already written reach users, and the numbers in the docs stop
lying.

| Item | Where | State | Notes |
|---|---|---|---|
| Review and merge PR #5 (argv + numeric bounds + `recent` window) | plugin | **MERGED** `b3fc6b9` (2026-11-11) | Squash merge, author attribution @SunnyRad. Real-core verification 96/96, cold-start CI 6/6, final main 102/102. No plugin version released. |
| Core v1.3.1 release (DSH v4 discovery, UTF-8 stdout, short CJK search) | core | **BLOCKED — new gate item** | Not tagged. [sessionFlow#21](https://github.com/HarryHeYu/sessionFlow/issues/21): `api` stdin uses the legacy Windows code page, so UTF-8 CJK queries silently return 0 rows. Fix reserved for @SunnyRad; artifacts built before it are superseded. |
| Test-harness `VOYAGER_BIN` order leak (`bridge.test.ts`) | plugin | open — [#6](https://github.com/HarryHeYu/dsh-sessionflow/issues/6) | Two integration tests fail when `VOYAGER_BIN` is the only Core path; reproduced identically on `main` and PR HEAD, pre-existing. `help wanted`. |
| Close out plugin issue #1 with the first release that contains the fixes | plugin | open | Must name the version, not just the commit. |
| Release/documentation consistency | both | done for core, done for plugin README | `scripts/check_consistency.py --strict` in core CI. |
| Real-core bridge regression in CI | plugin | **not covered** | CI uses stubs only. A job that installs a pinned core and runs the integration subset is missing. |

## Milestone B — Provider & provenance

Goal: the index knows about more agents, and it stops guessing where an event
came from.

| Item | Where | State |
|---|---|---|
| OpenCode adapter (read-only SQLite, v2 + legacy schema) | core | **implemented, UNIT_TESTED**, on a branch; no real install observed |
| Clarify DSH audit state (`NOT_FOUND_IN_CURRENT_AUDIT` vs `installed`) | core | open — display/summary only, the detection itself is correct |
| DSH provenance classifier | core | open — must use structural fields only; `UNKNOWN` when there is no evidence |
| Capability matrix validation (declaration vs adapter denial) | core | partly done; `tests/test_capability_consistency.py` pins the ZCode case |

## Milestone C — Trustworthy continuation

Goal: an agent can check a claim instead of trusting it, and "resume" means
something observed.

| Item | Where | State |
|---|---|---|
| `sessionflow_evidence_verify` tool (expose core's five-state verify) | plugin | not started; depends on bridge schema decision |
| Evidence claim vs observation (a `MATCH` proves a reference, not a fact) | both | design only |
| Native resume live verification (one provider, isolated session, sentinel) | core | `NOT_VERIFIED` — needs credentials and a real agent run |
| Repeatable tool-selection evaluation | plugin | ad-hoc experiments only; no repeatable suite |

## Milestone D — Distribution & maintenance

| Item | Where | State |
|---|---|---|
| VS Code VSIX (Context Composer, timeline) | core | extension exists at 0.1.0; **no VSIX**, not on Marketplace |
| macOS CI | core | **absent** — matrix is ubuntu + windows |
| DSH stable/next/alpha canary | plugin | manual cold-start rows; no scheduled job |
| Windows job for `cold-start.yml` | plugin | absent, and PR #5 changes Windows-relevant argv behaviour |
| Docs/release automation | both | core has a consistency checker; plugin has none |

---

## Work that is ready to pick up

These are deliberately small and bounded. Nothing here requires touching the
database schema, the continuity engine, or the bridge protocol.

### A1. Plugin: real-core integration job in CI
- **Problem**: `npm test` uses stubs. Nothing proves the bridge still works
  against a released core.
- **Scope**: a CI job that installs a pinned `voyager` version, creates a demo
  index, and runs the integration subset of the suite.
- **Acceptance**: the job fails when the core's JSON shape changes; it does not
  need network beyond installing the pinned core.
- **Level**: `INTEGRATION_TESTED`. Difficulty: small.

### A2. Plugin: Windows job for cold-start
- **Problem**: argv length and command-line quoting are platform-specific, and
  CI is `ubuntu-latest` only.
- **Scope**: add a `windows-latest` leg (install + load + one tool call).
- **Acceptance**: green on a fork PR after maintainer approval; no secrets.
- **Level**: `INTEGRATION_TESTED`. Difficulty: small–medium.

### B1. Core: DSH audit-state naming
- **Problem**: `doctor` shows `NOT_FOUND_IN_CURRENT_AUDIT` next to
  `installed: true`, which reads as "not installed".
- **Scope**: display and summary semantics only. **Do not** change the DSH
  detection path — it is correct.
- **Acceptance**: installed-state and capability-state are visibly separate
  facts; a test pins the wording.
- **Level**: `UNIT_TESTED`. Difficulty: small.

### B2. Core: DSH provenance classifier
- **Problem**: DSH events have no classifier, so `origin` is always `unknown`.
- **Scope**: read the DSH JSONL/zstd record structure and classify from
  **structural fields only** (record type, explicit source flags). No text
  heuristics, no model.
- **Acceptance**: positive and negative synthetic cases; report the `UNKNOWN`
  share alongside the accuracy, not instead of it.
- **Level**: `UNIT_TESTED`. Difficulty: medium.

### C1. Plugin: `sessionflow_evidence_verify`
- **Problem**: the core can verify an evidence reference; an agent cannot ask it.
- **Scope**: one tool calling the core's existing verify path. Decide first
  whether bridge schema 1 can carry it additively.
- **Acceptance**: `MATCH` is described as "this reference matches", never as
  "the claim is true"; all five states are reachable and tested.
- **Level**: `UNIT_TESTED` + `INTEGRATION_TESTED`. Difficulty: medium.

### C2. Plugin: tool-selection evaluation that can be repeated
- **Problem**: whether an agent *reaches for* these tools has only been observed
  in ad-hoc runs.
- **Scope**: a small, scripted prompt set with a fixed scoring rule, run by the
  maintainer (needs credentials). Record which tool was called, not whether the
  final prose "sounds right".
- **Acceptance**: rerunnable; the score is per-prompt; failures are inspectable.
- **Level**: `LIVE_VERIFIED`. Difficulty: medium. Maintainer-run.

### D1. Core: VSIX packaging
- **Problem**: the extension works from source but cannot be installed.
- **Scope**: build script + VSIX artifact + install smoke test. Do not redesign
  the UI.
- **Acceptance**: a user can install the VSIX without cloning; CI uploads the
  artifact.
- **Level**: `UNIT_TESTED` + a manual install check. Difficulty: medium.

---

## Next-stage execution order (2026-11-11)

Two release items were independent and are now resolved or gated; do not let
either one block all other work, but do not open several cross-repo protocol
changes at once either.

**P0 — correctness & release**
1. PR #5 — **done** (squash-merged, real-core verified).
2. Core `v1.3.1` — **gated** on [sessionFlow#21](https://github.com/HarryHeYu/sessionFlow/issues/21).
   Sequence: contributor's stdin fix → rebuild wheel/sdist from the final HEAD →
   recompute SHA-256 → rerun full tests, upgrade path, `twine check`, and this
   plugin's `v1.2.0` pairing → then a maintainer decision on the tag/Release.

**P1 — only after the gate closes**
- Core: OpenCode Adapter Phase 3 (real SQLite schema, incremental scan, WAL and
  error recovery, tool-call mapping; synthetic tests stay labelled synthetic).
- Core: Provider Capability Matrix, DSH provenance classifier.
- Plugin: Bridge/Tool contract maintenance and real-core contract tests.
- Plugin: `sessionflow_evidence_verify` design — reuse Core's five-state verify,
  never re-implement it here; a `MATCH` proves a reference, not a fact.

**P2**
- Native Resume live verification (keep `NOT_VERIFIED` until observed), VSIX,
  macOS CI, DSH canary, and the Windows CI jobs (A2 / D2).

Claimable work is listed below and in the two repos' Issues. `help wanted` does
not imply a deadline. See [#6](https://github.com/HarryHeYu/dsh-sessionflow/issues/6)
for a small, test-only first task.

---

## Not planned (and why)

- **Auto-clustering sessions into threads.** Explicit WorkThreads stay the
  semantic. Without a false-positive corpus, automatic merging would silently
  combine unrelated work.
- **Re-running the reverted scan-transaction optimisation.** It was measured and
  reverted; the streaming path already fixed the real bottleneck.
- **LLM-generated narrative summaries by default.** Local-first and
  deterministic by design. Any narrative refinement would be opt-in, bounded and
  traceable, and it would never replace the raw evidence.
- **Claiming "native resume" from a context bundle.** Handing an agent a
  compiled context is continuation, not resume. The two are reported separately.

## How work gets accepted

`issue discussion → fork/branch → draft PR → CI + review → merge`. No fixed
dates, no requirement to install a paid model to run the normal suite. See
[CONTRIBUTING.md](CONTRIBUTING.md).
