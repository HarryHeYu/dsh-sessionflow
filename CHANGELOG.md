# Changelog

Notable changes to `dsh-sessionflow`, newest first.  The full write-up for each
release is in `docs/release-<version>.md`.

## [1.2.0] — 2026-10-31

**渠道兼容跟进（R1）**：验证并接纳 DSH `0.2.1-rc.5`（`next`）与
`0.2.2-alpha.2`（`alpha`）。peer range 显式命名两条新 prerelease 线；
Windows 冷启动四关 + 真实 bridge 调用通过，Linux CI 补完整 boot 门。
发布说明：[docs/release-v1.2.0.md](docs/release-v1.2.0.md)。

另含 [Unreleased] 中的全部修复（peer range 修复、探测超时、并发解析、
测试隔离）。详见完整 Changelog。

## [Unreleased]

### Maintainer verification (2026-11-11, PR #5 merged as `b3fc6b9`)
- Merged via squash; author attribution retained as @SunnyRad. No plugin
  version was released. Bridge schema stays `1`; `peerDependencies` unchanged.
- Verified against real sessionFlow Core `1.3.1` on Windows: `npm ci`,
  `npm run build`, `npm test` — **96/96 passed, 0 failed, 0 skipped**; the 42
  targeted regressions **42/42**. Cold-start CI **6/6 success** (5 channels).
- Three integration-test failures reported by the author were reproduced and
  compared against `main`: identical failures on both trees. Two are a
  pre-existing `VOYAGER_BIN` test-order leak (dsh-sessionflow#6), one is the
  Core-side stdin UTF-8 decoding defect (sessionFlow#21). Neither is caused by
  this PR; `tests/bridge.test.ts` is byte-identical before and after it.
- The Core stdin defect is a **v1.3.1 release gate** item. Candidate artifacts
  built before that fix must not be published as the final release.

### Added
- **Two new DSH channels verified and admitted** (2026-10-31): `0.2.1-rc.5`
  (the `next` dist-tag, requires cordis `~4.0.5`) and `0.2.2-alpha.2` (the
  `alpha` dist-tag, requires cordis `~4.0.6-alpha.1`). Peer ranges now name
  both prerelease lines explicitly; Windows cold-start verified install →
  bundle → prepare → profile layer → a real bridge call against a live core,
  and the Linux cold-start CI rows run the full boot gate on both channels.

### Fixed
- **`sessionflow_merge` built an argv the core's argparse could not parse.**  The
  tool emitted options in the space form (`--goal <value>`) and appended the ids
  bare, so:
  * a `goal` beginning with `-` (`--verbose`, `---`) made argparse read it as a
    flag and exit with `expected one argument`, surfacing as a `CLI_FAILED` that
    named no argument;
  * a session id beginning with `-` was parsed as a flag rather than an id.

  Options now travel in the `=` form (`--goal=--verbose`), the ids follow a `--`
  separator, and `--json` is placed **before** that separator — after it,
  argparse stops option parsing and reads the flag as another session id
  (measured: `sessions=['a:1','--json'], json=false`, so the core would have
  looked for a session called `--json`).  All three shapes are proven against
  the real `merge` subparser, not against a mock.

- **An over-long argument crashed the spawn without naming the culprit.**  A
  command line has a hard ceiling (32767 characters on Windows, where Node
  raises `ENAMETOOLONG` synchronously; `E2BIG` on POSIX), and the bridge reported
  it as `could not start '<node>': Error: spawn ENAMETOOLONG` — which reads like
  a broken install and points at the executable.  Values are now bounded before
  the spawn (`MAX_ARG_CHARS` per value, `MAX_ARGV_CHARS` in total) and the
  refusal names the field: `` `goal` is too long: 40000 characters, but at most
  8000 can be carried on a command line. ``  Measured transition for a
  40000-character goal: a 4 ms failure naming the executable → a 0 ms refusal
  naming `goal`.

- **A provider-filtered `sessionflow_recent` could silently under-return.**  The
  core's `overview` op has no provider parameter, so the filter runs in the
  plugin — and it asked the core for `limit * 4` rows and hoped the wanted
  provider was at least a quarter of them.  When it was not, the tool returned
  fewer rows than asked while the core had plenty more, and the answer was
  indistinguishable from "there is nothing else".  It now requests the widest
  window the core honours and marks a window-limited answer with `truncated` so
  an incomplete list cannot read as a complete one.

- **…and the first version of that `truncated` signal could not see the worst
  case: the wanted provider sitting entirely *behind* the window.**  The
  predicate required `matched.length > limit`, i.e. "the filter cut something",
  but when 250 fresher rows of another provider fill the window the filter
  matches **nothing** and cuts nothing — so an empty list came back with no
  marker while the sessions did exist.  Measured on a real 255-session index
  (250 `claude` ahead of 5 `codex`): `{provider:'codex', limit:5}` returned
  **0 rows, `truncated` absent**, while `sessions {platform:'codex'}` listed all
  5.  The condition is now "the core filled the window" rather than "we cut
  more than `limit`", and it is gated on the call being filtered at all, so an
  ordinary full page is not relabelled as clipped.

  The fixture could not have caught this: `stub-overview.mjs` ignored `limit`
  and always answered with the whole payload, so "the core gave us everything"
  and "the core gave us the window" were the same answer.  It now clips the way
  a real core does.

- **The echo stub answered with a shape the real core cannot produce.**  The
  subcommand branch wrapped its reply in an `id`/`result` envelope; a real
  subcommand with `--json` prints a bare payload (`_handoff_via_engine` does
  `print(json.dumps(payload))` directly — only the `api` op wraps).  No
  assertion depended on the envelope, which is why nothing noticed; it is fixed
  so the fixture cannot hide a future parsing mistake.

- **`sessionflow_merge` silently discarded session ids it did not like.**  The
  argument was read with `filter(isString && length > 0)`, so `['a:1', 42, '  ']`
  merged **one** session and reported success: the caller was told the merge
  happened, with no way to see that two of the ids it named were dropped.  The
  merge is the unit of consent — the caller names a set and the WorkThread
  contains exactly that set — so quietly narrowing it is a different operation
  performed on the caller's behalf.  Every element is now checked, not filtered
  (`session_ids[i]` names the offending index so the other nine ids can be
  kept), whitespace-only entries are refused as blank, and a non-array argument
  is refused too.  Measured: `['a:1', 42]` went from "merged a:1, exit 0" to a
  refusal naming `session_ids[1]`.

- **A fractional `limit` did not behave the way the code comment claimed.**  The
  comment said the core rejects `3.7` with `slice indices must be integers`.
  That is true of `overview` but **not** of `search`, which does
  `int(limit or 20)` (`api.py:254`) and so truncates `3.7` to `3` — no error, no
  warning, just fewer hits than were asked for, which reads as a complete
  answer.  Both behaviors are now documented where they belong and measured:

  | input | `search` (`int()`) | `overview` (raw slice) |
  |---|---|---|
  | `limit: 3.7` | 3 rows, silently truncated | `slice indices must be integers` |
  | `limit: 0` | 20 rows (0 reads as absent) | 0 rows |
  | `limit: -2` | 33,277 rows (no cap) | 91 of 94 rows |

  The guard itself was already right; only its justification was wrong, and a
  wrong justification is how a later change removes the guard for the wrong
  reason.

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
