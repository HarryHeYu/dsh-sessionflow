/**
 * Cold-start smoke test — the checks a new user's first install depends on.
 *
 * Offline: it never calls a model and never needs credentials.  It drives the
 * plugin's own bridge, so a failure tells you which layer is at fault:
 *
 *   plugin  -> resolveVoyager / assertCompatible / the six registrations
 *   core    -> the real `voyager` on PATH, if there is one
 *   host    -> whether the module loads at all under this Node
 *
 * It deliberately does not read the user's HOME, any DSH profile, or any real
 * session data: the only paths it uses are created under the OS temp dir and
 * removed afterwards, with SESSIONFLOW_TEST_TMPDIR to relocate them off C:.
 */

// FIRST: redirect HOME/USERPROFILE/APPDATA/LOCALAPPDATA at a throwaway dir
// before anything spawns a child that would read them.  See tests/isolate.ts.
import './isolate.ts';

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..');
const BRIDGE = path.join(REPO, 'lib', 'bridge.js');

/** A temp dir that is not on C: when the caller says so, and always cleaned. */
function tmpRoot() {
  const base = process.env['SESSIONFLOW_TEST_TMPDIR'] || os.tmpdir();
  const dir = fs.mkdtempSync(path.join(base, 'sf-cold-'));
  process.on('exit', () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  });
  return dir;
}

test('the built plugin loads and exports the six tools', async () => {
  assert.ok(fs.existsSync(BRIDGE), 'lib/bridge.js is missing — run `npm run build`');
  const mod = await import(new URL('file://' + BRIDGE).href);
  for (const fn of ['resolveVoyager', 'integrationInfo', 'assertCompatible']) {
    assert.equal(typeof mod[fn], 'function', `bridge.js does not export ${fn}`);
  }

  const index = await import(new URL('file://' + path.join(REPO, 'lib', 'index.js')).href);
  const expected = ['searchTool', 'recentTool', 'sessionTool', 'currentWorkTool',
                    'continueTool', 'mergeTool'];
  for (const name of expected) {
    assert.equal(typeof index[name], 'function', `index.js does not export ${name}`);
  }
  assert.deepEqual(index.inject, ['tools']);
  assert.equal(index.name, 'dsh-sessionflow');
});

test('every tool carries a distinct sessionflow_ name and a description', async () => {
  const bridge = await import(new URL('file://' + BRIDGE).href);
  void bridge;
  const index = await import(new URL('file://' + path.join(REPO, 'lib', 'index.js')).href);

  // The factories take bridge options; an empty object is enough to inspect
  // the registered definition without calling the core.
  const names = [];
  for (const key of ['searchTool', 'recentTool', 'sessionTool', 'currentWorkTool',
                     'continueTool', 'mergeTool']) {
    const tool = index[key]({});
    assert.equal(typeof tool.name, 'string', `${key} has no name`);
    assert.ok(tool.name.startsWith('sessionflow_'),
      `${key} is named ${tool.name}, expected a sessionflow_ prefix`);
    assert.ok(typeof tool.description === 'string' && tool.description.length > 40,
      `${key} has no usable description`);
    assert.ok(tool.parameters && typeof tool.parameters === 'object',
      `${key} declares no parameters`);
    names.push(tool.name);
  }
  assert.equal(new Set(names).size, 6, `duplicate tool names: ${names.join(', ')}`);
});

/** What a user is shown: describeError() joins message and detail. */
function shown(e: { message: string; detail?: string }): string {
  return e.detail ? `${e.message}\n${e.detail}` : e.message;
}

test('a missing core is reported as VOYAGER_NOT_FOUND, pointing at the repo', async () => {
  const mod = await import(new URL('file://' + BRIDGE).href);
  const saved = process.env['PATH'];
  const savedBin = process.env['VOYAGER_BIN'];
  const savedPy = process.env['VOYAGER_PYTHON'];
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  // The candidate list falls back to bare `voyager` / `py` / `python` on PATH,
  // so an empty PATH is the only way to isolate every source at once.  Nothing
  // is *configured* here on purpose: a configured `voyagerBin` that fails is a
  // different, stricter error (see bridge.test.ts).
  process.env['PATH'] = tmpRoot();
  mod.resetBridgeCache?.();
  try {
    await assert.rejects(
      () => mod.resolveVoyager({
        python: path.join(tmpRoot(), 'nope-python.exe'),
      }),
      (e) => {
        assert.equal(e.code, 'VOYAGER_NOT_FOUND', `unexpected code: ${e.code}`);
        assert.match(shown(e), /github\.com\/HarryHeYu\/sessionFlow/,
          'the install hint must point at the sessionFlow repository');
        assert.doesNotMatch(shown(e), /pipx/i,
          'the hint must not suggest pipx: PyPI\'s `voyager` is another project');
        return true;
      },
    );
  } finally {
    if (saved !== undefined) process.env['PATH'] = saved;
    if (savedBin !== undefined) process.env['VOYAGER_BIN'] = savedBin;
    if (savedPy !== undefined) process.env['VOYAGER_PYTHON'] = savedPy;
    mod.resetBridgeCache?.();
  }
});

test('an older core is reported as INCOMPATIBLE with an update hint', async () => {
  const mod = await import(new URL('file://' + BRIDGE).href);
  assert.throws(
    () => mod.assertCompatible({ schema_version: 0 }),
    (e) => {
      assert.equal(e.code, 'INCOMPATIBLE');
      // The message names the real problem; the detail must carry the install
      // command, and it must be the pinned non-editable one rather than the
      // developer's `git pull && pip install -e .`.
      assert.match(e.message, /bridge schema 0/);
      assert.match(e.detail ?? '', /voyager\[all\] @ git\+/,
        'the update hint must give the pinned install command');
      assert.doesNotMatch(e.detail ?? '', /pip install -e/,
        'the update hint must not point at an editable developer install');
      return true;
    },
  );
});

test('a present core answers integration-info with a compatible schema', async (t) => {
  const mod = await import(new URL('file://' + BRIDGE).href);
  let cmd;
  try {
    cmd = await mod.resolveVoyager({});
  } catch {
    // No core on this machine: that is a host gap, not a plugin failure, and
    // the previous test already covers the message.  Say so rather than pass
    // silently.
    t.skip('no voyager core on PATH — core-side check not exercised here');
    return;
  }
  assert.ok(cmd && cmd.command, 'resolveVoyager returned no command');
  const info = await mod.integrationInfo({});
  assert.equal(typeof info.schema_version, 'number',
    'integration-info did not report a schema_version');
  mod.assertCompatible(info);
});

test('the plugin never builds a shell string', () => {
  // A guard, not a behaviour test: the security claim in the README is that
  // arguments go to spawn as an argv array.  If someone reaches for
  // `shell: true` or string concatenation, fail loudly.
  const src = fs.readFileSync(path.join(REPO, 'src', 'bridge.ts'), 'utf8');
  assert.doesNotMatch(src, /shell:\s*true/, 'bridge.ts must not use shell: true');
  assert.doesNotMatch(src, /\bexec\(/, 'bridge.ts must not use exec()');
  void spawn;
});

// --- the two failure modes that must not be confused -------------------------

/** A regex matching the pinned, non-editable install command. */
const PINNED_INSTALL = /voyager\[all\] @ git\+/;

test('an installed-but-too-old core is NOT reported as "not installed"', async () => {
  // The defect this pins.  Every candidate failure used to collapse into
  // VOYAGER_NOT_FOUND, so a user with a working-but-old core was told nothing
  // was installed and sent to reinstall what they already have.  The binary
  // exists and answers here, so the resolver must say "found but unusable".
  const mod = await import(new URL('file://' + BRIDGE).href);
  const node = process.execPath;                       // a real executable
  const fixture = path.join(REPO, 'tests', 'fixtures', 'stub-oldcore.mjs');

  mod.resetBridgeCache();
  try {
    await assert.rejects(
      () => mod.resolveVoyager({
        // A configured core is the strictest path: no PATH fallback at all.
        voyagerBin: node,
        voyagerArgs: [fixture],
        python: path.join(tmpRoot(), 'nope-python.exe'),
      }),
      (e) => {
        assert.equal(e.code, 'INCOMPATIBLE',
          `an installed core must not be reported as ${e.code}`);
        assert.match(e.message, /bridge schema 0/,
          'the message must name the schema the old core reports');
        assert.match(e.detail ?? '', PINNED_INSTALL,
          'the fix must describe the pinned, non-editable install');
        return true;
      },
    );

    // The same options through a real op also fail loudly: integrationInfo
    // resolves the command first, so it inherits the refusal.
    await assert.rejects(
      () => mod.integrationInfo({ voyagerBin: node, voyagerArgs: [fixture] }),
      (e) => {
        assert.equal(e.code, 'INCOMPATIBLE');
        return true;
      },
    );
  } finally {
    mod.resetBridgeCache();
  }
});

test('the missing-core hint gives the pinned install, never an editable one', async () => {  const mod = await import(new URL('file://' + BRIDGE).href);
  const saved = process.env['PATH'];
  delete process.env['VOYAGER_BIN'];
  delete process.env['VOYAGER_PYTHON'];
  process.env['PATH'] = tmpRoot();
  mod.resetBridgeCache();
  try {
    await assert.rejects(
      () => mod.resolveVoyager({ python: path.join(tmpRoot(), 'nope-python.exe') }),
      (e) => {
        assert.equal(e.code, 'VOYAGER_NOT_FOUND');
        assert.match(shown(e), PINNED_INSTALL,
          'the hint must pin the core to a ref so a reinstall is reproducible');
        assert.doesNotMatch(shown(e), /pip install -e/,
          'an editable install is a developer path; users must not be told to use it');
        return true;
      },
    );
  } finally {
    if (saved !== undefined) process.env['PATH'] = saved;
    mod.resetBridgeCache();
  }
});

// --- the candidate-loop classification, tested directly ----------------------
// The PATH loop cannot carry a fake core on Windows without `shell: true` (which
// the bridge is not allowed to use), so the classification is exported and tested
// as a function.  Without this the loop's branch is only covered by a real
// install.

/** The resolver's own aggregation, reached without spawning anything. */
async function unresolvedCoreError(failures: Array<{
  ok: false; found: boolean; reason: string;
}>): Promise<Error & { code: string; detail?: string }> {
  const mod = await import(new URL('file://' + BRIDGE).href);
  return mod.unresolvableCoreError(failures) as never;
}

test('a refused core in the candidate loop is reported as a version problem', async () => {
  const absent = { ok: false as const, found: false, reason: 'no such file' };
  const tooOld = {
    ok: false as const, found: true,
    reason: '`voyager` reports bridge schema 0, but this plugin needs 1',
  };

  const onlyAbsent = await unresolvedCoreError([absent, absent]);
  assert.equal(onlyAbsent.code, 'VOYAGER_NOT_FOUND',
    'when nothing was found, "not installed" is the honest answer');

  const mixed = await unresolvedCoreError([absent, tooOld, absent]);
  assert.equal(mixed.code, 'INCOMPATIBLE',
    'a core that answered and was refused must not be reported as missing');
  assert.match(mixed.message, /bridge schema 0/,
    'the message must carry the reason the core was refused');
  assert.match(mixed.detail ?? '', PINNED_INSTALL,
    'the detail must carry the pinned install');
});

test('a core installed into an inactive venv is not told to reinstall', async () => {
  // The reproducible case: the documented install command is `python -m pip
  // install "voyager[all] @ git+…"`, which most users run inside a virtualenv.
  // The console script then lands in <venv>/Scripts (Windows) or <venv>/bin
  // (POSIX) -- not on PATH, and so is that venv's Python.  Every probe fails,
  // but the core *is* installed.  The old message named the install command
  // first, so the actionable reading was "install it again".
  const mod = await import(new URL('file://' + BRIDGE).href);
  const notOnPath = { ok: false, found: false, reason: `'voyager' is not on PATH` };
  const pythonAbsent = {
    ok: false, found: false,
    reason: `'python -m voyager.cli' could not be started or timed out: not found`,
  };

  const e = mod.unresolvableCoreError([notOnPath, notOnPath, pythonAbsent]);
  assert.equal(e.code, 'VOYAGER_NOT_FOUND');

  const detail = e.detail ?? '';
  // The venv/PATH cause must be named, with the env var that fixes it.
  assert.match(detail, /virtualenv/);
  assert.match(detail, /<venv>\/Scripts \(Windows\) or <venv>\/bin \(POSIX\)/,
    'the venv layout differs per platform and the message must say both');
  assert.match(detail, /VOYAGER_BIN=/,
    'the fix must name the override that points straight at the binary');
  assert.match(detail, /activate the venv/,
    'activating the venv is the other fix and must be offered');

  // The install command is still available -- but as the second cause, not the
  // first thing the user reads.
  assert.match(detail, /voyager\[all\] @ git\+/, 'the install hint is still there');
  assert.ok(detail.indexOf('virtualenv') < detail.indexOf('voyager[all]'),
    'the "installed but invisible" cause must come before the reinstall hint');
});
