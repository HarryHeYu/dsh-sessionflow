// The roadmap must not describe already-shipped cross-repo work as blocked.
//
// Core v1.5.0 and plugin v1.3.0 are released. A roadmap that still says the
// seventh tool is "not implemented" sends contributors to redo closed work and
// hides the fact that the bridge schema never changed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const roadmap = readFileSync(join(REPO, 'ROADMAP.md'), 'utf8');

function findLine(pattern: RegExp): string {
  const line = roadmap.split(/\r?\n/).find(l => pattern.test(l));
  assert.ok(line, `ROADMAP.md is missing a line matching ${pattern}`);
  return line;
}

test('the roadmap names the released seven-tool pairing', () => {
  assert.match(roadmap, /seven `sessionflow_\*` tools/);
  const pairing = findLine(/Current pairing — Core `v1\.5\.0` × Plugin `v1\.3\.0`/);
  assert.match(pairing, /\*\*RELEASED\*\*/);
  assert.match(pairing, /seven tools/i);
  assert.match(pairing, /bridge schema 1/);
});

test('delivered evidence-verify work is not described as blocked', () => {
  const line = findLine(/^\| `sessionflow_evidence_verify`/);
  assert.match(line, /RELEASED in v1\.3\.0/);
  assert.match(line, /Core #22 and Plugin #9 closed/);

  const stale = [
    /\*\*not implemented\*\*/,
    /blocked on \[Core #22\]/i,
    /the two still-open DSH findings/i,
    /#9[^\n]*stays open/i,
  ];
  for (const claim of stale) {
    assert.ok(!claim.test(roadmap), `stale roadmap claim is back: ${claim}`);
  }
});

test('the roadmap records merged OpenCode and WorkBuddy providers', () => {
  const openCode = findLine(/^\| OpenCode adapter/);
  assert.match(openCode, /\*\*MERGED\*\*/);
  assert.match(openCode, /UNIT_VERIFIED/);

  const workbuddy = findLine(/^\| WorkBuddy adapter/);
  assert.match(workbuddy, /tenth provider/);
  assert.match(workbuddy, /UNIT_VERIFIED/);
});

test('the roadmap does not present the v1.3.1 era as current', () => {
  assert.ok(
    !/Core v1\.3\.1 release[^\n]*\|[^\n]*current/i.test(roadmap),
    'Core v1.3.1 is history; the current release is Core v1.5.0');
});
