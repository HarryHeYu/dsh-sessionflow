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

import { apply, inject, name } from '../lib/index.js';

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
  apply(ctx as never, {});
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
  apply(ctx as never, {});
  for (const t of registered) {
    assert.ok(t.description.length > 60, `${t.name}: description too thin`);
    assert.equal(typeof t.parameters, 'object', `${t.name}: parameters missing`);
  }
});

test('no tool uses a second naming scheme', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, {});
  assert.deepEqual(registered.filter((t) => !t.name.startsWith('sessionflow_')), []);
});

test('the required-argument tools really require one', () => {
  const { ctx, registered } = fakeContext();
  apply(ctx as never, {});
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
