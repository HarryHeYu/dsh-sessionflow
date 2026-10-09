/**
 * The Voyager bridge — the one place this plugin talks to the sessionFlow core.
 *
 * Two rules from the plugin contract are enforced here, not by convention:
 *
 *  * **argv arrays only.** Arguments go to `spawn` as an array; no shell string
 *    is ever built, so a query containing `;`, `"` or a CJK phrase is data, not
 *    syntax.
 *  * **no second implementation.** Every call targets a command that already
 *    exists in the core (`voyager api` for reads, `voyager merge` for the one
 *    write). The plugin never reads session files, indexes, or compiles
 *    context itself.
 *
 * Every failure is a typed {@link VoyagerError} with an actionable message, so
 * a tool can surface *why* continuity is unavailable instead of an empty list.
 */

import { spawn } from 'node:child_process';

/** Bridge schema this plugin was written against (`integration-info.schema_version`). */
export const REQUIRED_SCHEMA_VERSION = 1;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * The discovery probe spawns an interpreter and loads a package, which costs
 * far more than a call on an already-resolved command.  It therefore gets its
 * own floor: a short per-call deadline must not make discovery fail.
 */
const PROBE_TIMEOUT_MS = 15_000;

/** The version/capability probe the core returns. */
export interface IntegrationInfo {
  name: string;
  package: string;
  version: string;
  schema_version: number;
  ops: string[];
  capabilities: string[];
}

export type VoyagerErrorCode =
  | 'VOYAGER_NOT_FOUND'
  | 'TIMEOUT'
  | 'NO_OUTPUT'
  | 'BAD_JSON'
  | 'OP_ERROR'
  | 'CLI_FAILED'
  | 'INCOMPATIBLE';

export class VoyagerError extends Error {
  readonly code: VoyagerErrorCode;
  readonly detail: string | undefined;

  constructor(code: VoyagerErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'VoyagerError';
    this.code = code;
    this.detail = detail;
  }
}

/** A resolved way to invoke the core: `<command> <prefixArgs...> <args...>`. */
export interface VoyagerCommand {
  command: string;
  prefixArgs: string[];
}

export interface BridgeOptions {
  /** Explicit executable (plugin config `voyagerBin`, else `$VOYAGER_BIN`). */
  voyagerBin?: string;
  /**
   * Leading arguments for {@link voyagerBin}.  Lets a caller point at a script
   * runner (`node /path/to/voyager.js`) instead of a single executable.
   */
  voyagerArgs?: string[];
  /** Python interpreter for the `python -m voyager.cli` fallback. */
  python?: string;
  /** Per-call deadline in milliseconds. */
  timeoutMs?: number;
  /** Working directory for the child (defaults to the DSH workspace). */
  cwd?: string;
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** The discovered command is stable per configuration, so probe once — but the
 *  cache is keyed on the configuration, not global: two callers with different
 *  `voyagerBin` must not silently share the first one's answer. */
let cachedKey: string | null = null;
let cachedCommand: VoyagerCommand | null = null;
let cachedInfo: IntegrationInfo | null = null;
let cachedInfoKey: string | null = null;

/** Reset the process-wide caches (tests). */
export function resetBridgeCache(): void {
  cachedKey = null;
  cachedCommand = null;
  cachedInfo = null;
  cachedInfoKey = null;
}

function cacheKey(opts: BridgeOptions): string {
  return JSON.stringify([
    opts.voyagerBin ?? process.env['VOYAGER_BIN'] ?? null,
    opts.voyagerArgs ?? null,
    opts.python ?? process.env['VOYAGER_PYTHON'] ?? null,
  ]);
}

function candidates(opts: BridgeOptions): VoyagerCommand[] {
  const out: VoyagerCommand[] = [];
  const bin = opts.voyagerBin ?? process.env['VOYAGER_BIN'];
  if (bin) out.push({ command: bin, prefixArgs: [...(opts.voyagerArgs ?? [])] });
  out.push({ command: 'voyager', prefixArgs: [] });
  if (process.platform === 'win32') {
    // A Python console-script install puts `voyager.exe` on PATH; the npm shim
    // is `voyager.cmd`, which cannot be spawned without a shell, so it is
    // deliberately not a candidate.
    out.push({ command: 'voyager.exe', prefixArgs: [] });
  }
  const python = opts.python ?? process.env['VOYAGER_PYTHON'];
  if (python) {
    out.push({ command: python, prefixArgs: ['-m', 'voyager.cli'] });
  }
  if (process.platform === 'win32') {
    // The Windows Python launcher picks the registered default interpreter,
    // which is the one a normal `pip install voyager` used.
    out.push({ command: 'py', prefixArgs: ['-m', 'voyager.cli'] });
  }
  out.push({ command: 'python', prefixArgs: ['-m', 'voyager.cli'] });
  out.push({ command: 'python3', prefixArgs: ['-m', 'voyager.cli'] });
  return out;
}

function run(cmd: VoyagerCommand, args: string[], opts: BridgeOptions,
             stdin?: string): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let child;
    try {
      child = spawn(cmd.command, [...cmd.prefixArgs, ...args], {
        cwd: opts.cwd,
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(new VoyagerError('VOYAGER_NOT_FOUND',
        `could not start '${cmd.command}': ${String(e)}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish(() => reject(new VoyagerError('TIMEOUT',
        `\`${cmd.command} ${[...cmd.prefixArgs, ...args].join(' ')}\` exceeded ${timeoutMs}ms`)));
    }, timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => { stdout += d; });
    child.stderr?.on('data', (d: string) => { stderr += d; });
    child.on('error', (e: NodeJS.ErrnoException) => {
      finish(() => reject(e.code === 'ENOENT'
        ? new VoyagerError('VOYAGER_NOT_FOUND', `'${cmd.command}' is not on PATH`)
        : new VoyagerError('CLI_FAILED', `'${cmd.command}' failed: ${e.message}`)));
    });
    child.on('close', (code: number | null) => {
      finish(() => resolve({ stdout, stderr, code }));
    });

    if (child.stdin) {
      if (stdin !== undefined) child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

async function probe(cmd: VoyagerCommand, opts: BridgeOptions): Promise<boolean> {
  try {
    const { stdout, code } = await run(cmd, ['integration-info', '--json'],
      { ...opts, timeoutMs: Math.max(opts.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS) });
    if (code !== 0) return false;
    const info = JSON.parse(stdout.trim()) as IntegrationInfo;
    // A core that answers but is too old must NOT be selected: caching it would
    // pin the whole process to a binary every tool then rejects.
    return typeof info.schema_version === 'number'
      && info.schema_version >= REQUIRED_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

/**
 * Find a working core, or explain precisely why none was found.
 *
 * Candidate order: the configured executable, `voyager` (and `voyager.exe` on
 * Windows), then `py`/`python`/`python3` running `-m voyager.cli`.  Each
 * candidate is proven with the version probe, so a shim that starts but cannot
 * answer is skipped rather than used — which matters on a machine with several
 * Python installs, where only one of them has the package.
 */
export async function resolveVoyager(opts: BridgeOptions = {}): Promise<VoyagerCommand> {
  const key = cacheKey(opts);
  if (cachedCommand && cachedKey === key) return cachedCommand;
  for (const cmd of candidates(opts)) {
    if (await probe(cmd, opts)) {
      cachedCommand = cmd;
      cachedKey = key;
      return cmd;
    }
  }
  throw new VoyagerError('VOYAGER_NOT_FOUND',
    'sessionFlow/Voyager is not installed or not on PATH. Install it from ' +
    'source: `git clone https://github.com/HarryHeYu/sessionFlow && cd ' +
    'sessionFlow && pip install -e .`, then restart DSH. It is not on PyPI -- ' +
    'the `voyager` name there belongs to an unrelated library. ' +
    'If it is installed elsewhere, set VOYAGER_BIN to the executable path.');
}

/**
 * One read op over the core's stdio JSON-lines API (`voyager api`).
 *
 * The request is a single line; the child answers with a single line and then
 * exits when stdin closes, so there is no long-lived process to babysit.
 */
export async function callOp<T>(op: string, params: Record<string, unknown>,
                                opts: BridgeOptions = {}): Promise<T> {
  const cmd = await resolveVoyager(opts);
  const { stdout, stderr } = await run(cmd, ['api'], opts,
    JSON.stringify({ id: 1, op, params }) + '\n');
  const line = stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
  if (line === undefined) {
    throw new VoyagerError('NO_OUTPUT',
      `the core returned nothing for '${op}'`, stderr.slice(0, 400));
  }
  let payload: { result?: unknown; error?: unknown };
  try {
    payload = JSON.parse(line) as { result?: unknown; error?: unknown };
  } catch {
    throw new VoyagerError('BAD_JSON',
      `the core returned non-JSON for '${op}'`, line.slice(0, 400));
  }
  if (payload.error) {
    throw new VoyagerError('OP_ERROR', String(payload.error));
  }
  return payload.result as T;
}

/** Run a core subcommand that emits JSON on stdout (`--json` is appended). */
export async function runJson<T>(argv: string[], opts: BridgeOptions = {}): Promise<T> {
  const cmd = await resolveVoyager(opts);
  const { stdout, stderr, code } = await run(cmd, [...argv, '--json'], opts);
  if (code !== 0) {
    throw new VoyagerError('CLI_FAILED',
      `\`voyager ${argv.join(' ')}\` failed with exit code ${code}`,
      stderr.slice(0, 400));
  }
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new VoyagerError('BAD_JSON',
      `\`voyager ${argv.join(' ')}\` did not return JSON`, stdout.slice(0, 400));
  }
}

/** The core's version/capability probe, cached per configuration. */
export async function integrationInfo(opts: BridgeOptions = {}): Promise<IntegrationInfo> {
  const key = cacheKey(opts);
  if (cachedInfo && cachedInfoKey === key) return cachedInfo;
  const info = await runJson<IntegrationInfo>(['integration-info'], opts);
  cachedInfo = info;
  cachedInfoKey = key;
  return info;
}

/** Fail clearly when the core is older than the bridge this plugin drives. */
export function assertCompatible(info: IntegrationInfo): void {
  if (info.schema_version < REQUIRED_SCHEMA_VERSION) {
    throw new VoyagerError('INCOMPATIBLE',
      `sessionFlow bridge schema ${info.schema_version} is older than the ` +
      `${REQUIRED_SCHEMA_VERSION} this plugin needs. Update the source ` +
      'checkout and reinstall (`git pull && pip install -e .`).');
  }
}
