/**
 * Guard: a provider-filtered `sessionflow_recent` must not under-return.
 *
 * The core's `overview` has no provider parameter (`api.py: overview(...)` takes
 * db/repo/hours/limit only), so `recent` filters the list itself — and the first
 * version of that filter asked the core for `limit * 4` rows and hoped the
 * wanted provider was at least a quarter of them.  When it is not, the tool
 * returned fewer rows than `limit` while the core had plenty more, and nothing
 * in the answer said so: an incomplete list that reads as a complete one.
 *
 * These tests drive the tool through the echo stub with a fabricated overview,
 * so "how many rows did we ask the core for" and "how many rows came back" can
 * be asserted independently of any real index.
 */

import './isolate.ts';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recentTool } from '../lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A stub that answers `overview` with a caller-supplied row set. */
function overviewStub(dir: string, rows: unknown[]): { voyagerBin: string; voyagerArgs: string[] } {
  const payload = join(dir, 'overview.json');
  writeFileSync(payload, JSON.stringify({
    stats: { sessions: rows.length, events: 0, by_provider: {} },
    threads: [],
    recent_sessions: rows,
  }));
  return {
    voyagerBin: process.execPath,
    voyagerArgs: [join(HERE, 'fixtures', 'stub-overview.mjs'), payload],
  };
}

function session(i: number, provider: string): Record<string, unknown> {
  return {
    id: `${provider}:${i}`, provider, native_session_id: String(i),
    title: `${provider} ${i}`, updated_at: 1_700_000_000 - i,
    last_user: 'x', message_count: 1, tool_count: 0, source_state: 'ok',
  };
}

async function runRecent(
  rows: unknown[],
  args: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; requested: Record<string, unknown> }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sessionflow-recent-'));
  const record = join(dir, 'calls.txt');
  writeFileSync(record, '');
  const previous = process.env['SESSIONFLOW_ECHO_FILE'];
  process.env['SESSIONFLOW_ECHO_FILE'] = record;
  try {
    const result = await recentTool(overviewStub(dir, rows) as never)
      .execute(args as never, {} as never) as Record<string, unknown>;
    const calls = readFileSync(record, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(calls.length, 1, 'recent should make exactly one core call');
    const idx = calls[0]!.indexOf('|');
    return { result, requested: JSON.parse(calls[0]!.slice(idx + 1)) as Record<string, unknown> };
  } finally {
    if (previous === undefined) delete process.env['SESSIONFLOW_ECHO_FILE'];
    else process.env['SESSIONFLOW_ECHO_FILE'] = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a rare provider still fills the requested page', async () => {
  // 190 claude rows, then 10 codex rows, and we want the codex ones.  The old
  // `limit * 4` window asked for 20 rows and saw zero codex; the answer was an
  // empty list indistinguishable from "no codex sessions exist".
  const rows = [
    ...Array.from({ length: 190 }, (_, i) => session(i, 'claude')),
    ...Array.from({ length: 10 }, (_, i) => session(1000 + i, 'codex')),
  ];
  const { result, requested } = await runRecent(rows, { provider: 'codex', limit: 5 });
  assert.equal((result.recent_sessions as unknown[]).length, 5,
    'all five codex rows must be found, not just those inside a small window');
  assert.ok((requested.limit as number) >= 10,
    `a filtered call needs a window wide enough to contain the rows; asked for ${requested.limit}`);
});

test('an unfiltered call asks for exactly its limit', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => session(i, 'claude'));
  const { requested } = await runRecent(rows, { limit: 7 });
  assert.equal(requested.limit, 7, 'no filter means no reason to widen the window');
});

test('a filtered call never asks the core for more than its own ceiling', async () => {
  const rows = Array.from({ length: 300 }, (_, i) => session(i, 'mixed'));
  const { requested } = await runRecent(rows, { provider: 'mixed', limit: 10 });
  assert.ok((requested.limit as number) <= 200,
    `the window must stay within the allowed ceiling, got ${requested.limit}`);
});

test('the result is capped at the requested limit even if more matched', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => session(i, 'codex'));
  const { result } = await runRecent(rows, { provider: 'codex', limit: 3 });
  assert.equal((result.recent_sessions as unknown[]).length, 3);
});

test('a truncated filtered answer says so', async () => {
  // 200 rows of one provider is the widest window the core will honour, so a
  // caller asking for 5 of them cannot tell whether more existed behind it.
  const rows = Array.from({ length: 200 }, (_, i) => session(i, 'codex'));
  const { result } = await runRecent(rows, { provider: 'codex', limit: 5 });
  assert.equal((result.recent_sessions as unknown[]).length, 5);
  assert.equal(result.truncated, true,
    'a window-limited answer must be marked, or it reads as complete');
});

test('a complete filtered answer is not marked truncated', async () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => session(i, 'claude')),
    ...Array.from({ length: 3 }, (_, i) => session(100 + i, 'codex')),
  ];
  const { result } = await runRecent(rows, { provider: 'codex', limit: 5 });
  assert.equal((result.recent_sessions as unknown[]).length, 3);
  assert.equal(result.truncated, undefined, 'nothing was cut, so nothing should say so');
});

test('a provider sitting entirely BEHIND the window is marked, not returned empty', async () => {
  // The case the first version of this signal could not see, and the reason the
  // stub below now honours `limit`.
  //
  // 250 fresher `claude` rows fill the widest window the core will honour, and
  // the wanted `codex` rows are older than all of them.  The filter therefore
  // matches NOTHING and cuts nothing — but "0 codex rows" is exactly as
  // uninformed as a cut answer, because codex sessions do exist.  The old
  // predicate required `matched.length > limit`, so this returned an empty list
  // with no marker, indistinguishable from "there is no codex history".
  //
  // Measured against a real 255-session index before the fix: 0 rows,
  // `truncated` absent, while `sessions {platform:'codex'}` listed 5.
  const rows = [
    ...Array.from({ length: 250 }, (_, i) => session(i, 'claude')),
    ...Array.from({ length: 5 }, (_, i) => session(1000 + i, 'codex')),
  ];
  const { result } = await runRecent(rows, { provider: 'codex', limit: 5 });
  assert.equal((result.recent_sessions as unknown[]).length, 0,
    'the window genuinely does not reach them — the fix is the signal, not the rows');
  assert.equal(result.truncated, true,
    'an empty answer from a full window must say the window was full');
});

test('an unfiltered full page is not called truncated', async () => {
  // An unfiltered call asks for exactly `limit`, so getting `limit` rows back is
  // the answer itself; marking it would make every ordinary page look clipped.
  const rows = Array.from({ length: 30 }, (_, i) => session(i, 'claude'));
  const { result } = await runRecent(rows, { limit: 7 });
  assert.equal((result.recent_sessions as unknown[]).length, 7);
  assert.equal(result.truncated, undefined,
    'a page that was asked for in full is not truncated');
});
