import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput, ParameterError } from './common.js';

/**
 * The five verdicts the Core's `evidence.verify()` can return, by name.
 *
 * These are NORMAL results, not failures: `voyager/evidence.py` uses process
 * exit codes 1..4 for MISMATCH / NOT_FOUND / UNVERIFIABLE / INVALID_REFERENCE,
 * which is exactly why this tool goes through `callOp()` (`voyager api`, one
 * JSON line, verdict in `result.status`) and never through `runJson()` on a
 * CLI subcommand — the latter would flatten those four into `CLI_FAILED`.
 *
 * The result is returned VERBATIM from the Core. Nothing here re-checks a
 * digest, reinterprets `message`, or decides what a verdict "means". A MATCH
 * means only "the indexed event is the one the reference was made from"; it is
 * NOT a statement that the claim carried by that event is true.
 */
export type EvidenceStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'NOT_FOUND'
  | 'UNVERIFIABLE'
  | 'INVALID_REFERENCE';

/** The documented shape of `voyager evidence verify --json` / the api op. */
export interface EvidenceVerifyResult {
  status: EvidenceStatus;
  exit_code: number;
  session_id: string;
  seq: number | string;
  digest: string | null;
  found_digest: string | null;
  source_available: boolean | null;
  message: string;
  [key: string]: unknown;
}

/**
 * Reject a reference the Core could not even interpret, BEFORE spawning.
 *
 * The Core's `evidence_verify()` deliberately does not pre-validate (see the
 * maintainer's review on Core PR #24): it will happily take `session_id=""`
 * and answer `INVALID_REFERENCE`. Refusing an obviously malformed reference
 * here costs one message instead of a child process + a database open, keeps a
 * local mistake distinct from a Core verdict, and never changes what a valid
 * reference means.
 *
 * `seq` gets its own integer guard for the same reason `search.ts` guards
 * `limit`: the Core does `int(seq)`, and `int(3.7)` is `3`, not an exception —
 * a fractional position would silently check the WRONG event and could even
 * answer MATCH for a reference that named none. That is not a Core verdict we
 * should fabricate, so it is refused here. A genuinely unknown/missing session
 * still yields the Core's NOT_FOUND, and the verbatim pass-through keeps every
 * one of the five named states reachable to the caller.
 */
function requireSessionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ParameterError(
      `\`session_id\` must be a non-empty session id or unique prefix ` +
      `(got ${JSON.stringify(value)}).`);
  }
  return value;
}

/**
 * A whole event position. `type: 'number'` alone admits `3.7`, which the Core's
 * `int(seq)` truncates to `3` — a silent jump to a different event.
 */
function requireSeq(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
      || !Number.isInteger(value)) {
    throw new ParameterError(
      `\`seq\` must be a whole event position (got ${JSON.stringify(value)}).`);
  }
  return value;
}

/** A digest is 8 hex characters, with an optional leading `#` (Core's rule). */
function requireDigest(value: unknown): string | null {
  if (value === undefined || value === null) return null; // UNVERIFIABLE path
  if (typeof value !== 'string' || !/^#?[0-9a-fA-F]{8}$/.test(value.trim())) {
    throw new ParameterError(
      `\`digest\` must be 8 hex characters, optionally prefixed with '#' ` +
      `(got ${JSON.stringify(value)}). Leave it out to check the position only.`);
  }
  return value.trim();
}

export function evidenceVerifyTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_evidence_verify',
    description:
      'Verify that a cited Evidence Reference (session · seq · #digest) still ' +
      'points at the same indexed event. A Continuation Bundle cites an event ' +
      'as "seq N · #digest"; this checks whether the transcript was rewritten ' +
      'under that reference. Returns one of five named verdicts: MATCH, ' +
      'MISMATCH, NOT_FOUND, UNVERIFIABLE, INVALID_REFERENCE. MATCH means the ' +
      'reference is consistent with the indexed event — it does NOT mean the ' +
      'claim the event carries is true. Read-only; verification happens in the ' +
      'sessionFlow Core, not here.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description:
          'Session id or unique prefix the reference points into ' +
          '(e.g. "codex:11111111" or a native id).',
      },
      seq: {
        type: 'number',
        required: true,
        description:
          'Sequence number of the cited event within that session.',
      },
      digest: {
        type: 'string',
        description:
          'The 8-hex event digest the reference recorded (an optional leading ' +
          '"#" is accepted). Omit it to check only the position, which yields ' +
          'UNVERIFIABLE rather than a verified answer.',
      },
    },
    output: jsonOutput(),
    async execute(args) {
      // Validated OUTSIDE `guarded` on purpose: a refusal must stay a
      // ParameterError rather than being flattened into the generic message a
      // Core failure produces, and nothing is spawned before these checks.
      const session_id = requireSessionId(args.session_id);
      const seq = requireSeq(args.seq);
      const digest = requireDigest(args.digest);
      // `seq` also has `required: true, type: 'number'` in the schema, which
      // refuses a missing/non-numeric value before execute() runs; requireSeq
      // adds the whole-number check the schema alone cannot express.
      // `callOp` returns `payload.result` verbatim. The four non-zero verdicts
      // are ordinary results here, not transport errors; an older Core that
      // lacks the op answers `unknown op: ...`, which `callOp` throws as
      // `OP_ERROR` — a capability error, never an evidence NOT_FOUND or MATCH.
      return await guarded(() => callOp<EvidenceVerifyResult>('evidence_verify', {
        session_id,
        seq,
        digest,
      }, bridge));
    },
  });
}
