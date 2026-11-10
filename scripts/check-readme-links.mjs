#!/usr/bin/env node
// Optional ONLINE check: do the release links/tags in both READMEs exist?
//
// Deliberately NOT part of `npm test`. The offline gate is
// tests/readme-consistency.test.ts (both languages agree, pins are fixed).
// This script answers the other question -- "are those remote facts true?" --
// and is meant for a release gate or a human. A network read on every test run
// is a flake source, and a blocked network must not read as a green check.
//
// Exit: 0 all verified; 1 something is broken; 2 could not determine (offline).
// Callers that must not be blocked should treat 2 as "unknown", never as pass.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['README.md', 'README.zh-CN.md'];

function gh(args) {
  // `gh` is a native Windows binary; spawnSync with a shell is not needed here
  // (unlike npm.cmd), and capture is done by us rather than a bash pipe.
  return spawnSync('gh', args, { encoding: 'utf8', timeout: 30_000 });
}

function tagExists(repo, tag) {
  const r = gh(['api', `repos/${repo}/git/ref/tags/${tag}`, '--jq', '.ref']);
  if (r.error) return null;                    // gh missing / could not spawn
  if (r.status === 0 && r.stdout.trim() === `refs/tags/${tag}`) return true;
  // A 404 from the API is "tag absent". Anything else (auth, rate limit, or a
  // bad invocation that prints usage text) is UNKNOWN — treating our own CLI
  // mistake as "the tag does not exist" would be a false failure.
  if (r.status !== 0 && /HTTP 404|Not Found/i.test(r.stderr || '')) return false;
  return null;
}

const problems = [];
let unknown = 0;

for (const file of FILES) {
  const text = readFileSync(join(REPO, file), 'utf8');

  // Every "releases/tag/vX.Y.Z" link in either README must name a real tag.
  const tags = new Set([...text.matchAll(/releases\/tag\/(v\d+\.\d+\.\d+)/g)]
    .map(m => m[1]));
  // Install pins reference the CORE repo, not this one.
  const corePins = new Set([...text.matchAll(/sessionFlow\.git@(v\d+\.\d+\.\d+)/g)]
    .map(m => m[1]));

  for (const [tag, repo] of [
    ...[...tags].map(t => [t, 'HarryHeYu/dsh-sessionflow']),
    ...[...corePins].map(t => [t, 'HarryHeYu/sessionFlow']),
  ]) {
    const state = tagExists(repo, tag);
    if (state === null) {
      unknown++;
      console.log(`UNKNOWN  ${file}: ${repo} ${tag} — could not query GitHub`);
    } else if (!state) {
      problems.push(`${file}: ${repo} tag ${tag} does not exist`);
    } else {
      console.log(`OK       ${file}: ${repo} ${tag}`);
    }
  }
}

if (unknown) {
  console.log(`\n${unknown} fact(s) unverifiable — NOT a pass (exit 2)`);
  process.exit(2);
}
if (problems.length) {
  for (const p of problems) console.error('FAIL    ', p);
  process.exit(1);
}
console.log('\nall release links resolve to real tags');
