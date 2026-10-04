/**
 * dsh-sessionflow — bridge contract tests.
 *
 * Two layers:
 *
 *  * **mechanics** — resolution, timeouts, malformed JSON, non-zero exits, and
 *    the compatibility gate, proven against stub executables so they are
 *    hermetic and fast;
 *  * **integration** — the real JSON round-trip against the installed
 *    sessionFlow core, read-only, using queries that are deterministic on any
 *    index (a gibberish term, a gibberish repo).
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Temporary indexes are created under the OS temp dir and removed on exit:
// a test suite must not leave scratch behind, least of all on a drive it does
// not own.  Set SESSIONFLOW_TEST_TMPDIR to redirect them.
const createdTmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(process.env['SESSIONFLOW_TEST_TMPDIR'] ?? tmpdir(), prefix));
  createdTmpDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of createdTmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort: a leftover temp dir must never fail the suite
    }
  }
});

import {
  VoyagerError,
  assertCompatible,
  callOp,
  integrationInfo,
  resetBridgeCache,
  resolveVoyager,
  runJson,
  type BridgeOptions,
} from '../lib/bridge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

/** A stub core run through the Node binary, so no shell wrapper is needed. */
function stub(name: string, extra: BridgeOptions = {}): BridgeOptions {
  return {
    voyagerBin: process.execPath,
    voyagerArgs: [join(FIXTURES, name)],
    ...extra,
  };
}

// --- mechanics --------------------------------------------------------------

test('a missing core is reported with an actionable message', async () => {
  const saved = process.env['PATH'];
  process.env['PATH'] = '';
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  resetBridgeCache();
  try {
    await assert.rejects(
      () => resolveVoyager({ voyagerBin: 'C:/nope/voyager.exe', python: 'C:/nope/python.exe' }),
      (e: unknown) =>
        e instanceof VoyagerError &&
        e.code === 'VOYAGER_NOT_FOUND' &&
        /pipx install voyager/.test(e.message),
    );
  } finally {
    if (saved !== undefined) process.env['PATH'] = saved;
    resetBridgeCache();
  }
});

test('non-JSON output becomes a BAD_JSON error, not a parse crash', async () => {
  resetBridgeCache();
  await assert.rejects(
    () => callOp('search', { query: 'x' }, stub('stub-badjson.mjs')),
    (e: unknown) => e instanceof VoyagerError && e.code === 'BAD_JSON',
  );
});

test('a hanging op hits the deadline and becomes TIMEOUT', async () => {
  resetBridgeCache();
  await assert.rejects(
    () => callOp('search', { query: 'x' }, stub('stub-hang.mjs', { timeoutMs: 800 })),
    (e: unknown) => e instanceof VoyagerError && e.code === 'TIMEOUT',
  );
});

test('a non-zero exit becomes CLI_FAILED carrying the exit code', async () => {
  resetBridgeCache();
  await assert.rejects(
    () => runJson(['merge', 'x'], stub('stub-fail.mjs')),
    (e: unknown) =>
      e instanceof VoyagerError && e.code === 'CLI_FAILED' && /exit code 3/.test(e.message),
  );
});

test('the compatibility gate rejects an older bridge schema', () => {
  assert.throws(
    () => assertCompatible({
      name: 'sessionFlow', package: 'voyager', version: '0.0.1',
      schema_version: 0, ops: [], capabilities: [],
    }),
    (e: unknown) => e instanceof VoyagerError && e.code === 'INCOMPATIBLE',
  );
  assert.doesNotThrow(() => assertCompatible({
    name: 'sessionFlow', package: 'voyager', version: '9.9.9',
    schema_version: 1, ops: [], capabilities: [],
  }));
});

// --- integration against the installed core ---------------------------------

/**
 * A Python that can `import voyager`.  On a machine with several interpreters
 * only one has the package, so probe rather than assume.
 */
async function findPython(): Promise<string | null> {
  const candidates = [
    process.env['VOYAGER_PYTHON'],
    process.platform === 'win32' ? 'py' : undefined,
    'python',
    'python3',
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    try {
      await exec(c, ['-c', 'import voyager']);
      return c;
    } catch {
      // try the next interpreter
    }
  }
  return null;
}

const SEED = `
import sys
from pathlib import Path
from voyager.store import Store
from voyager.model import new_session, new_event
db = Path(sys.argv[1])
src = db.parent / "s.jsonl"
src.write_text("{}", encoding="utf-8")
st = Store(db)
s = new_session(id="codex:s1", provider="codex", native_session_id="s1",
                title="bridge demo", started_at=1000.0, updated_at=2000.0,
                cwd="E:/proj/demo", repo_root="E:/proj/demo", message_count=1,
                can_resume=True, resume_cmd="codex resume s1",
                metadata={}, raw_metadata={})
st.replace_session(s, [new_event(sid=s["id"], ts=1000.0, seq=0, kind="user",
                                 content="fix the evaluation pipeline")],
                   "codex", src)
tid = st.thread_create(repo_root="E:/proj/demo", title="bridge thread",
                       goal="finish the bridge")
st.thread_attach(tid, s["id"])
st.close()
print("seeded")
`;

const python = await findPython();
let seeded: string | null = null;
if (python) {
  const db = join(makeTmpDir('dsh-sessionflow-'), 'index.db');
  try {
    await exec(python, ['-c', SEED, db]);
    seeded = db;
  } catch {
    seeded = null;
  }
}

const integration = { skip: seeded === null ? 'no python with the voyager package' : false };

test('resolves the real core and reports its bridge schema', async () => {
  resetBridgeCache();
  const info = await integrationInfo();
  assert.ok(info.schema_version >= 1, 'schema_version is a number');
  assert.equal(info.package, 'voyager');
  for (const op of ['search', 'current_work', 'continue_context', 'integration_info']) {
    assert.ok(info.ops.includes(op), `core exposes ${op}`);
  }
});

test('runJson returns parsed JSON from a real subcommand', async () => {
  resetBridgeCache();
  const info = await runJson<{ schema_version: number }>(['integration-info']);
  assert.ok(info.schema_version >= 1);
});

test('search finds a seeded session and reports its excerpt', integration, async () => {
  resetBridgeCache();
  const r = await callOp<{ query: string; count: number; results: Array<{ id: string; excerpt: string }> }>(
    'search', { query: 'evaluation', db: seeded });
  assert.equal(r.count, 1);
  assert.equal(r.results[0]?.id, 'codex:s1');
  assert.match(r.results[0]?.excerpt ?? '', /evalua/);
});

test('search round-trips a CJK query without mangling it', integration, async () => {
  resetBridgeCache();
  const q = '这是绝对不存在的查询词zzz';
  const r = await callOp<{ query: string; count: number; results: unknown[] }>(
    'search', { query: q, db: seeded });
  assert.equal(r.query, q);
  assert.equal(r.count, 0);
  assert.deepEqual(r.results, []);
});

test('search honours a repo filter containing spaces', integration, async () => {
  resetBridgeCache();
  const r = await callOp<{ count: number; results: unknown[] }>(
    'search', { query: 'the', repo: 'C:/Program Files/no such repo', db: seeded });
  assert.equal(r.count, 0);
});

test('current_work returns the thread, members and a continuation', integration, async () => {
  resetBridgeCache();
  const r = await callOp<{
    has_thread: boolean; scope: string[];
    continuation?: { bundle?: string };
  }>('current_work', { repo: 'E:/proj/demo', db: seeded });
  assert.equal(r.has_thread, true);
  assert.deepEqual(r.scope, ['codex:s1']);
  assert.ok((r.continuation?.bundle ?? '').includes('evaluation'));
});

test('current_work for an unknown repo is empty, not an error', integration, async () => {
  resetBridgeCache();
  const r = await callOp<{ has_thread: boolean; scope: string[] }>(
    'current_work', { repo: 'Z:/definitely/not/a/repo/xyz', db: seeded });
  assert.equal(r.has_thread, false);
  assert.deepEqual(r.scope, []);
});

test('continue_context by session ref returns the compiled bundle', integration, async () => {
  resetBridgeCache();
  const r = await callOp<{ bundle?: string; scope?: string[]; error?: string }>(
    'continue_context', { session_refs: ['codex:s1'], db: seeded });
  assert.deepEqual(r.scope, ['codex:s1']);
  assert.ok((r.bundle ?? '').includes('evaluation'));
});

test('continue_context with no sessions is a clear error, not a crash', async () => {
  resetBridgeCache();
  const empty = join(makeTmpDir('dsh-sessionflow-empty-'), 'index.db');
  const r = await callOp<{ error?: string }>(
    'continue_context', { db: empty });
  assert.match(r.error ?? '', /no sessions/);
});
