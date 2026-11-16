# Roadmap

Where this plugin is going, in an order that can actually be worked on. Each
item is written so it can become one issue with a clear scope, and so a
contributor can pick it up without re-deriving the whole design.

Two repos, one system:

- **sessionFlow** (core) — adapters, index, search, continuity, WorkThread,
  provenance, evidence. https://github.com/HarryHeYu/sessionFlow
- **dsh-sessionflow** (this plugin) — seven `sessionflow_*` tools, the bridge, DSH
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
| Core v1.3.1 release (DSH v4 discovery, UTF-8 stdout, short CJK search) | core | **RELEASED** — tag `v1.3.1` (`81d7e3b`), GitHub Release published 2026-11-11, wheel + sdist attached | The stdin fix ([Core PR #19](https://github.com/HarryHeYu/sessionFlow/pull/19), `15723c1`), the `api serve` parser fix and the hard-coded test path fix ([sessionFlow#20](https://github.com/HarryHeYu/sessionFlow/issues/20), `b64e964`) are merged and shipped. Full tests, artifact SHA-256, upgrade path and Plugin `v1.2.0` pairing verified. Install `@v1.3.1`. |
| Test-harness `VOYAGER_BIN` order leak (`bridge.test.ts`) | plugin | **CLOSED** — [PR #7](https://github.com/HarryHeYu/dsh-sessionflow/pull/7) squash-merged as `f39be17` (author @SunnyRad) | The three mechanics tests now restore all three env keys; a hermetic whole-file regression pins it. Verified against real Core 1.3.1: 33 pass / 0 skipped. [#6](https://github.com/HarryHeYu/dsh-sessionflow/issues/6) is closed. |
| Close out plugin issue #1 with the first release that contains the fixes | plugin | **CLOSED** | [#1](https://github.com/HarryHeYu/dsh-sessionflow/issues/1) closed with the shipped version named explicitly (Core `v1.3.1`), not just a commit. |
| Current pairing — Core `v1.5.0` × Plugin `v1.3.0` | both | **RELEASED** (Core 2026-11-14, plugin 2026-11-15) | Seven tools, additive Core `evidence_verify` op, bridge schema 1; no second verification implementation in the plugin. |
| Release/documentation consistency | both | **DONE** for maintained docs | Core CI runs `scripts/check_consistency.py --strict`; the plugin pins the current pairing, seven-tool wording and false-blocker wording in offline tests. |
| Real-core bridge regression in CI | plugin | **not covered** | CI uses stubs only. A job that installs a pinned core and runs the integration subset is missing. |

## Milestone B — Provider & provenance

Goal: the index knows about more agents, and it stops guessing where an event
came from.

| Item | Where | State |
|---|---|---|
| OpenCode adapter (read-only SQLite, v2 + legacy schema) | core | **MERGED**, `UNIT_VERIFIED`; only v2.0.29 on Windows gated; no real v2.2.x observed |
| WorkBuddy adapter (read-only JSONL) | core | **MERGED** to main `04e04ff`, `UNIT_VERIFIED`; tenth provider; no native resume, startup hook or transcript writer |
| Clarify DSH audit state (`NOT_FOUND_IN_CURRENT_AUDIT` vs `installed`) | core | open (Core #14) — display/summary only, the detection itself is correct |
| DSH provenance classifier | core | open (Core #13) — must use structural fields only; `UNKNOWN` when there is no evidence |
| Capability matrix validation (declaration vs adapter denial) | core | partly done; `tests/test_capability_consistency.py` pins the ZCode case |

## Milestone C — Trustworthy continuation

Goal: an agent can check a claim instead of trusting it, and "resume" means
something observed.

| Item | Where | State |
|---|---|---|
| `sessionflow_evidence_verify` tool (expose core's five-state verify) | plugin | **RELEASED in v1.3.0** against Core v1.5.0; Core #22 and Plugin #9 closed; additive `evidence_verify` op via `callOp()`, bridge schema still 1 |
| Evidence claim vs observation (a `MATCH` proves a reference, not a fact) | both | documented in Core v1.5.0 and plugin v1.3.0; no truth judgement added |
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

### C1. Plugin: `sessionflow_evidence_verify` — delivered, kept for provenance
- **Delivered**: Core v1.5.0 added the additive `evidence_verify` op; plugin v1.3.0 exposes the seventh tool through `callOp()`. Core #22 and Plugin #9 are closed.
- **Boundary that still holds**: five-state semantics and verification logic stay in Core; `schema_version` is still 1; an older Core without the op reports `unknown op`, never `NOT_FOUND` or `MATCH`.
- **Trust wording**: `MATCH` means "this reference matches", never "the claim is true".

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

## Next-stage execution order (updated 2026-11-16)

The release items in P0 are all resolved. Do not let any one of them block
other work, but do not open several cross-repo protocol changes at once
either: a Core change lands and becomes installable before its plugin
consumer is accepted.

**P0 — correctness & release (DONE)**
1. PR #5 — **done** (squash-merged `b3fc6b9`, real-core verified).
2. Core `v1.3.1` — **RELEASED 2026-11-11**: tag `v1.3.1` (`81d7e3b`),
   GitHub Release published, wheel + sdist attached. The stdin / `api serve`
   parser fix ([Core PR #19](https://github.com/HarryHeYu/sessionFlow/pull/19),
   `15723c1`) and the hard-coded test path fix
   ([sessionFlow#20](https://github.com/HarryHeYu/sessionFlow/issues/20), `b64e964`)
   are shipped; full tests, artifact SHA-256, upgrade path and Plugin `v1.2.0`
   pairing verified. Issue #1 and #6 are closed (see Milestone A).

**P1 — current reliability work (Core main `04e04ff`)**
- Core: OpenCode and WorkBuddy adapters are **MERGED / UNIT_VERIFIED**; no v2.2.x
  or native-resume `LIVE_VERIFIED` claim is made.
- Core: DSH audit-state naming (Core #14) and provenance classifier (Core #13)
  are the next reliability items.
- Plugin: bridge/tool contract maintenance and real-core contract tests remain
  open; the current seven-tool contract is released in v1.3.0.
- Plugin: `sessionflow_evidence_verify` is **RELEASED** in v1.3.0; Core #22 and
  Plugin #9 are closed. Never re-implement verification here; a `MATCH` proves a
  reference, not a fact.

**P2**
- Native Resume live verification (keep `NOT_VERIFIED` until observed), VSIX,
  macOS CI, DSH canary, and the Windows CI jobs (A2 / D2).

Claimable work is listed above and in the two repos' Issues. `help wanted` does
not imply a deadline. The evidence-verify pair is closed:
[Core #22](https://github.com/HarryHeYu/sessionFlow/issues/22) +
[Plugin #9](https://github.com/HarryHeYu/dsh-sessionflow/issues/9). Plugin
[#2](https://github.com/HarryHeYu/dsh-sessionflow/issues/2) remains a pointer;
the technical work is tracked as Core #13 / #14. Core performance debt is
[Core #12](https://github.com/HarryHeYu/sessionFlow/issues/12) — still open.

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
