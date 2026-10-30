# Pull request

## Summary

<!-- What changes, and why? One or two sentences. -->

## Test evidence

<!-- Real numbers from `npm test`, not "tests pass". -->

- `npm test`: <!-- e.g. 54 tests, 0 fail -->
- `uv run ruff check .`: <!-- n/a for TS-only changes -->

## Platform impact

<!-- Which channels/platforms does this affect? Cold-start matrix rows touched? -->

- [ ] Windows
- [ ] Linux/macOS
- [ ] Cold-start matrix rows added or updated (with the DSH version named)

## Constraint self-check

<!-- The six engineering constraints live in AGENTS.md. -->

- [ ] Peer ranges name prerelease lines explicitly (no bare `^x.y.z-rc.n` against a moving line)
- [ ] The bridge still spawns argv arrays only; no shell strings
- [ ] No second implementation of core behavior in the plugin
- [ ] Every failure is a typed, actionable error (no bare stacks surfaced to the model)
- [ ] Tests do not write into the developer's real profile
- [ ] A guard that cannot run fails loudly instead of skipping
