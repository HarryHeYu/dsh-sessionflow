import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

interface ContinueContext {
  bundle: string;
  estimated_tokens: number;
  budget: number;
  dropped: string[];
  trimmed: string[];
  scope?: string[];
  error?: string;
}

export function continueTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_continue',
    description:
      'Get the continuation context for work the user wants to pick back up. ' +
      'Scope is chosen the same way `voyager continue` chooses it: an explicit ' +
      'session, a WorkThread, or the newest active work for the repo — so the ' +
      'user never has to paste a session id. This is the core of the plugin: ' +
      'call it when the user says "continue", "keep going", or "pick this up".',
    parameters: {
      session_id: { type: 'string', description: 'Explicit session id or prefix.' },
      thread_id: { type: 'string', description: 'Explicit WorkThread id.' },
      repo: { type: 'string', description: 'Scope to a repo/cwd path substring.' },
      goal: { type: 'string', description: 'What the next work is for (shapes the context).' },
      budget: { type: 'string', description: 'compact | balanced | full | auto | 12k | <int>.' },
    },
    output: jsonOutput(),
    async execute(args) {
      return await guarded(() => callOp<ContinueContext>('continue_context', {
        session_refs: args.session_id ? [args.session_id] : null,
        thread_id: args.thread_id ?? null,
        repo: args.repo ?? null,
        goal: args.goal ?? null,
        budget: args.budget ?? null,
      }, bridge));
    },
  });
}
