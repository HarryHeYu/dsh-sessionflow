/**
 * Contract for `sessionflow_evidence_verify` (dsh-sessionflow#9 / Core #22).
 *
 * The Core's `evidence_verify` op returns `evidence.verify(...)` verbatim in
 * `result.status`. Four of the five verdicts (MISMATCH / NOT_FOUND /
 * UNVERIFIABLE / INVALID_REFERENCE) carry non-zero `exit_code` values 1..4, but
 * they are NORMAL results, not transport failures. `callOp()` reads a single
 * JSON line and returns `payload.result`, so this tool must hand that dict back
 * untouched — no second transport, no exit-code interpretation, no verdict
 * reinterpretation. `runJson()` would flatten those four into `CLI_FAILED`.
 *
 * Fixtures follow the real `voyager evidence verify --json` /
 * `voyager/api.py::evidence_verify` shape (see stub-evidence.mjs); no response
 * field is invented here.
 */

// FIRST: redirect HOME/USERPROFILE before anything spawns a child.
import './isolate.ts';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VoyagerError } from '../lib/bridge.js';
import { evidenceVerifyTool } from '../lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, 'fixtures', 'stub-evidence.mjs');

/**
 * The 12 keys a real `MATCH` verdict carries. Captured LIVE from the PUBLISHED
 * Core v1.5.0 wheel on 2026-11-14 (seeded `codex:s1`, `api.evidence_verify`),
 * not guessed: `reports/c1-phase2-execution.md` records the exact JSON.
 */
const REAL_MATCH_KEYS = [
  'digest', 'exit_code', 'found_digest', 'found_kind', 'found_summary',
  'message', 'seq', 'session', 'session_id', 'source_available',
  'source_stat', 'status',
];

/** The 8 keys of the nested `source_stat` dict (published v1.5.0 `_source_stat`). */
const REAL_SOURCE_STAT_KEYS = [
  'current_mtime', 'current_size', 'exists', 'mtime_matches', 'path',
  'recorded_mtime', 'recorded_size', 'size_matches',
];

/** A full real-Core session row (keys/types from the published wheel's `session`). */
const REAL_SESSION = {
  id: 'codex:s1', provider: 'codex', native_id: 's1', title: 'c1 real shape',
  started_at: 1000.0, updated_at: 2000.0, cwd: 'E:/proj/demo',
  repo_root: 'E:/proj/demo', git_remote: null, git_branch: null,
  git_commit: null, model: null, message_count: 1, tool_count: 0,
  can_resume: 1, can_fork: 0, resume_cmd: 'codex resume s1',
  metadata_json: '{}', raw_metadata_json: '{}',
  source_state: 'ACTIVE_SOURCE', source_missing_since: null,
};

/** A real `source_stat` (values are a representative captured sample). */
const REAL_SOURCE_STAT = {
  recorded_mtime: 1794667932.6553776, recorded_size: 2,
  current_mtime: 1794667932.6553776, current_size: 2,
  path: 'E:/proj/demo/s.jsonl', exists: true,
  mtime_matches: true, size_matches: true,
};

/**
 * Build the dict `voyager/evidence.py::verify()` actually returns, with the
 * REAL branch-dependent key sets from the published v1.5.0 core (NOT the old
 * 8-key subset):
 *   - MATCH / MISMATCH  -> 12 keys (base 8 + session, source_stat,
 *                         found_kind, found_summary)
 *   - UNVERIFIABLE      -> 10 keys (base 8 + session, source_stat)
 *   - NOT_FOUND / INVALID_REFERENCE -> base 8 only (early return)
 * Keys/types are copied from that function's `result` initialiser and branches;
 * `status`/`exit_code` come from `EXIT_CODES`. No field is invented.
 */
function verdict(status: string, over: Record<string, unknown> = {}) {
  const exitCode: Record<string, number> = {
    MATCH: 0, MISMATCH: 1, NOT_FOUND: 2, UNVERIFIABLE: 3, INVALID_REFERENCE: 4,
  };
  const base: Record<string, unknown> = {
    status,
    exit_code: exitCode[status],
    session_id: 'codex:m',
    seq: 3,
    digest: 'c71c180a',
    found_digest: 'c71c180a',
    source_available: true,
    message: 'the event at seq 3 is the one the reference named',
  };
  if (status === 'MATCH' || status === 'MISMATCH') {
    base['session'] = REAL_SESSION;
    base['source_stat'] = REAL_SOURCE_STAT;
    base['found_kind'] = 'user';
    base['found_summary'] = 'user: fix the evaluation pipeline';
  } else if (status === 'UNVERIFIABLE') {
    base['session'] = REAL_SESSION;
    base['source_stat'] = REAL_SOURCE_STAT;
  }
  return { ...base, ...over };
}

/** Run one tool call against the stub; return { calls, value, error }. */
async function runEvidence(
  scenario: unknown,
  args: Record<string, unknown>,
): Promise<{
  calls: string[];
  value: unknown;
  error: unknown;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'sf-evidence-'));
  const record = join(dir, 'calls.txt');
  const resultFile = join(dir, 'scenario.json');
  writeFileSync(record, '');
  writeFileSync(resultFile, JSON.stringify(scenario));
  const prevRec = process.env['SESSIONFLOW_EVIDENCE_RECORD'];
  const prevFile = process.env['SESSIONFLOW_EVIDENCE_RESULT_FILE'];
  const prevBin = process.env['VOYAGER_BIN'];
  process.env['SESSIONFLOW_EVIDENCE_RECORD'] = record;
  process.env['SESSIONFLOW_EVIDENCE_RESULT_FILE'] = resultFile;
  process.env['VOYAGER_BIN'] = process.execPath;
  const bridge = {
    voyagerBin: process.execPath,
    voyagerArgs: [STUB],
  };
  let value: unknown;
  let error: unknown;
  try {
    value = await evidenceVerifyTool(bridge).execute(args, {} as never);
  } catch (e) {
    error = e;
  } finally {
    for (const [k, v] of [['SESSIONFLOW_EVIDENCE_RECORD', prevRec],
                          ['SESSIONFLOW_EVIDENCE_RESULT_FILE', prevFile],
                          ['VOYAGER_BIN', prevBin]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const calls = readFileSync(record, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  rmSync(dir, { recursive: true, force: true });
  return { calls, value, error };
}

const GOOD = { session_id: 'codex:m', seq: 3, digest: 'c71c180a' };

test('all five verdicts are returned verbatim, BY NAME', async () => {
  for (const status of ['MATCH', 'MISMATCH', 'NOT_FOUND', 'UNVERIFIABLE',
                        'INVALID_REFERENCE']) {
    const scenario = verdict(status);
    const { value, error } = await runEvidence(scenario, GOOD);
    assert.equal(error, undefined, `${status} must not become a thrown failure`);
    assert.deepEqual(value, scenario,
      `${status}: the whole Core dict must be passed through unchanged`);
    assert.equal((value as { status: string }).status, status);
  }
});

// Finding C: assert the FULL real-Core 12-field response shape, not the old
// 8-key subset. If the published Core drops or renames any of the four extra
// keys on a found session, this goes RED — that is the point.
test('a MATCH verdict carries the full real-Core 12-key shape', async () => {
  const scenario = verdict('MATCH');
  const { value } = await runEvidence(scenario, GOOD);
  assert.deepEqual(Object.keys(value as object).sort(), [...REAL_MATCH_KEYS].sort(),
    'the 12 keys must match the published v1.5.0 wheel exactly');
  const v = value as {
    session: Record<string, unknown>; source_stat: Record<string, unknown>;
    found_kind: unknown; found_summary: unknown;
  };
  assert.deepEqual(Object.keys(v.session).sort(),
    Object.keys(REAL_SESSION).sort(), 'session is the full session row');
  assert.deepEqual(Object.keys(v.source_stat).sort(),
    [...REAL_SOURCE_STAT_KEYS].sort(), 'source_stat keeps its nested 8 keys');
  assert.equal(v.found_kind, 'user');
  assert.match(String(v.found_summary), /^user: /,
    'found_summary is a one-line "<kind>: <body>" summary');
});

test('a MISMATCH verdict also carries the full 12-key shape', async () => {
  const scenario = verdict('MISMATCH', { digest: '00000000' });
  const { value } = await runEvidence(scenario, GOOD);
  assert.deepEqual(Object.keys(value as object).sort(), [...REAL_MATCH_KEYS].sort());
});

test('UNVERIFIABLE keeps session + source_stat but no found_* keys (10 keys)', async () => {
  const scenario = verdict('UNVERIFIABLE', { digest: null });
  const { value } = await runEvidence(scenario, GOOD);
  const keys = Object.keys(value as object).sort();
  assert.deepEqual(keys,
    [...REAL_MATCH_KEYS].filter((k) => k !== 'found_kind' && k !== 'found_summary').sort(),
    'the no-digest branch adds session/source_stat but not found_*');
});

test('NOT_FOUND and INVALID_REFERENCE return early with the base 8 keys', async () => {
  for (const status of ['NOT_FOUND', 'INVALID_REFERENCE']) {
    const scenario = verdict(status, { digest: null, found_digest: null,
      source_available: null });
    const { value } = await runEvidence(scenario, GOOD);
    const keys = Object.keys(value as object).sort();
    assert.deepEqual(keys,
      [...REAL_MATCH_KEYS].filter((k) => !['session', 'source_stat',
        'found_kind', 'found_summary'].includes(k)).sort(),
      `${status}: early return keeps only the base 8`);
  }
});

test('the four non-zero verdicts are NOT flattened into CLI_FAILED', async () => {
  for (const [status, code] of [['MISMATCH', 1], ['NOT_FOUND', 2],
                                ['UNVERIFIABLE', 3], ['INVALID_REFERENCE', 4]] as const) {
    const { value, error } = await runEvidence(verdict(status), GOOD);
    assert.equal(error, undefined, `${status} (exit_code ${code}) is a normal result`);
    assert.equal((value as { exit_code: number }).exit_code, code);
    assert.equal((value as { status: string }).status, status);
  }
});

test('UNVERIFIABLE and INVALID_REFERENCE keep their distinct fields', async () => {
  const u = await runEvidence(
    verdict('UNVERIFIABLE', { digest: null, found_digest: 'c71c180a' }), GOOD);
  assert.equal((u.value as { digest: unknown }).digest, null);

  const i = await runEvidence(
    verdict('INVALID_REFERENCE', { digest: null, seq: 'three',
      message: 'sequence is not an integer' }), GOOD);
  assert.equal((i.value as { status: string }).status, 'INVALID_REFERENCE');
  assert.equal((i.value as { exit_code: number }).exit_code, 4);
});

test('MATCH is reference consistency, never a claim the assertion is true', async () => {
  // The tool's description is model-facing: it must not promise fact-checking.
  const tool = evidenceVerifyTool({});
  const text = (tool.description as string).toLowerCase();
  assert.ok(text.includes('does not mean') || text.includes('not mean'),
    'the description must state the MATCH caveat');
  assert.ok(text.includes('claim'), 'the caveat must name the claim');
  // And a MATCH result is returned unchanged — the tool adds no "true" verdict.
  const { value } = await runEvidence(verdict('MATCH'), GOOD);
  assert.equal((value as { status: string }).status, 'MATCH');
  assert.ok(!('claim_is_true' in (value as object)),
    'the plugin must not invent a fact-checking field');
});

test('the tool forwards exactly the evidence_verify op with the named params', async () => {
  const { calls } = await runEvidence(verdict('MATCH'), GOOD);
  const api = calls.filter((c) => c.startsWith('api:'));
  assert.equal(api.length, 1, 'exactly one bridge op call');
  const [op, params] = api[0]!.slice(4).split('|');
  assert.equal(op, 'evidence_verify');
  assert.deepEqual(JSON.parse(params!), {
    session_id: 'codex:m', seq: 3, digest: 'c71c180a',
  });
});

test('an older Core without the op yields a capability error, NOT a verdict', async () => {
  const err = "unknown op: 'evidence_verify' (ops: overview, search, ...)";
  const { value, error } = await runEvidence({ error: err }, GOOD);
  assert.equal(value, undefined, 'an OP_ERROR has no verdict result');
  assert.ok(error instanceof Error, 'callOp must surface a named error');
  // `guarded()` rethrows as a plain Error carrying `describeError`'s text.
  assert.match((error as Error).message, /unknown op/);
  assert.match((error as Error).message, /evidence_verify/);
  assert.doesNotMatch((error as Error).message, /NOT_FOUND|MATCH/,
    'a capability error must never be mistaken for an evidence verdict');
});

test('a malformed reference is refused BEFORE any child is spawned', async () => {
  // A ParameterError thrown outside guarded() stays a ParameterError, and the
  // spawn record must be EMPTY — not even the integration-info probe runs.
  for (const [label, args] of [
    ['empty session_id', { session_id: '', seq: 3, digest: 'c71c180a' }],
    ['blank session_id', { session_id: '   ', seq: 3 }],
    ['missing session_id', { seq: 3 }],
    ['missing seq', { session_id: 'codex:m', digest: 'c71c180a' }],
    ['bad digest', { session_id: 'codex:m', seq: 3, digest: 'zzzz' }],
    ['digest too long', { session_id: 'codex:m', seq: 3, digest: 'c71c180a1' }],
  ] as Array<[string, Record<string, unknown>]>) {
    const { calls, value, error } = await runEvidence(verdict('MATCH'), args);
    assert.equal(value, undefined, `${label}: nothing should be returned`);
    assert.ok(error instanceof Error, `${label}: must refuse with an error`);
    assert.match((error as Error).message, /session_id|seq|digest/,
      `${label}: the refusal must name the offending field`);
    assert.equal(calls.length, 0,
      `${label}: refuse before spawning (got ${JSON.stringify(calls)})`);
  }
});

test('a fractional seq is refused before spawning (int(3.7) would silently check seq 3)', async () => {
  // `type: 'number'` admits 3.7; the Core's `int(seq)` would truncate it to 3
  // and could even answer MATCH for a reference that named no such event. The
  // tool refuses it locally rather than fabricating a verdict about seq 3.
  const { calls, value, error } = await runEvidence(verdict('MATCH'),
    { session_id: 'codex:m', seq: 3.7, digest: 'c71c180a' });
  assert.equal(value, undefined);
  assert.ok(error instanceof Error);
  assert.match((error as Error).message, /seq/);
  assert.equal(calls.length, 0, 'no child may be spawned for a fractional seq');
});

test('the schema boundary itself requires a numeric seq (the real teeth)', () => {
  // `seq: { required: true, type: 'number' }` is enforced by defineTool before
  // execute() runs. This is why the tool needs NO second seq check: a missing
  // or non-numeric seq is refused by the compiled JSON Schema. Assert the
  // compiled schema so a future edit cannot quietly drop the guard.
  const params = evidenceVerifyTool({}).parameters as {
    required?: string[]; properties?: Record<string, { type?: string }>;
  };
  assert.ok(Array.isArray(params.required) && params.required.includes('seq'),
    'seq must be required at the schema boundary');
  assert.equal(params.properties?.['seq']?.type, 'number',
    'seq must be a number at the schema boundary');
  assert.ok(params.required!.includes('session_id'));
  assert.equal(params.properties?.['digest']?.type, 'string');
});

test('a valid reference without a digest still reaches the Core (UNVERIFIABLE path)', async () => {
  const { calls, value } = await runEvidence(
    verdict('UNVERIFIABLE', { digest: null }),
    { session_id: 'codex:m', seq: 3 });
  assert.equal((value as { status: string }).status, 'UNVERIFIABLE');
  const api = calls.filter((c) => c.startsWith('api:'));
  assert.equal(api.length, 1);
  assert.deepEqual(JSON.parse(api[0]!.slice(4).split('|')[1]!), {
    session_id: 'codex:m', seq: 3, digest: null,
  });
});

test('a leading-# digest is accepted and forwarded (Core rule)', async () => {
  const { calls, error } = await runEvidence(verdict('MATCH'),
    { session_id: 'codex:m', seq: 3, digest: '#C71C180A' });
  assert.equal(error, undefined);
  const api = calls.filter((c) => c.startsWith('api:'));
  assert.equal(api.length, 1);
  assert.equal(JSON.parse(api[0]!.slice(4).split('|')[1]!).digest, '#C71C180A');
});

// Keep the VoyagerError import load-bearing: an OP_ERROR is the bridge's typed
// capability error, distinct from a plain Error the tool refuses with.
test('the bridge distinguishes OP_ERROR from CLI_FAILED', () => {
  const op = new VoyagerError('OP_ERROR', 'unknown op');
  const cli = new VoyagerError('CLI_FAILED', 'exit 2');
  assert.equal(op.code, 'OP_ERROR');
  assert.notEqual(op.code, cli.code);
});
