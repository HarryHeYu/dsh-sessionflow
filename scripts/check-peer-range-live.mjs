#!/usr/bin/env node
// Live cross-check of the peer ranges against what is actually published.
//
// This is deliberately NOT part of `npm test`.  `npm test` must be reproducible
// offline and must not go red because a dist-tag moved or the registry was
// briefly unreachable; the pinned host list in tests/peer-range.test.ts is the
// blocking gate.  This script answers the other question -- "has the world moved
// since we pinned that list?" -- and is meant to be read by a human, or run as a
// non-blocking CI step (continue-on-error: true).
//
// Exit status: 0 when every current dist-tag is admitted and the range is
// neither absurdly narrow nor over-reaching; 1 otherwise, or when the registry
// cannot be reached.  Callers that must not be blocked should ignore it.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const semver = createRequire(import.meta.url)('semver');

// execSync, not execFileSync: on Windows `npm` is `npm.cmd`, and Node refuses to
// spawn a .cmd without a shell, so execFileSync('npm', ...) throws ENOENT there.
// That is not a theoretical concern -- the first version of the test this script
// replaces used execFileSync and therefore never once reached the registry on
// Windows, silently degrading to a pass.  A guard that cannot run is worse than
// no guard, because it reads as green.
function npmView(spec, field) {
  try {
    const out = execSync(`npm view ${spec} ${field} --json`, {
      encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const HOST_PKG = '@deepseek-ai/dsh-tools';
const CORDIS_PKG = '@deepseek-ai/cordis';

const dshRange = pkg.peerDependencies[HOST_PKG];
const cordisRange = pkg.peerDependencies[CORDIS_PKG];

let failed = false;
const line = (s) => process.stdout.write(s + '\n');

line(`dsh-tools peer range: ${dshRange}`);
line(`cordis    peer range: ${cordisRange}`);
line('');

const tags = npmView(HOST_PKG, 'dist-tags');
if (!tags) {
  line('registry unreachable -- live check NOT performed (this is not a failure');
  line('of the plugin; the offline gate in npm test is the authority).');
  process.exit(1);
}

line('dist-tags:');
for (const [tag, version] of Object.entries(tags)) {
  const ok = semver.satisfies(version, dshRange);
  line(`  ${tag.padEnd(8)} ${version.padEnd(16)} admitted: ${ok}`);
  if (!ok) {
    line(`      ^ a user on the '${tag}' channel cannot install the plugin`);
    // `latest` is stale at 0.0.1-rc.1 upstream; that predates this plugin and is
    // not something we can or should claim.  Only the actively-developed
    // channels are treated as blocking.
    if (tag === 'next' || tag === 'alpha') failed = true;
  }
}
line('');

const versions = npmView(HOST_PKG, 'versions') || [];
const admitted = versions.filter((v) => semver.satisfies(v, dshRange));
line(`coverage: ${admitted.length} of ${versions.length} published versions admitted`);
if (admitted.length < 5) {
  line('  ^ that is the shape of the bug this range exists to avoid');
  failed = true;
}
line(`  admitted: ${admitted.join(', ') || '(none)'}`);
line('');

const cordisVersions = npmView(CORDIS_PKG, 'versions') || [];
const cordisAdmitted = cordisVersions.filter((v) => semver.satisfies(v, cordisRange));
line(`cordis coverage: ${cordisAdmitted.length} of ${cordisVersions.length} admitted`);
line('');

line(failed ? 'RESULT: FAIL -- a current channel is not installable'
            : 'RESULT: OK -- every current channel is installable');
process.exit(failed ? 1 : 0);
