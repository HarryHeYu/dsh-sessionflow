import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

interface BundlePreview {
  bundle: string;
  estimated_tokens: number;
  budget: number;
  dropped: string[];
  trimmed: string[];
}

export function sessionTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_session',
    description:
      'Read one past session as a compact continuation context: its goal, ' +
      'verified state, files, commands, failures and next steps — compiled by ' +
      'sessionFlow, not a raw transcript dump. Use it when the user names a ' +
      'session or after sessionflow_search found one they want to resume.',
    parameters: {
      session_id: {
        type: 'string',
        required: true,
        description: 'Session id or unique prefix (e.g. "codex:11111111" or a native id).',
      },
      budget: {
        type: 'string',
        description: 'Context budget: compact | balanced | full | auto | 12k | <int> tokens.',
      },
    },
    output: jsonOutput(),
    async execute(args) {
      return await guarded(() => callOp<BundlePreview>('bundle_preview', {
        session_refs: [args.session_id],
        budget: args.budget ?? null,
      }, bridge));
    },
  });
}
