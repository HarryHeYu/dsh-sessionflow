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
// A stale peer range is invisible until someone tries to install, so it is
// pinned here against the real published version lists.  Offline, the test
// skips with a reason rather than passing quietly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

/** The harness channels a user can actually be on, from `npm dist-tags`. */
const REQUIRED_HARNESS = ['0.2.0-rc.2', '0.2.1-alpha.4', '0.1.5-rc.3'];

/** semver, loaded the ESM way.  A dev dependency: nothing ships it to users. */
function semver() {
  try {
    return createRequire(import.meta.url)('semver');
  } catch {
    return null;
  }
}

function publishedVersions(pkgName) {
  try {
    const out = execFileSync('npm', ['view', pkgName, 'versions', '--json'], {
      encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

test('the dsh-tools peer range admits the harness builds users are on', (t) => {
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

  // This part needs no registry, so it always runs.
  const missing = REQUIRED_HARNESS.filter((v) => !sem.satisfies(v, range));
  assert.deepEqual(missing, [], (
    `the peer range does not admit ${missing.join(', ')} -- a user on that ` +
    `harness gets ERESOLVE.  Range: ${range}`));

  // and it must not claim the whole world
  assert.ok(!sem.satisfies('0.3.0', range),
    'the range must not claim compatibility with an untested 0.3.x line');

  // The regression shape: a range matching almost nothing.  This one wants the
  // published list, so it degrades to a skip rather than a silent pass.
  const versions = publishedVersions('@deepseek-ai/dsh-tools');
  if (!versions) {
    t.diagnostic('npm registry unreachable; version-count check not run');
    return;
  }
  const satisfied = versions.filter((v) => sem.satisfies(v, range));
  assert.ok(satisfied.length >= 5, (
    `the peer range matches only ${satisfied.length} of ${versions.length} ` +
    `published versions, which is the shape of the bug this test exists for`));
});

test('the cordis peer range is compatible with what the host declares', (t) => {
  const sem = semver();
  if (!sem) {
    t.skip('semver unavailable; cordis range NOT verified');
    return;
  }
  const range = pkg.peerDependencies['@deepseek-ai/cordis'];
  assert.ok(range, 'cordis must be a peer dependency');

  // dsh-tools@0.2.0-rc.2 declares `~4.0.4`; a user on that host has 4.0.4.
  // An exact pin like `4.0.2` cannot coexist with it.
  assert.ok(sem.satisfies('4.0.4', range),
    `the host declares cordis ~4.0.4, but our range (${range}) excludes it`);
  assert.ok(sem.satisfies('4.0.2', range),
    'the version we build and test against must still be allowed');
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
