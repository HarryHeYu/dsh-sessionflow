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
        assert.match(e.message, /github\.com\/HarryHeYu\/sessionFlow/,
          'the install hint must point at the sessionFlow repository');
        assert.doesNotMatch(e.message, /pipx/i,
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
      assert.match(e.message, /git pull|pip install -e/,
        'the update hint must describe the source install');
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
