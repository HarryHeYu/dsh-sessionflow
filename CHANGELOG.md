# Changelog

Notable changes to `dsh-sessionflow`, newest first.  The full write-up for each
release is in `docs/release-<version>.md`.

## [1.1.0] — 2026-10-11

Correctness and trust release.  The tool surface is unchanged: same six names,
same arguments, bridge `schema_version` stays 1.

### Fixed
- **A configured core could be silently swapped for another index.**  With
  `voyagerBin` + `voyagerArgs` pointing at one index, a failed probe used to fall
  through to whatever `voyager`/`py`/`python` was on `PATH` — without the args —
  so the plugin answered from a different index and said nothing.  A configured
  executable is now authoritative: failure is reported by name, with the reason
  and with how to opt back into PATH discovery.
- **Nine integration tests never actually ran.**  A race between the module's
  top-level `await` and a test body that empties `PATH` meant the seeder spawned
  into an empty `PATH`; the error was swallowed by a bare `catch` and reported as
  "no python with the voyager package".  The suite went from 22 executed tests to
  40.
- **The test suite read the developer's real session directories**, because
  `merge` runs the core's freshness scan.  It now sets `VOYAGER_NO_SYNC`.
- **The README's install steps did not work**, and one of them installed the
  wrong project — `voyager` on PyPI is an unrelated library.
- **The missing-core error message pointed at that same wrong project.**
- A local path passed to `dsh plugin add` was documented as an install method; it
  becomes a pnpm `link:` dependency and is not discovered.  The README now says
  `file:` or `github:`.

### Added
- `thread_ambiguous`, `thread_candidates`, `candidates_truncated`,
  `thread_default_reason`, `thread_requested`, `thread_not_found` and
  `thread_out_of_scope` are typed on `sessionflow_current_work`, and documented
  for users in the README.
- Integration coverage against a real core for `recent`, `session` and `merge`
  (previously `merge` was only asserted for argument forwarding).
- `docs/p9-live-verification.md` — real provider session files through the real
  adapters, and the tool-contract results.

### Notes
- `sessionflow_merge` is still not chosen by the model when it is not named; the
  descriptions were deliberately left unchanged (editing them for tool-selection
  reasons was measured to make selection worse).
- Native resume remains **NOT VERIFIED**.

## [1.0.0] — 2026-10-06

First release.  Six tools over the sessionFlow core, installable from GitHub.
See `docs/release-v1.0.0.md`.
