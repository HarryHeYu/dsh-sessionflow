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
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Captured before the first `await` suspends this module.  The mechanics tests
// below empty `PATH` to prove that discovery fails, and a test body can run
// while this module's top-level `await` is suspended — so anything that needs
// to spawn an interpreter must pass this explicitly rather than read the
// ambient value later.  (Without it the integration suite below skipped on
// every machine, reporting "no python with the voyager package" for a python
// that was right there.)
const PATH_AT_LOAD = process.env['PATH'] ?? '';

/** Spawn with the PATH this module started with, whatever the tests have done. */
function execHermetic(file: string, args: string[]) {
  return exec(file, args, { env: { ...process.env, PATH: PATH_AT_LOAD } });
}

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

test('a missing core points at the source install, never at pipx', async () => {
  const saved = process.env['PATH'];
  process.env['PATH'] = '';
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  resetBridgeCache();
  try {
    await assert.rejects(
      () => resolveVoyager({ python: 'C:/nope/python.exe' }),
      (e: unknown) =>
        e instanceof VoyagerError &&
        e.code === 'VOYAGER_NOT_FOUND' &&
        // The message must point at the source install: the `voyager` name on
        // PyPI is an unrelated library, so a pipx hint would send the user to
        // the wrong project.
        /github\.com\/HarryHeYu\/sessionFlow/.test(e.message) &&
        !/pipx/.test(e.message),
    );
  } finally {
    if (saved !== undefined) process.env['PATH'] = saved;
    resetBridgeCache();
  }
});

test('a configured core that fails is named, and is not silently replaced', async () => {
  const saved = process.env['PATH'];
  process.env['PATH'] = '';
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  resetBridgeCache();
  const bin = process.execPath;
  const stub = join(FIXTURES, 'stub-nocore.mjs');
  try {
    await assert.rejects(
      () => resolveVoyager({ voyagerBin: bin, voyagerArgs: [stub] }),
      (e: unknown) =>
        e instanceof VoyagerError &&
        e.code === 'VOYAGER_NOT_FOUND' &&
        // Naming the operator's own command is the whole point: the generic
        // "not installed" text would send them looking for a core they already
        // configured.
        e.message.includes(bin) &&
        e.message.includes(stub) &&
        /does not work/.test(e.message) &&
        /exited 127/.test(e.message) &&
        /configured core does not work/.test(e.message) &&
        // ...and it must say that falling back is what it refused to do, so the
        // operator knows the choice was deliberate and how to opt back in.
        /Refusing to fall back/.test(e.detail ?? '') &&
        /voyagerBin/.test(e.detail ?? ''),
    );
  } finally {
    if (saved !== undefined) process.env['PATH'] = saved;
    resetBridgeCache();
  }
});

test('a PATH core is still used when nothing is configured', async () => {
  // The same broken command, reached the other way: unconfigured, the plugin
  // is free to discover the core, and the discovery failure is the generic
  // one.  This is the contrast that makes the test above meaningful.
  const saved = process.env['PATH'];
  process.env['PATH'] = '';
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  resetBridgeCache();
  try {
    await assert.rejects(
      () => resolveVoyager({ python: 'C:/nope/python.exe' }),
      (e: unknown) =>
        e instanceof VoyagerError &&
        e.code === 'VOYAGER_NOT_FOUND' &&
        !/Refusing to fall back/.test(e.detail ?? ''),
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

test('the deadline kills the child, not just the promise', async () => {
  resetBridgeCache();
  const marker = join(makeTmpDir('dsh-sessionflow-kill-'), 'marker.txt');
  writeFileSync(marker, '');
  process.env['SESSIONFLOW_TEST_MARKER'] = marker;
  try {
    // Generous deadline: interpreter startup alone can take a second, and the
    // point is that the child is KILLED, not that the timer is precise.
    await assert.rejects(
      () => callOp('search', { query: 'x' }, stub('stub-marker.mjs', { timeoutMs: 6000 })),
      (e: unknown) => e instanceof VoyagerError && e.code === 'TIMEOUT',
    );
    const atDeadline = statSync(marker).size;
    assert.ok(atDeadline > 0, 'the child never ran, so this test proved nothing');
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(statSync(marker).size, atDeadline,
      'the child kept writing after the deadline — it was not killed');
  } finally {
    delete process.env['SESSIONFLOW_TEST_MARKER'];
  }
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
      await execHermetic(c, ['-c', 'import voyager']);
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

/**
 * A second index for the six-tool contract: two sessions in one repo that are
 * not yet in any WorkThread (so `merge` has to create one), and two active
 * WorkThreads in another repo (so `current_work` has to report the ambiguity).
 * Timestamps are relative to now, because `recent` is a look-back window and
 * epoch-1970 fixtures would fall outside it.
 */
const SEED_TWO = `
import sys, time
from pathlib import Path
from voyager.store import Store
from voyager.model import new_session, new_event
db = Path(sys.argv[1])
src = db.parent / "s2.jsonl"
src.write_text("{}", encoding="utf-8")
st = Store(db)
now = time.time()

def put(sid, provider, repo, title, ts, text):
    s = new_session(id=sid, provider=provider, native_session_id=sid.split(":")[-1],
                    title=title, started_at=ts, updated_at=ts + 5,
                    cwd=repo, repo_root=repo, message_count=1, can_resume=True,
                    metadata={}, raw_metadata={})
    st.replace_session(s, [new_event(sid=sid, ts=ts, seq=0, kind="user",
                                     content=text)], provider, src)

put("codex:m1", "codex", "E:/proj/p93", "parser work", now - 4000,
    "implement the parser for the config file")
put("claude:m2", "claude", "E:/proj/p93", "parser review", now - 3000,
    "reviewed the parser: the boundary check is off by one")

for sid, provider, title, ts, text in (
        ("codex:a1", "codex", "Work A", now - 2000, "work on A"),
        ("claude:a2", "claude", "Work B", now - 1000, "work on B")):
    put(sid, provider, "E:/proj/ambig93", title, ts, text)
    tid = st.thread_create(repo_root="E:/proj/ambig93", title=title, goal=title)
    st.thread_attach(tid, sid)
    st.con.execute("UPDATE threads SET updated_at=? WHERE id=?", (ts, tid))
    st.con.commit()
st.close()
print("seeded")
`;

const python = await findPython();

// A test must not scan the machine it runs on.  The core's freshness step
// (`_ensure_fresh`) runs a real incremental scan of every provider's session
// directory, which on a developer's machine means reading their actual Codex
// and Claude history — slow, and not this suite's business.  `merge` is a
// subcommand, so it takes that path; `VOYAGER_NO_SYNC` is the documented switch
// for exactly this (CLI --help and cli.py both say "tests, offline
// inspection").  Production never sets it, so nothing here weakens what ships.
const hadNoSync = process.env['VOYAGER_NO_SYNC'];
process.env['VOYAGER_NO_SYNC'] = '1';
after(() => {
  if (hadNoSync === undefined) delete process.env['VOYAGER_NO_SYNC'];
  else process.env['VOYAGER_NO_SYNC'] = hadNoSync;
});
// The two ways this can fail mean different things, and one of them is a bug in
// the harness rather than a missing dependency: an interpreter that has the
// package but cannot seed the index must not be reported as "no python with the
// voyager package", or the integration tests skip silently forever.
let seedProblem = 'no python with the voyager package';

async function seedIndex(prefix: string, script: string): Promise<string | null> {
  if (!python) return null;
  const db = join(makeTmpDir(prefix), 'index.db');
  try {
    await execHermetic(python, ['-c', script, db]);
    return db;
  } catch (e) {
    const detail = (e as { stderr?: string; message?: string });
    seedProblem = `${python} has the package, but seeding the index failed: ` +
      String(detail.stderr || detail.message || e).trim().split('\n').slice(-1)[0];
    return null;
  }
}

const seeded = await seedIndex('dsh-sessionflow-', SEED);
const integration = { skip: seeded === null ? seedProblem : false };

/**
 * Point the bridge at one seeded index the way an operator would.
 *
 * `api` ops take a `db` parameter, but a CLI subcommand like `merge` does not —
 * the index rides in `voyagerArgs`, which is also what makes P8's "a configured
 * core is authoritative" rule matter here.
 */
function coreFor(db: string): BridgeOptions {
  return { voyagerBin: python ?? 'python',
           voyagerArgs: ['-m', 'voyager.cli', '--db', db] };
}

test('resolves the real core and reports its bridge schema', integration, async () => {
  resetBridgeCache();
  const info = await integrationInfo();
  assert.ok(info.schema_version >= 1, 'schema_version is a number');
  assert.equal(info.package, 'voyager');
  for (const op of ['search', 'current_work', 'continue_context', 'integration_info']) {
    assert.ok(info.ops.includes(op), `core exposes ${op}`);
  }
});

test('runJson returns parsed JSON from a real subcommand', integration, async () => {
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

test('continue_context with no sessions is a clear error, not a crash', integration, async () => {
  resetBridgeCache();
  const empty = join(makeTmpDir('dsh-sessionflow-empty-'), 'index.db');
  const r = await callOp<{ error?: string }>(
    'continue_context', { db: empty });
  assert.match(r.error ?? '', /no sessions/);
});

// --- P9.3: the remaining tool contracts, against a real core -----------------
//
// `search`, `current_work` and `continue_context` are covered above.  These
// close the gap on `recent`, `session` and `merge` — the last of which was
// asserted for argument forwarding but never actually run against a core.

const seededTwo = await seedIndex('dsh-sessionflow-two-', SEED_TWO);
const integrationTwo = { skip: seededTwo === null ? seedProblem : false };

test('recent returns the index overview for the repo', integrationTwo, async () => {
  resetBridgeCache();
  const ov = await callOp<{
    stats: { sessions: number; by_provider: Record<string, number> };
    recent_sessions: Array<{ id: string }>;
  }>('overview', { repo: 'E:/proj/p93', hours: 24, limit: 20, db: seededTwo });
  assert.equal(ov.stats.sessions, 4);
  assert.deepEqual(Object.keys(ov.stats.by_provider).sort(), ['claude', 'codex']);
  const ids = ov.recent_sessions.map((s) => s.id).sort();
  assert.deepEqual(ids, ['claude:m2', 'codex:m1']);
});

test('recent on a repo with no history is empty, not an error', integrationTwo, async () => {
  resetBridgeCache();
  const ov = await callOp<{ recent_sessions: unknown[] }>(
    'overview', { repo: 'Z:/nothing/here', hours: 24, limit: 20, db: seededTwo });
  assert.deepEqual(ov.recent_sessions, []);
});

test('session returns one session as a bundle', integrationTwo, async () => {
  resetBridgeCache();
  // `bundle_preview` answers with the compiled bundle; the scope it used is
  // echoed by `continue_context`, not here.
  const r = await callOp<{ bundle?: string; estimated_tokens?: number }>(
    'bundle_preview', { session_refs: ['codex:m1'], db: seededTwo });
  assert.ok((r.bundle ?? '').includes('parser'));
  assert.ok((r.estimated_tokens ?? 0) > 0);
});

test('session for an unknown id is a clear error, not a crash', integrationTwo, async () => {
  resetBridgeCache();
  const r = await callOp<{ error?: string; bundle?: string }>(
    'bundle_preview', { session_refs: ['codex:no-such-session-xyz'], db: seededTwo });
  assert.match(r.error ?? '', /session not found/);
  assert.equal(r.bundle, undefined);
});

test('merge is callable and synthesizes both sessions', integrationTwo, async () => {
  resetBridgeCache();
  const r = await runJson<{
    action: string; thread_id: string | null; context: string;
    member_count: number | null; error: string | null;
  }>(['merge', 'codex:m1', 'claude:m2',
      '--goal', 'finish the parser boundary check',
      '--thread-title', 'parser work'], coreFor(seededTwo));
  assert.equal(r.error, null);
  assert.equal(r.member_count, 2);
  assert.ok(r.thread_id, 'merge must persist a WorkThread');
  // both sources survive into the synthesized context, with provenance
  assert.ok(r.context.includes('codex:m1'), 'codex source missing');
  assert.ok(r.context.includes('claude:m2'), 'claude source missing');
  assert.ok(r.context.includes('off by one'), 'the review finding was dropped');
});

test('merge output is stable for the same input', integrationTwo, async () => {
  resetBridgeCache();
  const args = ['merge', 'codex:m1', 'claude:m2', '--goal', 'g', '--thread-title', 't'];
  const a = await runJson<{ context: string; thread_id: string | null }>(args, coreFor(seededTwo));
  const b = await runJson<{ context: string; thread_id: string | null }>(args, coreFor(seededTwo));
  assert.equal(a.thread_id, b.thread_id, 're-merging the same members must not fork a thread');
  assert.equal(a.context, b.context, 'the synthesized context must be deterministic');
});

test('merge rejects an unknown session instead of merging what it found', integrationTwo, async () => {
  resetBridgeCache();
  let failed = false;
  try {
    const r = await runJson<{ error?: string | null; member_count?: number | null }>(
      ['merge', 'codex:m1', 'codex:definitely-not-a-session'],
      coreFor(seededTwo));
    failed = Boolean(r.error) || r.member_count !== 2;
  } catch {
    failed = true;
  }
  assert.ok(failed, 'a merge naming a session that does not exist must not silently succeed');
});

test('current_work passes the ambiguity fields through', integrationTwo, async () => {
  resetBridgeCache();
  const r = await callOp<{
    thread_ambiguous?: boolean;
    thread_candidates?: Array<{ id: string; title: string }>;
    thread_default_reason?: string;
    thread?: { title: string };
  }>('current_work', { repo: 'E:/proj/ambig93', db: seededTwo });
  assert.equal(r.thread_ambiguous, true, 'two active threads must be reported as ambiguous');
  assert.deepEqual((r.thread_candidates ?? []).map((c) => c.title), ['Work B', 'Work A']);
  assert.equal(r.thread?.title, 'Work B', 'the default is the most recently active');
  assert.match(r.thread_default_reason ?? '', /not a choice/);
});

test('current_work stays quiet when a repo has exactly one thread', integrationTwo, async () => {
  resetBridgeCache();
  const r = await callOp<{ thread_ambiguous?: boolean; thread_candidates?: unknown[] }>(
    'current_work', { repo: 'E:/proj/p93', db: seededTwo });
  assert.equal(r.thread_ambiguous, undefined);
  assert.equal(r.thread_candidates, undefined);
});
