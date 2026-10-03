/**
 * Shared tool plumbing: one output projection and one error translation, so
 * six tools cannot render or fail six different ways.
 */

import { VoyagerError } from '../bridge.js';

/**
 * Canonical output is structured; the model reads a pretty JSON projection.
 *
 * Keeping the canonical value structured (rather than pre-formatted prose)
 * means a Host-side presenter can render the same call differently without the
 * tool knowing about it.
 */
export function jsonOutput() {
  return {
    schema: { type: 'json' as const },
    render: (_args: unknown, value: unknown) => [
      { type: 'text' as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

/** A bridge failure becomes an actionable message, never a bare stack. */
export function describeError(e: unknown): string {
  if (e instanceof VoyagerError) {
    return e.detail ? `${e.message}\n${e.detail}` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Run a tool body, turning any failure into a clean, actionable error.
 *
 * The return type is deliberately `any`: the registry types a tool's canonical
 * output as `JsonValue`, and the value here is the core's own JSON contract,
 * validated by the core rather than by a duplicate schema in the plugin.  The
 * cast is the boundary between "typed for readers" and "checked at the source".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function guarded<T>(body: () => Promise<T>): Promise<any> {
  try {
    return await body();
  } catch (e) {
    throw new Error(describeError(e));
  }
}
