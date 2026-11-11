/**
 * Guard: `sessionflow_merge` must build an argv the core's argparse can
 * actually parse, and must refuse an argv the OS cannot carry.
 *
 * Two defects motivate this file, both measured against the real `merge`
 * subparser (cli.py: `sessions` nargs="+", `--goal`, `--thread-title`,
 * `--budget`, `--json`):
 *
 * 1. **A value beginning with `-` was parsed as a flag.**  The tool emitted
 *    `--goal <value>`, and argparse reads `--goal` plus a following
 *    dash-prefixed token as "expected one argument" -> SystemExit.  So a goal
 *    of `--verbose` or `---` made the whole call fail with CLI_FAILED, an
 *    error that says nothing about which argument was at fault.  The `=` form
 *    (`--goal=--verbose`) has no such ambiguity.
 *
 * 2. **An over-long argument crashed the spawn, unnamed.**  Windows caps a
 *    command line at 32767 characters; Node raises `spawn ENAMETOOLONG`
 *    synchronously and the bridge reported it as
 *    `could not start '<node>': Error: spawn ENAMETOOLONG` — the argument that
 *    caused it is nowhere in the message, and on POSIX the analogous limit is
 *    `E2BIG`.  Measured in this repository: 33000 characters throws, 32500
 *    succeeds.
 *
 * There is also a trap in the fix itself, encoded in the ordering test below:
 * the shell-style `--` separator that makes a dash-leading *positional* safe
 * also swallows every later flag, so the `--json` the bridge appends has to go
 * BEFORE the separator.  Emitting it after was measured to yield
 * `sessions=['a:1', '--json'], json=False` — the core would then treat the
 * flag as a session id.
 */

import './isolate.ts';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeTool } from '../lib/index.js';
import { ParameterError, MAX_ARGV_CHARS, flagArg, argvLength } from '../lib/tools/common.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Record the argv the tool handed the core, exactly as the stub saw it. */
async function mergeArgv(args: Record<string, unknown>): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sessionflow-argv-'));
  const record = join(dir, 'calls.txt');
  writeFileSync(record, '');
  const previous = process.env['SESSIONFLOW_ECHO_FILE'];
  process.env['SESSIONFLOW_ECHO_FILE'] = record;
  try {
    const bridge = {
      voyagerBin: process.execPath,
      voyagerArgs: [join(HERE, 'fixtures', 'stub-echo.mjs')],
    };
    const result = await mergeTool(bridge as never).execute(args as never, {} as never);
    // The echo stub records `merge|<argv minus the trailing --json>`, and also
    // returns the argv it was given, which includes it.
    assert.ok(result, 'merge should have answered');
    return (result as { argv: string[] }).argv;
  } finally {
    if (previous === undefined) delete process.env['SESSIONFLOW_ECHO_FILE'];
    else process.env['SESSIONFLOW_ECHO_FILE'] = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Assert a call is refused without the core being spawned. */
async function expectRefused(
  args: Record<string, unknown>,
  pattern: RegExp,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sessionflow-argv-'));
  const record = join(dir, 'calls.txt');
  writeFileSync(record, '');
  const previous = process.env['SESSIONFLOW_ECHO_FILE'];
  process.env['SESSIONFLOW_ECHO_FILE'] = record;
  try {
    let error: Error | undefined;
    try {
      await mergeTool({
        voyagerBin: process.execPath,
        voyagerArgs: [join(HERE, 'fixtures', 'stub-echo.mjs')],
      } as never).execute(args as never, {} as never);
    } catch (e) {
      error = e as Error;
    }
    assert.ok(error, 'the call should have been refused');
    assert.match(error.message, pattern);
    assert.equal(readFileSync(record, 'utf8').trim(), '',
      'a refused argv must not reach the core');
  } finally {
    if (previous === undefined) delete process.env['SESSIONFLOW_ECHO_FILE'];
    else process.env['SESSIONFLOW_ECHO_FILE'] = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- the `=` form: a dash-leading value is data, not a flag -----------------

test('merge passes options as --name=value, so a dash-leading goal is not a flag', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: '--verbose' });
  assert.ok(argv.includes('--goal=--verbose'),
    `expected '--goal=--verbose' in ${JSON.stringify(argv)}`);
  assert.ok(!argv.includes('--goal'),
    'the space form would let argparse read --verbose as a flag');
});

test('merge survives a goal that is nothing but dashes', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: '---' });
  assert.ok(argv.includes('--goal=---'), JSON.stringify(argv));
});

test('merge keeps an ordinary goal readable in the equals form', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: 'fix the parser' });
  assert.ok(argv.includes('--goal=fix the parser'), JSON.stringify(argv));
});

test('merge keeps a goal containing a flag-looking token intact', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: 'fix --budget parsing' });
  assert.ok(argv.includes('--goal=fix --budget parsing'), JSON.stringify(argv));
});

test('merge does not mangle CJK or an embedded equals sign', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: '减少不稳定性', thread_title: 'k=v' });
  assert.ok(argv.includes('--goal=减少不稳定性'), JSON.stringify(argv));
  assert.ok(argv.includes('--thread-title=k=v'), JSON.stringify(argv));
});

// --- the separator ordering trap -------------------------------------------

test('--json precedes the -- separator, so the core does not read it as a session', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1', 'b:2'], goal: 'g' });
  const sep = argv.indexOf('--');
  assert.ok(sep !== -1, 'session ids should be protected by a separator');
  const jsonIdx = argv.indexOf('--json');
  assert.ok(jsonIdx !== -1, 'the identity flag must be present exactly once');
  assert.equal(argv.filter((a) => a === '--json').length, 1, 'no duplicate --json');
  assert.ok(jsonIdx < sep,
    `--json at ${jsonIdx} must come before the separator at ${sep}, ` +
    'otherwise argparse reads it as a positional session id');
});

test('session ids stay after the separator, in the order given', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1', 'b:2', 'c:3'] });
  const sep = argv.indexOf('--');
  assert.deepEqual(argv.slice(sep + 1), ['a:1', 'b:2', 'c:3']);
});

test('a dash-leading session id is passed as a positional, not a flag', async () => {
  const argv = await mergeArgv({ session_ids: ['-weird'] });
  const sep = argv.indexOf('--');
  assert.ok(sep !== -1, 'a dash-leading id needs the separator');
  assert.deepEqual(argv.slice(sep + 1), ['-weird']);
});

// --- over-long argv: refuse before the OS does, and name the culprit --------

test('merge refuses an over-long goal and names it, instead of surfacing ENAMETOOLONG', async () => {
  await expectRefused(
    { session_ids: ['a:1'], goal: 'g'.repeat(MAX_ARGV_CHARS) },
    /`goal`/);
});

test('merge refuses an over-long thread_title and names it', async () => {
  await expectRefused(
    { session_ids: ['a:1'], thread_title: 't'.repeat(MAX_ARGV_CHARS) },
    /`thread_title`/);
});

test('merge refuses a session list whose total argv exceeds the OS limit', async () => {
  await expectRefused(
    { session_ids: Array.from({ length: 400 }, () => 's'.repeat(200)) },
    /`session_ids`/);
});

test('merge refuses a single over-long session id and names it', async () => {
  await expectRefused(
    { session_ids: ['x'.repeat(MAX_ARGV_CHARS)] },
    /`session_ids`/);
});

test('a goal just under the ceiling is still accepted', async () => {
  const argv = await mergeArgv({ session_ids: ['a:1'], goal: 'g'.repeat(1000) });
  assert.ok(argv.some((a) => a.startsWith('--goal=')), JSON.stringify(argv).slice(0, 120));
});

// --- session_ids: a bad entry is refused, never quietly dropped -------------
//
// The whole merge is the unit of consent: the caller named a set of sessions and
// the WorkThread will contain exactly those.  Dropping an entry is therefore not
// leniency, it is a different operation performed on the caller's behalf without
// saying so — `['a:1', 42]` used to merge one session and report success.

test('merge refuses a non-string session id instead of merging the rest', async () => {
  await expectRefused({ session_ids: ['a:1', 42] }, /`session_ids\[1\]`.*must be text/);
});

test('merge refuses a null session id instead of skipping it', async () => {
  await expectRefused({ session_ids: ['a:1', null] }, /`session_ids\[1\]`.*must be text/);
});

test('merge refuses a whitespace-only session id', async () => {
  await expectRefused({ session_ids: ['a:1', '   '] }, /`session_ids\[1\]`.*blank/);
});

test('merge refuses an empty-string session id', async () => {
  await expectRefused({ session_ids: [''] }, /`session_ids\[0\]`/);
});

test('merge refuses session_ids that is not an array at all', async () => {
  // Decided by the HOST, not by the tool: `defineTool` compiles the parameter
  // spec into JSON Schema, so a bare string is rejected with
  // `invalid arguments: "session_ids" must be an array` before `execute` runs.
  // The tool keeps its own array check anyway — the schema is the host's
  // business, and a tool that trusts it would drop its guard the moment the
  // spec changed — but the observable refusal is the host's wording, so that is
  // what is asserted here.  Either way nothing is spawned.
  await expectRefused({ session_ids: 'a:1' }, /"session_ids" must be an array/);
});

test('a refusal names the offending index, so the caller can fix that one entry', async () => {
  // Index 2, not "one of your ids": the caller has to know WHICH entry to remove
  // when the other nine are perfectly good.
  let error: Error | undefined;
  try {
    await mergeTool({
      voyagerBin: process.execPath,
      voyagerArgs: [join(HERE, 'fixtures', 'stub-echo.mjs')],
    } as never).execute({ session_ids: ['a:1', 'b:2', 7] } as never, {} as never);
  } catch (e) {
    error = e as Error;
  }
  assert.ok(error, 'the call should have been refused');
  assert.match(error.message, /`session_ids\[2\]`/,
    `the message must name index 2; got: ${error.message}`);
});

test('every valid id still reaches the core in order', async () => {
  // The check must not become a filter: a list of good ids is passed through
  // whole, in the order given.
  const argv = await mergeArgv({ session_ids: ['a:1', 'b:2', 'c:3'] });
  const sep = argv.indexOf('--');
  assert.deepEqual(argv.slice(sep + 1), ['a:1', 'b:2', 'c:3']);
});

// --- the helpers themselves -------------------------------------------------

test('flagArg refuses a value carrying a newline or NUL', () => {
  for (const bad of ['a\nb', 'a\r\nb', 'a\u0000b']) {
    assert.throws(
      () => flagArg('goal', bad, { maxLength: 100 }),
      ParameterError,
      `${JSON.stringify(bad)} must be refused`);
  }
});

test('flagArg renders the equals form and keeps interior whitespace', () => {
  assert.equal(flagArg('goal', 'a  b', { maxLength: 100 }), '--goal=a  b');
  assert.equal(flagArg('goal', '  padded  ', { maxLength: 100 }), '--goal=  padded  ');
});

test('flagArg refuses rather than truncating an over-long value', () => {
  assert.throws(
    () => flagArg('goal', 'x'.repeat(101), { maxLength: 100 }),
    (e: Error) => e instanceof ParameterError && /too long/.test(e.message));
});

test('argvLength counts every argument the OS will have to carry', () => {
  assert.equal(argvLength(['ab', 'cde']), 5);
  assert.equal(argvLength([]), 0);
});
