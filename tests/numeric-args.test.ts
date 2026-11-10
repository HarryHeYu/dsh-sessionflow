/**
 * Guard: a numeric argument that the core would misinterpret must never reach
 * the core.
 *
 * Three distinct failures motivate this file, all measured on voyager 1.3.0
 * against a real index (94 sessions / 526,991 events).
 *
 * The core applies `limit` differently per op, so the two ops are listed
 * separately rather than as one "the core rejects it" claim — that claim is
 * false for `search` and was in this header before the behavior was measured
 * op by op:
 *
 *  `search` (api.py:254, `int(limit or 20)`):
 *  1. `limit: -2` -> count 33,277, 480,826 bytes of JSON.  `LIMIT -2` removes
 *     the cap rather than applying one, so a stray minus sign is an unbounded
 *     read into the model's own context.
 *  2. `limit: 3.7` -> 3 rows.  `int()` TRUNCATES it.  No error, no warning; the
 *     caller just gets fewer hits than it asked for, which looks complete.
 *  3. `limit: 0` -> 20 rows.  `limit or 20` treats 0 as absent, so asking for
 *     nothing means asking for the default.
 *
 *  `overview` (api.py:77/:94, raw slice — no `int()`, so none of the above):
 *  4. `limit: 3.7` -> `slice indices must be integers or None or have an
 *     __index__ method`, an error naming no argument.
 *  5. `limit: 0` -> 0 rows (`candidates[:0]`), NOT the default page.
 *  6. `limit: -3` -> 91 of 94 rows: Python's negative slice drops the newest
 *     three rather than meaning "all" or "none".
 *
 * Both ops are therefore validated here, ahead of the spawn, but for different
 * reasons: on `search` an out-of-range value is silently reinterpreted, and on
 * `overview` a fractional one is an opaque crash.
 *
 * The tools must refuse or clamp BEFORE spawning a child, and the refusal must
 * be identifiable as a parameter problem rather than folded into the generic
 * error every core failure produces.
 */

import './isolate.ts';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recentTool, searchTool } from '../lib/index.js';
import { ParameterError, intArg, numArg } from '../lib/tools/common.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * An echo core whose calls are recorded to a file.
 *
 * "Refused" has to mean *nothing was spawned*, not merely "an error came back":
 * a core that was reached and then rejected the value would still have spent a
 * child process and a database open on a call the tool could have refused.  The
 * assertion below is therefore on the RECORD being empty.
 */
async function callsDuring(
  run: () => Promise<unknown>,
): Promise<Array<[string, unknown]>> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sessionflow-num-'));
  const record = join(dir, 'calls.txt');
  writeFileSync(record, '');
  const previous = process.env['SESSIONFLOW_ECHO_FILE'];
  process.env['SESSIONFLOW_ECHO_FILE'] = record;
  try {
    try {
      await run();
    } catch {
      // the refusal is the subject; what it SENT is what we assert on
    }
    const text = readFileSync(record, 'utf8');
    return text.split('\n').filter((l) => l.trim().length > 0).map((l) => {
      const idx = l.indexOf('|');
      return [l.slice(0, idx), JSON.parse(l.slice(idx + 1))] as [string, unknown];
    });
  } finally {
    if (previous === undefined) delete process.env['SESSIONFLOW_ECHO_FILE'];
    else process.env['SESSIONFLOW_ECHO_FILE'] = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

function echoBridge() {
  return {
    voyagerBin: process.execPath,
    voyagerArgs: [join(HERE, 'fixtures', 'stub-echo.mjs')],
  };
}

/** Run a tool that must refuse, and prove the core was never asked. */
async function expectRefused(
  run: (bridge: never) => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  let error: Error | undefined;
  const calls = await callsDuring(async () => {
    try {
      await run(echoBridge() as never);
    } catch (e) {
      error = e as Error;
      throw e;
    }
  });
  assert.ok(error, 'the call should have been refused');
  assert.match(error.message, pattern);
  assert.deepEqual(calls, [], 'a refused argument must not reach the core');
}

test('search refuses a negative limit instead of reading the whole index', async () => {
  await expectRefused(
    (b) => searchTool(b).execute({ query: 'x', limit: -2 }, {} as never),
    /`limit`.*whole number of hits/);
});

test('search refuses a fractional limit rather than letting SQLite complain', async () => {
  await expectRefused(
    (b) => searchTool(b).execute({ query: 'x', limit: 3.7 }, {} as never),
    /whole number/);
});

test('search refuses limit 0 rather than silently asking for the default', async () => {
  await expectRefused(
    (b) => searchTool(b).execute({ query: 'x', limit: 0 }, {} as never),
    /`limit`/);
});

test('recent refuses a negative limit rather than uncapping the overview', async () => {
  await expectRefused(
    (b) => recentTool(b).execute({ limit: -3 }, {} as never),
    /`limit`.*whole number of rows/);
});

test('recent refuses a negative hours window, which silently empties the result', async () => {
  await expectRefused(
    (b) => recentTool(b).execute({ hours: -5 }, {} as never),
    /`hours`/);
});

test('recent refuses a non-numeric hours value', async () => {
  // This one is decided by the HOST, not by the tool: `defineTool` compiles the
  // property spec into JSON Schema, so `"hours": "yesterday"` is rejected with
  // `invalid arguments: "hours" must be a number` before `execute` runs — and
  // no child is spawned either way.
  //
  // That asymmetry is the whole reason this file exists: the host validates
  // the *type*, and a type check cannot see `-2`.  A negative limit, a zero
  // limit and a fractional limit are all well-typed numbers, so every one of
  // them used to reach SQLite intact.  Range is the plugin's job.
  await expectRefused(
    (b) => recentTool(b).execute({ hours: 'yesterday' as never }, {} as never),
    /"hours" must be a number/);
});

// --- the boundaries themselves: clamping must not become rejecting ----------

test('intArg clamps above the ceiling instead of failing the call', () => {
  const b = { min: 1, max: 200, fallback: 20, what: 'rows' };
  assert.equal(intArg('limit', 500, b), 200, 'over the ceiling clamps to it');
  assert.equal(intArg('limit', 200, b), 200, 'the ceiling itself is accepted');
  assert.equal(intArg('limit', 1, b), 1, 'the floor itself is accepted');
  assert.equal(intArg('limit', undefined, b), 20, 'absent takes the fallback');
});

test('intArg rejects rather than clamps below the floor', () => {
  const b = { min: 1, max: 200, fallback: 20, what: 'rows' };
  for (const bad of [0, -1, -2, 0.5, 2.5, Number.NaN, Infinity]) {
    assert.throws(() => intArg('limit', bad, b), ParameterError,
      `${String(bad)} must be refused`);
  }
});

test('numArg admits a fractional window, which is meaningful for hours', () => {
  const b = { min: 0, max: 1000, fallback: 48, what: 'hours' };
  assert.equal(numArg('hours', 12.5, b), 12.5, 'half an hour is a real window');
  assert.equal(numArg('hours', 0, b), 0, 'zero is a legitimate "right now"');
  assert.equal(numArg('hours', 5000, b), 1000, 'over the ceiling clamps');
  assert.throws(() => numArg('hours', -1, b), ParameterError);
});

test('a refusal names the argument and the accepted range', () => {
  assert.throws(
    () => intArg('limit', -2, { min: 1, max: 200, fallback: 20, what: 'a whole number of hits' }),
    (e: Error) => e instanceof ParameterError
      && /`limit`/.test(e.message)
      && /1\.\.200/.test(e.message)
      && /-2/.test(e.message));
});
