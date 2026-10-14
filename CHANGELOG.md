# Changelog

Notable changes to `dsh-sessionflow`, newest first.  The full write-up for each
release is in `docs/release-<version>.md`.

## [Unreleased]

### Fixed
- **A loaded machine could be told the core was not installed.**  Discovery
  probes the candidate command by spawning it and importing the package, and the
  probe shared a 15 s ceiling.  Under real load — a full CI matrix, a cold page
  cache, ten suites running at once — starting Python and importing the package
  can exceed that, and every integration test in the process then failed with
  `VOYAGER_NOT_FOUND` for a core that was installed and working.  Measured: 8 of
  80 runs under load.  The probe now has a 60 s budget of its own; it runs once
  per process and the result is cached, so being patient costs one startup and
  nothing else, while failing it is the worst answer this module can give.
  A regression test pins the mechanism with a core that answers in 2.5 s and a
  400 ms per-call deadline.

### Changed
- **The suite no longer writes into the developer's real profile.**  The `merge`
  tests let the core pick the default output, which is
  `~/.voyager/bundles/bundle-merged-<n>sessions-<providers>-<epoch>.md`.  Two
  consequences, both observed: scratch accumulated in the user's home (186 files
  by the time this was found), and because the default name has one-second
  granularity, parallel suites computed the *same* path and one read-back came
  back empty — `merge output is stable for the same input` failing for a reason
  that had nothing to do with determinism.  The tests now pass an explicit `-o`
  under the suite's temp dir.
- Integration calls go through the interpreter the seeding step already proved
  works, instead of making the bridge scan `PATH` again on every call.  `PATH`
  discovery keeps its own tests.

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
