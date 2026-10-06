# dsh-sessionflow v1.0.0

**Official DSH integration plugin for sessionFlow.**

This plugin brings sessionFlow — the unified session index across AI coding
agents — into DSH (DeepSeek Harness) agent sessions as six tools:

- `sessionflow_search` — full-text search across every indexed agent
- `sessionflow_recent` — active WorkThreads and the newest sessions
- `sessionflow_session` — one past session as a compact continuation context
- `sessionflow_current_work` — the active thread, lease and continuation preview
- `sessionflow_continue` — the compiled continuation context for a thread
- `sessionflow_merge` — merge several sessions into one WorkThread (the only
  writing tool)

## Thin adapter only

The plugin is tool input → bridge call → result formatting.
**Core logic lives in sessionFlow** — ranking, thread selection, timeline
building, continuation compilation and merging are all core-side. The bridge
protocol is versioned; the plugin requires `schema_version >= 1` and fails
clearly against an older core.

## Verification

- automated contract tests: `npm test` (bridge mechanics with stub
  executables + JSON round-trip against a real seeded core)
- historical live verification (a real DSH agent run with recorded
  tool-call evidence) is documented in
  [docs/live-verification.md](docs/live-verification.md) and is **not**
  re-claimed by this release

## Install

```
dsh plugin --profile <profile> install HarryHeYu/dsh-sessionflow
```

Requires sessionFlow (the `voyager` CLI) installed and indexed locally.
