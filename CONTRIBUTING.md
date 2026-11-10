# Contributing to dsh-sessionflow

Thanks for looking. This repository is a **thin adapter**: it registers six
`sessionflow_*` tools with the DeepSeek Harness (DSH) and forwards them to the
`voyager` core over stdio. Everything about sessions — indexing, search,
WorkThreads, continuity, evidence — lives in the core and is implemented **once**,
there.

That boundary is the single most important thing to know before changing code.

- Core: https://github.com/HarryHeYu/sessionFlow
- This plugin: https://github.com/HarryHeYu/dsh-sessionflow

## What belongs where

| Plugin (here) | Core (`sessionFlow`) |
|---|---|
| Tool registration, names, descriptions | Provider adapters (Codex, Claude, ZCode, DSH, OpenCode, …) |
| Bridge: argv, JSON, timeouts, error mapping | Unified index and database schema |
| Argument validation and bounds | `search`, `merge`, continuity engine, WorkThread |
| Structured results the agent reads | Provenance, evidence verification |
| DSH host compatibility (peer ranges, channels) | Native resume, API/MCP |
| Host integration tests | Everything that decides *what the data means* |

**Do not re-implement core behaviour here.** If a fix needs a search filter, a
merge rule or a new provider, it is a core change with a core test; the plugin
gets a thin call. A cross-repo change should be two linked issues/PRs with the
merge order stated (core first, then the plugin that depends on it).

## Getting set up

```sh
node --version        # >= 22.19 (see "engines" in package.json)
npm ci
npm run build         # tsc -> lib/
npm test              # build, then the full suite
```

`npm test` runs `node --test` over `tests/**/*.test.ts` with type stripping. No
model credentials are needed: the suite uses stub executables that answer like a
real core. `npm run check:peer-range` is a separate **online** check and is not
part of `npm test` — it can fail because a dist-tag moved, which must not turn
the suite red.

You need a `voyager` core only for the real-core integration tests:

```sh
pipx install "voyager @ git+https://github.com/HarryHeYu/sessionFlow.git@v1.3.0"
voyager integration-info --json    # must print schema_version: 1
```

## The rules that actually matter here

1. **A test must be able to fail.** If an assertion can pass because a helper
   returned `null` and the test returned early, it is not a test. We have been
   bitten by exactly that (a guard that never ran).
2. **Fixtures must match the real core's output shape.** The echo stub once
   wrapped its reply in an `id`/`result` envelope that no subcommand produces;
   nothing noticed for weeks. If you change a fixture, say which real command
   you compared it against.
3. **Refusing is not the same as failing.** A parameter the tool cannot honour
   should be refused *before* spawning a child, with a message naming the field.
   A core error is for things only the core can know.
4. **Never widen a peer range to make an install succeed.** A range is a claim.
   `tests/peer-range.test.ts` pins it and says how far each host was verified.
5. **No fixed delivery dates.** There is no schedule to hit. A small, correct PR
   is worth more than a large one that has to be re-reviewed from scratch.
6. **Don't read real user data in tests.** `tests/isolate.ts` redirects HOME,
   DSH_HOME and the adapter paths; keep it that way. The cold-start script uses a
   throwaway `COLD_ROOT` and never touches `~/.dsh`.

## Verification levels — say which one you reached

Every claim in a PR or issue should name its level, because "it works" means
different things:

| Level | Meaning |
|---|---|
| `UNIT_TESTED` | A test exercises the code with stubs |
| `INTEGRATION_TESTED` | A real `voyager` core was called over the bridge |
| `LIVE_VERIFIED` | A real DSH host loaded the plugin and answered a tool call |
| `NOT_VERIFIED` | Written down, not exercised |
| `BLOCKED` | Cannot be exercised here; say why |

A real-model run (an agent choosing the tool on its own) is **not** required for
a normal PR. The maintainer covers that, because it spends credentials. If your
change is about tool *selection*, say so and we will design the check together.

## Submitting a change

1. Comment on the issue you intend to take (or open one with the template).
   Low-risk fixes — typos, docs, an added test — can go straight to a PR.
2. Branch from `main` in your fork. Do not push to `main` here.
3. Open a **draft** PR early if you want direction; it does not have to be done.
4. Make CI green. `cold-start.yml` runs on `ubuntu-latest`; a PR from a fork
   needs a maintainer to approve the first run (that is GitHub's rule, not a
   judgement on your code).
5. In the description, include: what was broken, how you reproduced it, what
   you changed, the verification level, and anything you deliberately did not
   touch.

CI covers the plugin logic and the install path. It does **not** cover Windows
or a real DSH model run; if your change is platform-specific, say what you ran
locally.

## Commit style

Short imperative subject, then a body that explains *why* — what was wrong, what
you measured, what you chose not to do. Reference the issue. If you changed a
test's expectation, say why the old expectation was wrong; that is a legitimate
change, but it needs the reason.

## License

By contributing you agree your work is licensed under the repository's LICENSE.
