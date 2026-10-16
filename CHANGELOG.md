# Changelog

Notable changes to `dsh-sessionflow`, newest first.  The full write-up for each
release is in `docs/release-<version>.md`.

## [Unreleased]

### Fixed
- **The plugin could not be installed on any current harness.**  Both peer
  ranges excluded the versions users actually run, so `dsh plugin add` ended in
  an `ERESOLVE` that had to be worked around by hand.

  `@deepseek-ai/dsh-tools` was pinned to `^0.1.5-rc.3`.  That reads as "0.1.5-rc.3
  and later within 0.1.x", but node-semver only lets a *prerelease* version
  satisfy a range when some comparator in that range shares its exact
  `major.minor.patch` tuple **and** itself carries a prerelease tag — so it
  really meant "only the 0.1.5 tuple".  Measured against the 34 published
  versions it matched **exactly one**, the one it was written against, and
  excluded both current dist-tags: `next` (`0.2.0-rc.2`) and `alpha`
  (`0.2.1-alpha.4`), along with `0.1.7-rc.2`.  The range now names each
  prerelease line explicitly.

  `@deepseek-ai/cordis` was pinned to an exact `4.0.2`, while the host
  (`@deepseek-ai/dsh-tools@0.2.0-rc.2`) declares `~4.0.4` — the same failure by a
  different route.  It is now `^4.0.2 || >=4.0.5-alpha.1 <5.0.0`, which keeps the
  version we build against and admits what the host asks for.

  Neither failure was visible from the repository: the tests all passed, the
  build was clean, and the CI gate on the community submission was green.  It
  only appeared when the published version lists were actually resolved against
  the ranges.

- **The regression test written for the above did not actually run.**  It asked
  the registry via `execFileSync('npm', ...)`, and on Windows `npm` is `npm.cmd`,
  which Node refuses to spawn without a shell — so the call threw `ENOENT`, the
  helper returned `null`, and the version-count assertion degraded to a
  diagnostic and an early `return`.  `node --test` reports an early return as a
  **pass**, so the guard read as green on the very platform it was written on
  while never once reaching the registry.  A guard that cannot run is worse than
  no guard.  The suite now splits cleanly:
  * `tests/peer-range.test.ts` asserts the **pinned** harness list in the file —
    no network, no shell, no registry, and nothing to skip offline.  This is the
    blocking gate.
  * `scripts/check-peer-range-live.mjs` (`npm run check:peer-range`) resolves the
    live dist-tags and version lists, and is wired into CI with
    `continue-on-error: true`.  A floating registry must not be able to turn CI
    red for reasons that are not this repository's.

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
- **Concurrent resolutions each started their own probe.**  The cache is only
  populated once a probe has *finished*, so several tool calls issued in one turn
  each spawned an interpreter to answer the same question.  Concurrent callers
  now share the in-flight resolution, and a failure is reported to all of them
  identically instead of some succeeding on a later probe.

### Changed
- **The suite no longer writes into the developer's real profile.**  The `merge`
  tests let the core pick the default output, which is
  `~/.voyager/bundles/bundle-merged-<n>sessions-<providers>-<epoch>.md`.  Two
  consequences, both observed: scratch accumulated in the user's home (186 files
  by the time this was found), and because the default name had one-second
  granularity, parallel suites computed the *same* path and one read-back came
  back empty — `merge output is stable for the same input` failing for a reason
  that had nothing to do with determinism.  The tests now pass an explicit `-o`
  under the suite's temp dir, and `tests/isolate.ts` points `HOME` and
  `USERPROFILE` at a throwaway directory so every core this suite spawns is
  isolated too.
  `APPDATA` is deliberately **not** redirected: Python resolves its user
  site-packages from it, and redirecting it makes every spawned core fail with
  `ModuleNotFoundError: No module named 'voyager'` — which showed up as nineteen
  integration tests silently *skipping*, a worse failure than the leak.  A test
  records that decision so it reads as a choice rather than an oversight.
- Integration calls go through the interpreter the seeding step already proved
  works, instead of making the bridge scan `PATH` again on every call.  `PATH`
  discovery keeps its own tests.
- **CI covered one harness and called it coverage.**  `HOST_DSH` was pinned to
  `0.1.5-rc.3`, so every cold-start run proved the install path on exactly the
  version the broken peer range happened to admit — the bug was invisible by
  construction.  The matrix now carries a row per channel: `github` and `file`
  installs on 0.1.5-rc.3, plus a `file` install on the current `next`
  (`0.2.0-rc.2`).  Each row asserts that `dsh --version` reports the version the
  row claims, so a row cannot quietly exercise the wrong harness.
- **What is verified, and how far.**  The ranges admit the 0.1.5 / 0.1.6 / 0.1.7
  and 0.2.x prerelease lines — 11 of the 34 published versions, where the old
  range admitted 1.  Each channel was then taken as far as the evidence goes, in
  an isolated `DSH_HOME` with a throwaway profile:

  | harness | installs | DSH loads it | tool call answered |
  |---|---|---|---|
  | 0.1.5-rc.3 | yes | yes | yes (`search` → 3 rows) |
  | 0.1.7-rc.2 | yes | not run | not run |
  | 0.2.0-rc.2 (`next`) | yes | yes | yes (`search` → 3 rows) |
  | 0.2.1-alpha.4 (`alpha`) | yes | yes | yes (`search` → 3 rows) |

  "Not run" is the honest entry for 0.1.7-rc.2: it resolves, and nothing more is
  claimed.  `tests/peer-range.test.ts` carries the same per-channel status, so a
  range cannot be widened without someone deciding what the new row's status is.

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
