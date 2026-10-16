# P11 — Dependency Compatibility Closure

P11 asked a narrower question than the rounds before it: **can a community user
follow the install instructions and actually end up with a working plugin?** The
answer was no, and the reason was not in the plugin's logic — it was in two
version ranges that excluded every harness build a user is likely to be on.

Everything below was measured, not reasoned.  Each install ran in its own
directory with its own `DSH_HOME`; the user's real `~/.dsh` profiles and
`~/.voyager` index were never written to.

## Environment

| | |
|---|---|
| pnpm | `11.22.0` (the installer `dsh plugin add` uses) |
| Node | `22.22.2` |
| Harness | `@deepseek-ai/dsh` `0.1.5-rc.3`, `0.2.0-rc.2`, `0.2.1-alpha.4` |
| Plugin | `8f49eba` (ranges fixed in `70c2048`) |
| Core | `E:\code\voyager` on `PYTHONPATH`, `voyager` importable |
| Method | `pnpm install --strict-peer-dependencies --ignore-scripts`, `file:` spec |

## 1. Before / after, under the real installer

Same pnpm, same host versions, same strict setting, same isolated layout, same
install method.  The only variable is the plugin's `peerDependencies`.

### Before (`^0.1.5-rc.3` + cordis `4.0.2`)

```
$ pnpm install --strict-peer-dependencies --ignore-scripts
EXIT CODE: 1

[ERR_PNPM_PEER_DEP_ISSUES] Unmet peer dependencies

✕ unmet peer @deepseek-ai/cordis
  Installed: 4.0.4
  Wanted:
    4.0.2:
      dsh-sessionflow@1.1.0

✕ unmet peer @deepseek-ai/dsh-tools
  Installed: 0.2.0-rc.2
  Wanted:
    ^0.1.5-rc.3:
      dsh-sessionflow@1.1.0
```

The `Wanted:` block names **`dsh-sessionflow@1.1.0`** as the source of both
conflicts, which is exactly what a user would see and be unable to act on.

Worth recording precisely: pnpm links the tree *before* it validates peers, so a
failed install leaves a populated `node_modules/` behind.  The user-visible
failure is the non-zero exit, not a missing directory — anyone verifying this by
"is the folder there?" would conclude it worked.

### After (current ranges)

```
$ pnpm install --strict-peer-dependencies --ignore-scripts
EXIT CODE: 0
+ @deepseek-ai/cordis 4.0.4
+ @deepseek-ai/dsh-tools 0.2.0-rc.2
+ dsh-sessionflow 1.1.0
```

Actual resolved versions, read back off disk:

| package | resolved |
|---|---|
| `@deepseek-ai/cordis` | `4.0.4` |
| `@deepseek-ai/dsh-tools` | `0.2.0-rc.2` |
| `dsh-sessionflow` | `1.1.0` (the `file:` checkout) |

## 2. Resolution across every channel

Each row pins the cordis that *that harness itself* declares, so the only
question left is whether our ranges admit the pair.

| host `dsh-tools` | its cordis | exit | result |
|---|---|---|---|
| `0.1.5-rc.3` | `4.0.2` (exact) | 0 | RESOLUTION_VERIFIED |
| `0.1.7-rc.2` | `~4.0.4` | 0 | RESOLUTION_VERIFIED |
| `0.2.0-rc.2` (`next`) | `~4.0.4` | 0 | RESOLUTION_VERIFIED |
| `0.2.1-alpha.4` (`alpha`) | `~4.0.5-alpha.2` | 0 | RESOLUTION_VERIFIED |

### Is the range too wide?

Resolved against the published lists:

* `@deepseek-ai/dsh-tools` — **11 of 34** versions admitted (the old range
  admitted **1**).  Excluded: everything below `0.1.5-rc.3`, plus
  `0.1.5-alpha.*`, `0.1.5-rc.1/2` and `0.1.7-alpha.*`.
* Upper bound holds: `0.2.9` admitted, `0.3.0` and `1.0.0` refused.
* `@deepseek-ai/cordis` — **5 of 8** admitted (`4.0.2`, `4.0.3`, `4.0.4`,
  `4.0.5-alpha.1`, `4.0.5-alpha.2`); `5.0.0` refused.

Why the range is a chain of branches rather than something readable like
`>=0.1.5-rc.3 <0.2.0`: node-semver only lets a **prerelease** satisfy a range
when some comparator in that range shares its exact `major.minor.patch` tuple
*and* itself carries a prerelease tag.  So `>=0.1.5-rc.3 <0.2.0-0` admits the
`0.1.5` tuple and nothing else — `0.1.7-rc.2` does not match it.  Each
prerelease line has to be named.  The apparent redundancy in the range is
load-bearing.

One known gap, left deliberately: `0.1.7-alpha.1/2` fall between the named
`0.1.7-rc.1` branch and the `0.1.6` branch and are excluded.  They are alpha
builds of a line we verified at `rc`, and no evidence exists for them.

## 3. Runtime verification

`scripts/cold-start.sh` was run once per channel, against a real `dsh` of that
version, into a throwaway `DSH_HOME`:

| harness | install | DSH loads it | bridge reaches core |
|---|---|---|---|
| `0.1.5-rc.3` | yes | yes | yes |
| `0.2.0-rc.2` (`next`) | yes | yes | yes |
| `0.2.1-alpha.4` (`alpha`) | yes | yes | yes |

"DSH loads it" is the boot reaching the credential gate — the gate is *after*
the plugin tree is imported, so arriving there proves the module loaded and
`apply()` ran under DSH's own resolution.  A failed import looks nothing like
it (`plugin tree failed to load ... failed to import loader entry`).

Then a real tool call, driven through the **installed** bridge (the copy in the
profile, not the checkout) against a synthetic two-session index (one `codex`,
one `claude`, 11 events):

```
resolved core : <python> -m voyager.cli --db <synthetic index>
schema_version: 1
search count  : 3
providers seen: codex
overview      : {"sessions":2,"events":11,"by_provider":{"claude":1,"codex":1}}
SMOKE OK
```

Identical output on all three channels.  `sessionflow_search`'s exact op
(`callOp('search', …)`) is what was called, so this is the plugin's own code
path, not a wrapper around it.

### What each channel is claimed to be

| channel | status | evidence |
|---|---|---|
| `0.1.5-rc.3` | **SUPPORTED** | cold-start + tool call; also CI |
| `0.1.7-rc.2` | RESOLUTION_VERIFIED | installs cleanly; runtime not run |
| `0.2.0-rc.2` (`next`) | **SUPPORTED** | cold-start + tool call; also CI |
| `0.2.1-alpha.4` (`alpha`) | **SUPPORTED** | cold-start + tool call, local only |

`0.1.7-rc.2` is the one row that stays at resolution.  It is admitted because
leaving a real 0.1.x build out is what caused the original bug, and nothing more
is claimed for it than "the installer accepts it".

`latest` is a stale `0.0.1-rc.1` upstream and is **not** admitted.  That is a
DSH packaging matter, not something this plugin can honestly claim: there is no
evidence the plugin works on the first rc, and claiming it to make an install
succeed would be the same mistake in the opposite direction.

## 4. The guard, and the guard that was not guarding

The range fix landed in `70c2048` with a test.  That test did not run.

It asked the registry via `execFileSync('npm', …)`.  On Windows `npm` is
`npm.cmd`, and Node refuses to spawn a `.cmd` without a shell, so the call threw
`ENOENT`, the helper returned `null`, and the assertion fell through to a
diagnostic plus an early `return` — which `node --test` reports as a **pass**.
The guard read green on the maintainer's own platform while never reaching the
registry.  Measured directly:

```
execFileSync(npm)  -> FAILED: ENOENT | spawnSync npm ENOENT
execSync(npm ...)  -> OK: { "latest": "0.0.1-rc.1", "next": "0.2.0-rc.2", "alpha": "0.2.1-alpha.4" }
```

The two questions now have two mechanisms:

* **`tests/peer-range.test.ts`** — asserts a *pinned* harness list held in the
  file.  No network, no shell, no registry, and nothing to skip when offline.
  This is the blocking gate.  It carries each channel's status, so widening a
  range forces a decision about the new row rather than a silent admission.
* **`scripts/check-peer-range-live.mjs`** (`npm run check:peer-range`) — resolves
  live dist-tags and version lists.  Wired into CI with
  `continue-on-error: true`, because a floating registry must not be able to turn
  CI red for reasons that are not this repository's.

Mutation check, offline: restoring the original ranges fails two of the four
tests with actionable messages —

```
not ok 1 - the dsh-tools peer range admits every harness build we declare
    the peer range does not admit 0.1.7-rc.2, 0.2.0-rc.2, 0.2.1-alpha.4 -- a user
    on that harness gets ERESOLVE before the plugin ever loads.  Range: ^0.1.5-rc.3
not ok 3 - the cordis peer range admits the cordis each harness build declares
    harness 0.1.7-rc.2 declares cordis 4.0.4, but our range (4.0.2) excludes it
```

Resolution success is never read as runtime compatibility: the tests say so in
their header, and the per-channel table above keeps the two apart.

## 5. CI

`HOST_DSH` was pinned to `0.1.5-rc.3` — the one version the broken range happened
to admit.  The bug was invisible by construction, and no amount of running that
job would have found it.  The matrix now carries a row per channel, and each row
asserts `dsh --version` matches the version the row claims:

| row | install kind | harness |
|---|---|---|
| `github-015` | `github:` | `0.1.5-rc.3` |
| `file-015` | `file:` | `0.1.5-rc.3` |
| `file-020` | `file:` | `0.2.0-rc.2` |

Run `38852036564` on `8f49eba` — **4/4 jobs green**:

```
success  plugin tests on linux
success  linux cold-start (github-015)
success  linux cold-start (file-015)
success  linux cold-start (file-020)
```

The `file-020` row is the one that matters: it proves on Linux, from a clean
runner, that the current channel installs, loads and reaches a core.

## 6. Community submission

PR [awesome-dsh-plugin#7226](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7226)
is unchanged and needed no action:

| | |
|---|---|
| state | OPEN |
| mergeable | MERGEABLE / CLEAN |
| submission gate | PASS |
| checks | PASS |
| reviews | 0 human (one Copilot quota notice) |
| comments | 1 (the follow-up noting this install blocker) |

One file, `category: session`, no duplicates, no conflicts.  The dependency fix
does not change the entry, so the PR branch was not touched.  **READY FOR
REVIEW** — not listed, and not claimable as listed until a maintainer merges it.
