import { defineTool } from '@deepseek-ai/dsh-tools';
import { runJson, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

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
      return await guarded(async () => {
        const ids = Array.isArray(args.session_ids)
          ? args.session_ids.filter((s): s is string => typeof s === 'string' && s.length > 0)
          : [];
        if (ids.length === 0) {
          throw new Error('sessionflow_merge needs at least one session id.');
        }
        const argv = ['merge', ...ids];
        if (args.goal) argv.push('--goal', args.goal);
        if (args.thread_title) argv.push('--thread-title', args.thread_title);
        if (args.budget) argv.push('--budget', args.budget);
        return await runJson<MergeResult>(argv, bridge);
      });
    },
  });
}
