// The peer ranges must actually admit the harness builds users run.
//
// This is the check that was missing when the plugin was submitted to the
// community list.  `@deepseek-ai/dsh-tools` was pinned to `^0.1.5-rc.3`, which
// node-semver matches against exactly **one** of the 34 published versions --
// the one it was written against.  Everything else, including both current
// dist-tags, was excluded, so a user installing on a current harness got an
// ERESOLVE they had to work around by hand.  `@deepseek-ai/cordis` was pinned to
// an exact `4.0.2` while the host declares `~4.0.4`, which fails the same way.
//
// The trap is specific: node-semver only lets a prerelease version satisfy a
// range if some comparator in that range shares its exact major.minor.patch
// tuple *and* itself carries a prerelease tag.  So a range like `^0.1.5-rc.3`
// looks like "0.1.5-rc.3 and later within 0.1.x" but is really "only the 0.1.5
// tuple" -- `0.1.7-rc.2` does not match it, and neither does `*`.
//
// WHAT THESE TESTS DO AND DO NOT CLAIM
// ------------------------------------
// They check *resolution*: that a package manager will not refuse the install.
// They say nothing about whether the plugin runs correctly on that harness --
// that is the cold-start job's business (scripts/cold-start.sh), and the
// distinction is kept deliberately.  A range that resolves is not a promise
// that the code works; it is a promise that the user is not blocked before
// they can find out.
//
// Everything asserted here is offline: the harness versions below are pinned in
// this file, so the gate does not depend on the registry being reachable or on
// a dist-tag not moving.  The live registry cross-check lives in
// scripts/check-peer-range-live.mjs and is deliberately NOT part of `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

/**
 * The harness builds we declare compatibility with, pinned deliberately.
 *
 * `cordis` is the version *that host itself* declares, because a host and its
 * cordis move together.  `status` records how far the verification actually
 * went, and is the honest answer to "can you say this works?":
 *
 *   SUPPORTED            installed, loaded and reached a core (cold-start.sh)
 *   RESOLUTION_VERIFIED  pnpm --strict-peer-dependencies resolved it cleanly
 *   UNVERIFIED           asserted by nothing; do not add one
 *
 * Adding a row is a claim.  Add it only with the evidence named in `status`.
 */
const HOSTS = [
  // CI pins this; scripts/cold-start.sh installs, loads and calls a tool.
  { version: '0.1.5-rc.3', cordis: '4.0.2', status: 'SUPPORTED' },
  // Resolution-verified only: installs cleanly, runtime not exercised.
  { version: '0.1.7-rc.2', cordis: '4.0.4', status: 'RESOLUTION_VERIFIED' },
  // current `next` dist-tag: cold-start.sh passes end to end on it, and the
  // installed bridge answered a real `search` against a synthetic index.
  { version: '0.2.0-rc.2', cordis: '4.0.4', status: 'SUPPORTED' },
  // current `alpha` dist-tag.  Excluding it is what broke installs for anyone
  // on alpha, so it is admitted; the same cold-start + tool call was run on it.
  { version: '0.2.1-alpha.4', cordis: '4.0.5-alpha.2', status: 'SUPPORTED' },
];

/** semver, loaded the ESM way.  A dev dependency: nothing ships it to users. */
function semver() {
  try {
    return createRequire(import.meta.url)('semver');
  } catch {
    return null;
  }
}

test('the dsh-tools peer range admits every harness build we declare', (t) => {
  const sem = semver();
  if (!sem) {
    // A real skip, not a quiet return: a test that returns early is reported as
    // a PASS by node --test, and an unverified guard reading as green is exactly
    // how this rot survived.  (The first version of this file made that mistake
    // and the mutation check caught it.)
    t.skip('semver unavailable; peer range NOT verified');
    return;
  }
  const range = pkg.peerDependencies['@deepseek-ai/dsh-tools'];
  assert.ok(range, 'dsh-tools must be a peer dependency');

  const missing = HOSTS.filter((h) => !sem.satisfies(h.version, range))
    .map((h) => h.version);
  assert.deepEqual(missing, [], (
    `the peer range does not admit ${missing.join(', ')} -- a user on that ` +
    `harness gets ERESOLVE before the plugin ever loads.  Range: ${range}`));

  // The regression itself, stated directly: the old range admitted exactly one
  // published version.  Any range that narrow must fail here.
  const OLD = '^0.1.5-rc.3';
  const oldAdmits = HOSTS.filter((h) => sem.satisfies(h.version, OLD)).length;
  assert.ok(oldAdmits < HOSTS.length, (
    'sanity: the old range must fail this test, or the test is not guarding'));
});

test('the dsh-tools peer range does not over-claim', (t) => {
  const sem = semver();
  if (!sem) {
    t.skip('semver unavailable; upper bound NOT verified');
    return;
  }
  const range = pkg.peerDependencies['@deepseek-ai/dsh-tools'];

  // Nothing above 0.2.x has been built or run against, so the range must not
  // reach into it.  Admitting 0.3.0 would be a claim we cannot support.
  assert.ok(!sem.satisfies('0.3.0', range),
    'the range must not claim compatibility with an untested 0.3.x line');
  assert.ok(!sem.satisfies('1.0.0', range),
    'the range must not claim the next major');

  // And it must not reach backwards into harness builds older than the one we
  // first ran, which we have no evidence for.
  assert.ok(!sem.satisfies('0.1.0-rc.1', range),
    'the range must not claim 0.1.0 prereleases, which predate this plugin');
  assert.ok(!sem.satisfies('0.0.1-rc.1', range),
    'the range must not claim the stale 0.0.1 line');
});

test('the cordis peer range admits the cordis each harness build declares', (t) => {
  const sem = semver();
  if (!sem) {
    t.skip('semver unavailable; cordis range NOT verified');
    return;
  }
  const range = pkg.peerDependencies['@deepseek-ai/cordis'];
  assert.ok(range, 'cordis must be a peer dependency');

  for (const host of HOSTS) {
    assert.ok(sem.satisfies(host.cordis, range), (
      `harness ${host.version} declares cordis ${host.cordis}, but our range ` +
      `(${range}) excludes it -- the install fails on that host`));
  }

  // The version we build and test against must stay allowed...
  assert.ok(sem.satisfies('4.0.2', range),
    'the cordis we build against must still be allowed');
  // ...and the next major must not be claimed.
  assert.ok(!sem.satisfies('5.0.0', range), 'must not claim the next major');
});

test('peer and dev declarations stay in step', () => {
  // The host resolves the runtime copy, so the peer range is the authority; dev
  // is what CI builds against.  They are allowed to differ in range but both
  // must exist, or `npm ci` and the install path disagree.
  for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools']) {
    assert.ok(pkg.peerDependencies?.[name], `${name} missing from peerDependencies`);
    assert.ok(pkg.devDependencies?.[name], `${name} missing from devDependencies`);
  }
});
