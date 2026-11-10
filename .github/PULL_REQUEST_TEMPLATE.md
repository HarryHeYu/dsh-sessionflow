# Pull request

## Summary

<!-- What changes, and why? One or two sentences. -->

## Test evidence

<!-- Real numbers from `npm test`, not "tests pass". -->

- `npm test`: <!-- e.g. 60 tests, 0 fail -->
- `tsc --noEmit`: <!-- clean / errors -->
- Real core used for the integration part: <!-- `voyager --version`, or "stubs only" -->

## Verification level

<!-- Pick one. CONTRIBUTING.md explains the levels; a synthetic test is not a live run. -->

- [ ] `UNIT_TESTED` — stubs only
- [ ] `INTEGRATION_TESTED` — a real `voyager` core was called
- [ ] `LIVE_VERIFIED` — a real DSH host loaded the plugin and answered a tool call
- [ ] `NOT_VERIFIED` — written, not exercised (say why below)

## Platform impact

<!-- Which channels/platforms does this affect? Cold-start matrix rows touched? -->

- [ ] Windows
- [ ] Linux/macOS
- [ ] Cold-start matrix rows added or updated (with the DSH version named)

## Constraint self-check

<!-- The six engineering constraints live in CONTRIBUTING.md ("The rules that actually matter here"). -->

- [ ] Peer ranges name prerelease lines explicitly (no bare `^x.y.z-rc.n` against a moving line)
- [ ] The bridge still spawns argv arrays only; no shell strings
- [ ] No second implementation of core behavior in the plugin
- [ ] Every failure is a typed, actionable error (no bare stacks surfaced to the model)
- [ ] Tests do not write into the developer's real profile
- [ ] A guard that cannot run fails loudly instead of skipping

## What I did not touch

<!-- Optional but useful: related code you deliberately left alone, and why. -->
