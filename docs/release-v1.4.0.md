# Release v1.4.0 — explicit repository and clearer bridge diagnostics

This is candidate release notes for the tree on branch `release/1.4.0-prep-r2`. It is
**not tagged, not published and not installable from a `v1.4.0` tag**. User-facing
install commands therefore remain pinned to the published `v1.3.0` tag.

## Added

- `sessionflow_merge` accepts an optional `repo`, forwarded to Core's additive
  `merge --repo`. It names `repo_root` only for a NEW WorkThread. With an older
  Core that lacks the flag, the call fails with a clear `INCOMPATIBLE` upgrade
  hint; the value is never silently dropped.
- Release-preparation notes for the Core 1.6.0 / Plugin 1.4.0 candidate pairing.

## Fixed

- The no-Core install hint now points at the released Core `v1.5.0` tag instead
  of an older compatibility-floor commit without `evidence_verify`.
- A Core that starts but answers the probe with bad JSON is reported as found
  but unusable (`INCOMPATIBLE`), not as `VOYAGER_NOT_FOUND`.
- A JSON answer paired with a non-zero process exit is rejected as `CLI_FAILED`
  instead of being accepted as an op result.

## Compatibility

- Bridge schema stays `1`; the seven-tool surface is unchanged. Store schema
  is owned by Core and unchanged.
- Plugin 1.4.0 works with Core v1.5.0 for all existing tools. The optional
  `repo` parameter requires a newer Core; an explicit `repo` against v1.5.0
  returns an actionable `INCOMPATIBLE` message and writes nothing.
- Candidate pairing: Core 1.6.0 with Plugin 1.4.0.

## Upgrade

Install the release tag when it exists. For this candidate, build from the
candidate source rather than installing a moving branch.

## Known limitations

- Real DSH host loading and model-driven natural-language tool selection are
  NOT VERIFIED without an authorized DSH model session.
- Native Resume remains NOT VERIFIED.
- Evidence `MATCH` means reference consistency, not factual truth.
