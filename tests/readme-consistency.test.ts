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
// The newest published tag/Release, not the version being prepared. On a
// candidate tree package.json is ahead of this; the pre-tag patch flips
// both install pins and this constant together with the version bump.
const PUBLISHED_RELEASE = '1.3.0';

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

test('both READMEs name the published release, not the candidate version', () => {
  assert.equal(currentRelease(en, /\*\*Current release\*\*/), PUBLISHED_RELEASE);
  assert.equal(currentRelease(zh, /\*\*当前版本\*\*/), PUBLISHED_RELEASE);
  if (pkg.version !== PUBLISHED_RELEASE) {
    const v = pkg.version.split('.').map(Number);
    const p = PUBLISHED_RELEASE.split('.').map(Number);
    assert.ok(
      v[0] > p[0] || (v[0] === p[0] && (v[1] > p[1] || (v[1] === p[1] && v[2] > p[2]))),
      'the candidate version must be newer than the published release');
  }
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
  // Core v1.5.0 is the released stable tag this plugin version (1.3.0) was
  // tested against; the seventh tool needs its `evidence_verify` op, so the
  // install examples must pin it, not an older tag or a moving branch.
  assert.deepEqual([...pins].sort(), ['1.5.0']);
});

test('the header names the published plugin release, not an untagged candidate', () => {
  const published = currentRelease(en, /\*\*Current release\*\*/);
  assert.equal(published, PUBLISHED_RELEASE);
  assert.equal(currentRelease(zh, /\*\*当前版本\*\*/), published);
  if (pkg.version !== published) {
    for (const s of [en, zh]) {
      assert.ok(!s.includes(`releases/tag/v${pkg.version}`),
        'an untagged candidate must not be linked as a released tag');
    }
  }
});

test('plugin install commands pin the published tag or an explicit developer ref', () => {
  // A bare `github:owner/repo` resolves to main HEAD (verified with pnpm 11.22.0),
  // which can carry unreleased code behind an old version field. User-facing
  // install commands must carry an explicit #ref: the published release pin,
  // or #main inside a clearly-labelled developer row. Verification rows that
  // record what CI actually ran are excluded (they are evidence, not advice).
  const published = currentRelease(en, /\*\*Current release\*\*/);
  for (const s of [en, zh]) {
    const advice = lines(s).filter(l => !/VERIFIED|已验证/.test(l)).join('\n');
    const commands = [...advice.matchAll(/dsh plugin[^\n`]*add github:HarryHeYu\/dsh-sessionflow([^\s`]*)/g)]
      .map(m => m[1]);
    assert.ok(commands.length >= 4, 'README must contain user-facing plugin install commands');
    const pins = commands.filter(c => c.startsWith('#v'));
    assert.ok(pins.length >= 3, 'at least three install commands must pin a version tag');
    for (const pin of pins) {
      assert.equal(pin, `#v${published}`,
        'user-facing plugin install must pin the published release tag');
    }
    for (const c of commands) {
      assert.ok(c === `#v${published}` || c === '#main',
        `bare or unknown ref in install command: ${c || '(none)'}`);
    }
    if (pkg.version !== published) {
      assert.ok(!commands.includes(`#v${pkg.version}`),
        'an untagged candidate must not be offered as an installable tag');
    }
  }
});
