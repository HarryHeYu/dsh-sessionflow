import { defineTool } from '@deepseek-ai/dsh-tools';
import { runJson, type BridgeOptions } from '../bridge.js';
import {
  MAX_ARG_CHARS, assertArgvFits, flagArg, guarded, jsonOutput, ParameterError,
} from './common.js';

interface MergeResult {
  action: string;
  thread_id: string | null;
  scope: string | null;
  style: string | null;
  context: string;
  context_chars: number | null;
  member_count: number | null;
  warnings: string[];
  error: string | null;
  bundle_path: string | null;
}

export function mergeTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_merge',
    description:
      'Combine several past sessions into one WorkThread and return their ' +
      'synthesized continuation context. Use it when the user names two or ' +
      'more sessions to work on together, e.g. "put the Claude training ' +
      'session and the Codex eval session together and let me continue". ' +
      'This is the only tool that writes: it persists the WorkThread so later ' +
      'calls find it.',
    parameters: {
      session_ids: {
        type: 'array',
        required: true,
        description: 'Session ids or unique prefixes to merge (at least one).',
      },
      goal: { type: 'string', description: 'Primary goal for the next agent.' },
      thread_title: { type: 'string', description: 'Title for the WorkThread.' },
      budget: { type: 'string', description: 'compact | balanced | full | auto | 12k | <int>.' },
    },
    output: jsonOutput(),
    async execute(args) {
      // Built and bounded OUTSIDE `guarded`, so a refusal stays a
      // ParameterError naming the field instead of being flattened into the
      // generic message a core failure produces.  Nothing is spawned yet.
      const ids = Array.isArray(args.session_ids)
        ? args.session_ids.filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [];
      if (ids.length === 0) {
        throw new ParameterError('sessionflow_merge needs at least one session id.');
      }
      // A session id becomes a POSITIONAL argument, so it must survive the same
      // length ceiling as a value would.
      const oversized = ids.find((id) => id.length > MAX_ARG_CHARS);
      if (oversized !== undefined) {
        throw new ParameterError(
          `\`session_ids\` contains one id of ${oversized.length} characters, ` +
          `over the ${MAX_ARG_CHARS} one argument may carry.`);
      }

      // Options in `=` form: a goal of "--verbose" is data, not a flag.
      const options: string[] = [];
      const contributions: Array<readonly [string, number]> = [['session_ids', 0]];
      let idsChars = 0;
      for (const id of ids) idsChars += id.length;
      contributions[0] = ['session_ids', idsChars];

      if (args.goal !== undefined) {
        options.push(flagArg('goal', args.goal, { maxLength: MAX_ARG_CHARS }));
        contributions.push(['goal', args.goal.length]);
      }
      if (args.thread_title !== undefined) {
        options.push(flagArg('thread_title', args.thread_title, { maxLength: MAX_ARG_CHARS }));
        contributions.push(['thread_title', args.thread_title.length]);
      }
      if (args.budget !== undefined) {
        // A budget is a short token or an integer; the same ceiling applies.
        options.push(flagArg('budget', args.budget, { maxLength: MAX_ARG_CHARS }));
        contributions.push(['budget', args.budget.length]);
      }

      // Order matters and is load-bearing: `--json` goes BEFORE the separator.
      // After it, argparse stops option parsing and reads the flag as just
      // another session id — measured as `sessions=['a:1','--json'], json=false`.
      const argv = [
        'merge', ...options, '--json', '--', ...ids,
      ];
      assertArgvFits(argv, contributions);

      return await guarded(async () => {
        // `--json` is already in place, so the bridge must not append another.
        return await runJson<MergeResult>(argv, bridge, { jsonAlreadySet: true });
      });
    },
  });
}
