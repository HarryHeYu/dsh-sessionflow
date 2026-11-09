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

/**
 * A parameter the tool refuses to forward.
 *
 * Thrown before any child process is spawned, so a bad number costs a message
 * rather than a round trip — and never reaches the core, where a negative
 * `limit` is not an error at all: `search` does `int(limit or 20)` and hands the
 * value to SQLite as `LIMIT -N`, which removes the cap instead of applying one.
 * On a real index that is 1241 rows and ~480 KB of JSON into the context.
 */
export class ParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterError';
  }
}

export interface Bounds {
  /** Smallest accepted value, inclusive. */
  min: number;
  /** Largest accepted value, inclusive. Clamped, not rejected. */
  max?: number;
  /** Value used when the argument is absent. */
  fallback: number;
  /** What the number means, for the refusal message. */
  what: string;
}

function refuse(name: string, b: Bounds, got: unknown, reason: string): never {
  const range = b.max === undefined ? `>= ${b.min}` : `${b.min}..${b.max}`;
  throw new ParameterError(
    `\`${name}\` must be ${b.what} ${range} (got ${JSON.stringify(got)}${reason ? `; ${reason}` : ''}).`);
}

/**
 * A bounded integer argument.
 *
 * Whole numbers only: `3.7` is not a "smaller 4" to the core, it is a value
 * SQLite rejects with `slice indices must be integers`, which surfaces as an
 * opaque error far from the caller's mistake.
 */
export function intArg(name: string, value: unknown, b: Bounds): number {
  if (value === undefined || value === null) return b.fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refuse(name, b, value, 'not a finite number');
  }
  if (!Number.isInteger(value)) {
    refuse(name, b, value, 'must be a whole number');
  }
  if (value < b.min) refuse(name, b, value, 'too small');
  return b.max === undefined ? value : Math.min(value, b.max);
}

/** A bounded finite number, for windows measured in hours. */
export function numArg(name: string, value: unknown, b: Bounds): number {
  if (value === undefined || value === null) return b.fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refuse(name, b, value, 'not a finite number');
  }
  if (value < b.min) refuse(name, b, value, 'too small');
  return b.max === undefined ? value : Math.min(value, b.max);
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
