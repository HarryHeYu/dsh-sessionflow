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

/**
 * The sessionFlow core this plugin's release was verified against, as a git ref.
 *
 * The core has no releases and its distribution is not on PyPI (the `voyager`
 * name there belongs to an unrelated library), so there is no version string to
 * pin against -- a commit is the only stable, reproducible identifier.  Bumping
 * this is the compatibility contract: it is what `voyager[all] @ git+<url>@<ref>`
 * resolves to in the install command shown to users.
 */
export const REQUIRED_CORE_REF = 'f2a6445';

/**
 * The one-line install for a user who does not have the core.  Non-editable and
 * ref-pinned on purpose: `pip install -e .` after a `git clone` is a developer
 * path, and it is also what makes the install unreproducible.
 */
export const CORE_INSTALL_HINT =
  `Install it with the version this plugin was tested against:\n` +
  `    python -m pip install "voyager[all] @ ` +
  `git+https://github.com/HarryHeYu/sessionFlow.git@${REQUIRED_CORE_REF}"\n` +
  `Then run \`voyager scan\` to build the index. (The distribution is still ` +
  `named \`voyager\`, so a bare \`pip install voyager\` would install an ` +
  `unrelated library -- always keep the \`@ git+…\` part.)`;

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * The discovery probe spawns an interpreter and loads a package, which costs
 * far more than a call on an already-resolved command.  It therefore gets its
 * own floor: a short per-call deadline must not make discovery fail.
 *
 * It is deliberately patient.  The probe runs **once per process** and its
 * result is cached, so waiting longer costs one startup and nothing else —
 * whereas failing it tells the user their core is not installed while it is
 * sitting on PATH, which is the worst answer this module can give.  A loaded
 * machine (a full test matrix, a cold page cache, a parallel build) can take
 * far longer than a quiet one to start Python and import the package; 15 s was
 * measured to be too tight under that load.
 */
const PROBE_TIMEOUT_MS = 60_000;

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
/** The resolution currently running, so concurrent callers share one probe. */
let inFlight: Promise<VoyagerCommand> | null = null;
let inFlightKey: string | null = null;

/** Reset the process-wide caches (tests). */
export function resetBridgeCache(): void {
  cachedKey = null;
  cachedCommand = null;
  cachedInfo = null;
  cachedInfoKey = null;
  inFlight = null;
  inFlightKey = null;
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

/**
 * Why one candidate command could not be used.
 *
 * `found` carries the distinction the resolver needs: `true` means "this
 * command exists and answered, and the plugin refused it" (bridge schema too
 * old, or no `schema_version` at all); `false` means "this command could not be
 * run at all".  Without it the resolver only knows that every candidate failed,
 * and reports "not installed" to a user who plainly has a core installed.
 */
export interface ProbeFailure {
  ok: false;
  reason: string;
  found: boolean;
}

export type ProbeResult = { ok: true } | ProbeFailure;

/**
 * Prove one candidate works.  Returns `{ ok: true }` when it does, otherwise a
 * {@link ProbeFailure} explaining *why* it was rejected, so the caller can name
 * the real problem instead of saying "not found".
 */
async function probe(cmd: VoyagerCommand, opts: BridgeOptions): Promise<ProbeResult> {
  const shown = [cmd.command, ...cmd.prefixArgs].join(' ');
  try {
    const { stdout, stderr, code } = await run(cmd, ['integration-info', '--json'],
      { ...opts, timeoutMs: Math.max(opts.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS) });
    if (code !== 0) {
      const why = (stderr.trim().split(/\r?\n/).find((l) => l.trim().length > 0) ?? '').slice(0, 200);
      return {
        ok: false, found: false,
        reason: `\`${shown} integration-info\` exited ${code}${why ? `: ${why}` : ''}`,
      };
    }
    const info = JSON.parse(stdout.trim()) as IntegrationInfo;
    // A core that answers but is too old must NOT be selected: caching it would
    // pin the whole process to a binary every tool then rejects.
    if (typeof info.schema_version !== 'number') {
      return {
        ok: false, found: true,
        reason: `\`${shown}\` answered without a schema_version`,
      };
    }
    if (info.schema_version < REQUIRED_SCHEMA_VERSION) {
      return {
        ok: false, found: true,
        reason: `\`${shown}\` reports bridge schema ${info.schema_version}, ` +
                `but this plugin needs ${REQUIRED_SCHEMA_VERSION}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false, found: false,
      reason: `\`${shown}\` could not be started or timed out: ` +
              `${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** The operator explicitly named a core (plugin config, else `$VOYAGER_BIN`). */
function configuredBin(opts: BridgeOptions): string | undefined {
  return opts.voyagerBin ?? process.env['VOYAGER_BIN'];
}

/**
 * Find a working core, or explain precisely why none was found.
 *
 * Candidate order: the configured executable, `voyager` (and `voyager.exe` on
 * Windows), then `py`/`python`/`python3` running `-m voyager.cli`.  Each
 * candidate is proven with the version probe, so a shim that starts but cannot
 * answer is skipped rather than used — which matters on a machine with several
 * Python installs, where only one of them has the package.
 *
 * A **configured** executable is authoritative: if it fails the probe this
 * throws instead of falling through to a PATH candidate.  The fallback is not
 * harmless — `voyagerArgs` carries the index (`--db`), so answering from
 * another install means reporting a different set of sessions as *this*
 * project's history, which is worse than an error.  Unset `voyagerBin` to opt
 * back into PATH discovery.
 */
export async function resolveVoyager(opts: BridgeOptions = {}): Promise<VoyagerCommand> {
  const key = cacheKey(opts);
  if (cachedCommand && cachedKey === key) return cachedCommand;

  // A probe is only cached once it has *finished*, so without this every
  // concurrent caller starts its own: DSH can issue several tool calls in one
  // turn and each one resolves, which would spawn an interpreter per call to
  // answer the same question.  Sharing the in-flight promise also means a
  // failure is reported to all of them identically rather than some succeeding
  // on a later probe.
  if (inFlight && inFlightKey === key) return inFlight;

  const pending = resolveVoyagerUncached(opts, key);
  inFlight = pending;
  inFlightKey = key;
  try {
    return await pending;
  } finally {
    if (inFlight === pending) {
      inFlight = null;
      inFlightKey = null;
    }
  }
}

async function resolveVoyagerUncached(opts: BridgeOptions,
                                      key: string): Promise<VoyagerCommand> {
  const bin = configuredBin(opts);
  const [first, ...rest] = candidates(opts);
  if (first === undefined) {
    // `candidates()` always returns the PATH chain, so this is unreachable —
    // it exists so the type checker can see `first` is defined.
    throw new VoyagerError('VOYAGER_NOT_FOUND', 'no candidate command to probe');
  }
  const firstProbe = await probe(first, opts);
  if (firstProbe.ok) {
    cachedCommand = first;
    cachedKey = key;
    return first;
  }
  if (bin) {
    // An explicit `voyagerBin` was named and it did not work.  Report *which*
    // problem it is, and do not silently fall back to another core: the one on
    // PATH may index a different database, so "it works now" would be a lie.
    // A core that answered and was refused for its schema is a version problem,
    // not a missing one.
    if (firstProbe.found) {
      throw new VoyagerError('INCOMPATIBLE',
        `the configured sessionFlow/Voyager core cannot be used: ${firstProbe.reason}`,
        CORE_INSTALL_HINT);
    }
    throw new VoyagerError('VOYAGER_NOT_FOUND',
      `the configured sessionFlow/Voyager executable does not work: ${firstProbe.reason}`,
      `Refusing to fall back to another \`voyager\` on PATH: it may index ` +
      `different sessions than the one you configured. Fix the path, or ` +
      `remove \`voyagerBin\` (and \`VOYAGER_BIN\`) to let the plugin discover ` +
      `the core from PATH.`);
  }

  const failures: ProbeFailure[] = [firstProbe];
  for (const cmd of rest) {
    const r = await probe(cmd, opts);
    if (r.ok) {
      cachedCommand = cmd;
      cachedKey = key;
      return cmd;
    }
    failures.push(r);
  }
  throw unresolvableCoreError(failures);
}

/**
 * Every candidate failed.  Say which it was: a core that *exists* but the plugin
 * refuses is a version problem with a different fix, and telling that user
 * "not installed" sends them to reinstall something they already have.
 *
 * Exported so the classification is unit-testable: the candidate list cannot
 * carry a fake core without a shell on Windows, which would leave the branch
 * untested except through a real install.
 */
export function unresolvableCoreError(failures: ProbeFailure[]): VoyagerError {
  const present = failures.find((f) => f.found);
  if (present) {
    return new VoyagerError('INCOMPATIBLE',
      `a sessionFlow/Voyager core was found but this plugin cannot use it: ${present.reason}`,
      `This plugin needs bridge schema ${REQUIRED_SCHEMA_VERSION} or newer. ` +
      `Update the core to a compatible commit and reinstall:\n` +
      `    python -m pip install --upgrade "voyager[all] @ ` +
      `git+https://github.com/HarryHeYu/sessionFlow.git"\n` +
      `Then run \`voyager doctor\` to confirm the bridge schema it reports.`);
  }
  return new VoyagerError('VOYAGER_NOT_FOUND',
    'sessionFlow/Voyager is not installed or not on PATH. ' + CORE_INSTALL_HINT +
    ' If it is installed somewhere the probe cannot see, set VOYAGER_BIN to ' +
    'the executable path.',
    `What was tried: ${failures.map((f) => f.reason).join('; ')}`);
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
      `${REQUIRED_SCHEMA_VERSION} this plugin needs. Update the core to ` +
      `${REQUIRED_CORE_REF} or newer:`, CORE_INSTALL_HINT);
  }
}
