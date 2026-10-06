/**
 * Plugin load contract: `apply(ctx)` registers exactly the six sessionflow_*
 * tools, each with a model-facing description and a parameter schema.
 *
 * The tools are built with the real `defineTool`, so a malformed parameter
 * spec fails here rather than at boot; only the registry is stubbed, because a
 * real one needs a booted DSH tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

import {
  apply, inject, name,
  searchTool, recentTool, sessionTool, currentWorkTool, continueTool, mergeTool,
} from '../lib/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A stub core, so `apply()`'s startup compatibility probe never spawns the
 * real one — the test stays hermetic and fast instead of waiting on discovery.
 */
const STUB = {
  voyagerBin: process.execPath,
  voyagerArgs: [join(HERE, 'fixtures', 'stub-badjson.mjs')],
  timeoutMs: 3000,
};

interface RegisteredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function fakeContext(): { ctx: unknown; registered: RegisteredTool[] } {
  const registered: RegisteredTool[] = [];
  const ctx = {
    tools: {
      register(definition: RegisteredTool): () => void {
        registered.push(definition);
        return () => undefined;
      },
    },
    effect(body: () => () => void): () => void {
      return body();
    },
    logger: { warn: (): void => undefined, info: (): void => undefined },
  };
  return { ctx, registered };
}

test('the plugin declares its name and the tools service', () => {
  assert.equal(name, 'dsh-sessionflow');
  assert.deepEqual(inject, ['tools']);
});

test('apply registers exactly the six sessionflow_* tools', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, STUB);
  assert.deepEqual(registered.map((t) => t.name).sort(), [
    'sessionflow_continue',
    'sessionflow_current_work',
    'sessionflow_merge',
    'sessionflow_recent',
    'sessionflow_search',
    'sessionflow_session',
  ]);
});

test('every tool carries a description a model can act on', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, STUB);
  for (const t of registered) {
    assert.ok(t.description.length > 60, `${t.name}: description too thin`);
    assert.equal(typeof t.parameters, 'object', `${t.name}: parameters missing`);
  }
});

test('no tool uses a second naming scheme', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, STUB);
  assert.deepEqual(registered.filter((t) => !t.name.startsWith('sessionflow_')), []);
});

test('the required-argument tools really require one', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, STUB);
  // `defineTool` compiles the property spec into JSON Schema, so a required
  // argument shows up in the schema's `required` array.
  const required = (tool: string, param: string): boolean => {
    const t = registered.find((r) => r.name === tool);
    const schema = (t?.parameters ?? {}) as { required?: unknown };
    return Array.isArray(schema.required) && schema.required.includes(param);
  };
  assert.ok(required('sessionflow_search', 'query'));
  assert.ok(required('sessionflow_session', 'session_id'));
  assert.ok(required('sessionflow_merge', 'session_ids'));
});

// --- wire-up: does each tool forward the op the core actually implements? ----

function echoBridge() {
  return {
    voyagerBin: process.execPath,
    voyagerArgs: [join(HERE, 'fixtures', 'stub-echo.mjs')],
    timeoutMs: 5000,
  };
}

/** Run a tool against the echo stub and return the calls it actually made. */
async function recordedCalls(
  run: (bridge: never) => Promise<unknown>,
): Promise<Array<[string, unknown]>> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sessionflow-echo-'));
  const record = join(dir, 'calls.txt');
  writeFileSync(record, '');
  const previous = process.env['SESSIONFLOW_ECHO_FILE'];
  process.env['SESSIONFLOW_ECHO_FILE'] = record;
  try {
    try {
      await run(echoBridge() as never);
    } catch {
      // the tool's post-processing may not accept the stub's shape; we only
      // care about what it SENT, which is already recorded
    }
    return readFileSync(record, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        const idx = l.indexOf('|');
        return [l.slice(0, idx), JSON.parse(l.slice(idx + 1))] as [string, unknown];
      });
  } finally {
    if (previous === undefined) delete process.env['SESSIONFLOW_ECHO_FILE'];
    else process.env['SESSIONFLOW_ECHO_FILE'] = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('each tool forwards the documented core op', async () => {
  const cases: Array<[string, (b: never) => ToolDefinition, Record<string, unknown>, string]> = [
    ['sessionflow_search', (b) => searchTool(b), { query: 'x' }, 'search'],
    ['sessionflow_recent', (b) => recentTool(b), {}, 'overview'],
    ['sessionflow_session', (b) => sessionTool(b), { session_id: 's' }, 'bundle_preview'],
    ['sessionflow_current_work', (b) => currentWorkTool(b), { repo: 'r' }, 'current_work'],
    ['sessionflow_continue', (b) => continueTool(b), { repo: 'r' }, 'continue_context'],
    ['sessionflow_merge', (b) => mergeTool(b), { session_ids: ['a:1'] }, 'merge'],
  ];
  for (const [label, factory, args, op] of cases) {
    const calls = await recordedCalls((bridge) => factory(bridge).execute(args, {} as never));
    assert.equal(calls.length, 1, `${label} made ${calls.length} bridge calls`);
    assert.equal(calls[0]?.[0], op, `${label} must call '${op}', got '${calls[0]?.[0]}'`);
  }
});

test('search forwards its query rather than swallowing it', async () => {
  const calls = await recordedCalls((bridge) => searchTool(bridge).execute({ query: 'needle' }, {} as never));
  assert.equal((calls[0]?.[1] as { query: string }).query, 'needle');
});

test('merge forwards the session ids as argv, not as a shell string', async () => {
  const calls = await recordedCalls((bridge) => mergeTool(bridge).execute(
    { session_ids: ['a:1', 'b:2'], goal: 'g' }, {} as never));
  assert.deepEqual(calls[0]?.[1], ['a:1', 'b:2', '--goal', 'g']);
});
