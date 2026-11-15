/**
 * Shared tool plumbing: one output projection and one error translation, so
 * the tools cannot render or fail in different ways.
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
 * Whole numbers only.  What a fractional value does depends on the op, and the
 * two behaviors are different enough that neither can be described as "the
 * core rejects it" — both measured on voyager 1.3.0 against a real index:
 *
 *  * `search` does `int(limit or 20)` (api.py:254), so `3.7` is silently
 *    truncated to `3`.  Nothing fails and nothing says so; the caller simply
 *    gets fewer hits than it asked for.  A silent under-read is the worst of
 *    the three outcomes, because it looks like a complete answer.
 *  * `overview` slices with the raw value (api.py:77 and :94), so the same
 *    `3.7` raises `slice indices must be integers or None or have an
 *    __index__ method` — an error that names no argument and arrives far from
 *    the caller's mistake.
 *
 * A fractional count is therefore never "a smaller integer" to be rounded down
 * on the caller's behalf: it is either a quiet under-read or an opaque failure.
 * Refusing it here costs one message and names the field.
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

/**
 * Ceiling for one argument value, in characters.
 *
 * A single absurd value is almost always a client-side mistake rather than a
 * large request, so it is refused on its own terms before the total below is
 * even consulted — which lets the message name that one field.
 */
export const MAX_ARG_CHARS = 8_000;

/**
 * Total ceiling for the arguments this plugin builds, in characters.
 *
 * Windows caps a command line at 32767 characters, and Node raises
 * `spawn ENAMETOOLONG` **synchronously** when an argument pushes past it;
 * POSIX raises `E2BIG` for the same class of failure.  Measured in this
 * repository: a 32,500-character argument still spawned, 33,000 did not.
 *
 * The budget is deliberately well under the OS limit so the resolved
 * executable, the bridge's prefix arguments and the flags the bridge adds all
 * fit inside the same command line.  Exceeding it used to surface as
 * `could not start '<node>': Error: spawn ENAMETOOLONG` — an error naming the
 * executable and never the argument, which reads like a broken install.
 */
export const MAX_ARGV_CHARS = 24_000;

/** Total characters across every argument the OS will have to carry. */
export function argvLength(argv: readonly string[]): number {
  let total = 0;
  for (const arg of argv) total += arg.length;
  return total;
}

export interface FlagBounds {
  /** Largest accepted value, in characters. Refused, never truncated. */
  maxLength: number;
}

/**
 * One option as `--name=value`, with the value proven safe to carry.
 *
 * The `=` form is not a style choice: argparse reads `--goal --verbose` as a
 * missing value and exits, so a goal whose text happens to begin with a dash
 * turned the whole call into a `CLI_FAILED` that named nothing.  With `=` the
 * value is data no matter what it starts with, and interior whitespace, CJK and
 * embedded `=` all survive (all measured against the real `merge` subparser).
 *
 * Underscores in the parameter name become dashes, because every core flag is
 * kebab-case (`--thread-title`).  The name is only ever a literal from this
 * repository, never caller input.
 */
export function flagArg(name: string, value: unknown, b: FlagBounds): string {
  if (typeof value !== 'string') {
    throw new ParameterError(
      `\`${name}\` must be text (got ${JSON.stringify(value)}).`);
  }
  if (value.length > b.maxLength) {
    throw new ParameterError(
      `\`${name}\` is too long: ${value.length} characters, but at most ` +
      `${b.maxLength} can be carried on a command line.`);
  }
  // A line break or NUL cannot survive argv intact; the OS truncates at the
  // NUL and a newline splits the value, so both are refused rather than sent
  // as something subtly different from what the caller asked for.
  if (/[\u0000\r\n]/.test(value)) {
    throw new ParameterError(
      `\`${name}\` must be a single line without NUL bytes ` +
      `(got ${JSON.stringify(value.slice(0, 40))}).`);
  }
  return `--${name.replace(/_/g, '-')}=${value}`;
}

/**
 * Refuse an argv the operating system cannot deliver, naming the field that
 * made it too big.
 *
 * `contributions` is every caller-supplied part with the name a model can act
 * on, so the message points at `session_ids` rather than at "the command line".
 */
export function assertArgvFits(
  argv: readonly string[],
  contributions: ReadonlyArray<readonly [string, number]>,
): void {
  const total = argvLength(argv);
  if (total <= MAX_ARGV_CHARS) return;
  const largest = contributions.reduce<readonly [string, number] | undefined>(
    (best, entry) => (best === undefined || entry[1] > best[1] ? entry : best),
    undefined,
  );
  const who = largest === undefined ? 'this call' : `\`${largest[0]}\``;
  throw new ParameterError(
    `${who} would make this call ${total} characters, over the ` +
    `${MAX_ARGV_CHARS} that fit on one command line (the OS limit is lower ` +
    `still once the executable path is counted). Send fewer ids, or shorter ` +
    `values.`);
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
