import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

interface RecentSession {
  id: string;
  provider: string;
  native_session_id: string | null;
  title: string | null;
  updated_at: number | null;
  last_user: string;
  message_count: number | null;
  tool_count: number | null;
  source_state: string | null;
}

interface Overview {
  stats: { sessions: number; events: number; by_provider: Record<string, number> };
  threads: Array<{ id: string; title: string | null; repo_root: string | null;
                   status: string; members: number | null; updated_at: number | null }>;
  recent_sessions: RecentSession[];
}

export function recentTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_recent',
    description:
      'List recent work — active WorkThreads and the newest sessions — across ' +
      'every indexed agent, so "what have I been doing on this project?" is ' +
      'answered without leaving DSH. Use it before sessionflow_current_work ' +
      'when the user wants a broader picture than the current thread.',
    parameters: {
      repo: { type: 'string', description: 'Restrict to a repo/cwd path substring.' },
      provider: { type: 'string', description: 'Keep only this provider (e.g. "claude").' },
      hours: { type: 'number', description: 'Look-back window in hours (default 48).' },
      limit: { type: 'number', description: 'Maximum rows (default 12).' },
    },
    output: jsonOutput(),
    async execute(args) {
      return await guarded(async () => {
        const limit = args.limit ?? 12;
        const ov = await callOp<Overview>('overview', {
          repo: args.repo ?? null,
          hours: args.hours ?? 48,
          limit,
        }, bridge);
        // The overview op has no provider argument, so a provider filter is a
        // display narrowing on rows the core already returned -- not a second
        // query implementation.
        const sessions = args.provider
          ? ov.recent_sessions.filter((s) => s.provider === args.provider)
          : ov.recent_sessions;
        return {
          stats: ov.stats,
          threads: ov.threads,
          recent_sessions: sessions.slice(0, limit),
        };
      });
    },
  });
}
