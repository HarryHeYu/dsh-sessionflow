// The two READMEs describe the same release, in two languages.
//
// In 2026-11 the Chinese header still advertised v1.1.0 while the English one
// said v1.2.0, and the Chinese DSH-host table was missing both rows that 1.2.0
// had actually verified (`0.2.1-rc.5` / `0.2.2-alpha.2`). Nothing compared
// them, so a reader's answer depended on which language they opened.
//
// This test checks only what can be decided offline, from the files in this
// checkout. Whether a GitHub release/tag or a link actually exists is a remote
// fact: `scripts/check-readme-links.mjs` is the optional online check, and it
// is deliberately NOT part of `npm test` (a network read on every run is a
// flake source). The release-gate report records the online verification.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const en = readFileSync(join(REPO, 'README.md'), 'utf8');
const zh = readFileSync(join(REPO, 'README.zh-CN.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

/** Lines are CRLF in EN and LF in ZH; never let that leak into an assertion. */
function lines(s: string): string[] {
  return s.split(/\r?\n/);
}

/** DSH-host compatibility rows: "| 1.2.0 | `0.2.1-rc.5` ... |". */
function hostRows(s: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of lines(s)) {
    const m = /^\|\s*(\d+\.\d+\.\d+)\s*\|\s*`([^`]+)`/.exec(line);
    if (!m) continue;
    if (m[2].startsWith('v1.')) continue; // core pairing table, not DSH
    out.push([m[1], m[2].replace(/\s*\(`(?:next|alpha)`\)\s*/, '').trim()]);
  }
  return out;
}

function headerChannels(s: string): string[] {
  const line = lines(s).find(l => /DSH 0\./.test(l) &&
    (/Current release/.test(l) || /当前版本/.test(l)));
  assert.ok(line, 'header row with the DSH channel list must exist');
  return line.match(/\d+\.\d+\.\d+-(?:rc|alpha)\.\d+/g) ?? [];
}

function currentRelease(s: string, marker: RegExp): string {
  const line = lines(s).find(l => marker.test(l));
  assert.ok(line, 'current-release row must exist');
  const m = /releases\/tag\/v(\d+\.\d+\.\d+)/.exec(line);
  assert.ok(m, 'current-release row must link to a tag');
  return m[1];
}

test('both READMEs name the version in package.json', () => {
  assert.equal(currentRelease(en, /\*\*Current release\*\*/), pkg.version);
  assert.equal(currentRelease(zh, /\*\*当前版本\*\*/), pkg.version);
});

test('the DSH channel lists in the two headers agree', () => {
  assert.deepEqual(headerChannels(zh), headerChannels(en));
});

test('the DSH-host compatibility tables have the same rows', () => {
  const sort = (rows: [string, string][]) =>
    rows.map(r => r.join('/')).sort();
  assert.deepEqual(sort(hostRows(zh)), sort(hostRows(en)));
  // Guard against both tables being empty and passing vacuously.
  assert.ok(hostRows(en).length >= 6, 'expected the 4 + 2 verified rows');
});

test('both tables record the channels v1.2.0 verified', () => {
  for (const s of [en, zh]) {
    const rows = hostRows(s).filter(r => r[0] === '1.2.0');
    assert.deepEqual(rows.map(r => r[1]).sort(),
      ['0.2.1-rc.5', '0.2.2-alpha.2'],
      'release-v1.2.0.md and peer-range.test.ts both name these two');
  }
});

test('neither README claims native resume is verified', () => {
  // "NOT VERIFIED" / "尚未验证" are the honest statements; only a positive
  // claim is a problem. Strip negations before looking for one.
  for (const s of [en, zh]) {
    const stripped = s
      .replace(/NOT VERIFIED/gi, '')
      .replace(/not verified/gi, '')
      .replace(/尚未验证|尚未.{0,4}验证|未经验证/g, '');
    const positive = /(?:native resume|原生恢复|原生 resume)[^\n]{0,80}(?:verified|已验证|supported)/i;
    assert.ok(!positive.test(stripped), 'a positive live-resume claim would be false');
  }
});

test('install examples pin a version, not a moving branch', () => {
  const pins = new Set<string>();
  for (const s of [en, zh]) {
    for (const m of s.matchAll(/sessionFlow\.git@v(\d+\.\d+\.\d+)/g)) pins.add(m[1]);
  }
  assert.ok(pins.size > 0, 'at least one install example must pin a tag');
  // Core v1.3.1 is the released stable tag this plugin version (1.2.0) was
  // tested against; install examples must pin it, not a moving branch.
  assert.deepEqual([...pins].sort(), ['1.3.1']);
});
