import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

interface CurrentWork {
  repo: string | null;
  has_thread: boolean;
  thread?: { id: string; title: string | null; repo_root: string | null;
             status: string; goal: string | null; members: number | null;
             updated_at: number | null };
  members?: Array<{ id: string; provider: string; title: string | null;
                    updated_at: number | null; source_state: string | null }>;
  lease?: { held: boolean; expired: boolean; why: string | null;
            holder: string | null; pid: number | null };
  session?: Record<string, unknown>;
  scope: string[];
  continuation?: { bundle: string; estimated_tokens: number } | { error: string };
}

export function currentWorkTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_current_work',
    description:
      'Answer "where did I leave off on this project?" for the current ' +
      'workspace: the active WorkThread, its member sessions, who holds the ' +
      'write lease, and a continuation context — all in one call. Prefer this ' +
      'whenever the user asks about the current project without naming a ' +
      'session; it needs no session id.',
    parameters: {
      repo: {
        type: 'string',
        description: 'Repo/cwd path to scope to (default: the DSH workspace).',
      },
      budget: {
        type: 'string',
        description: 'Context budget for the continuation preview.',
      },
    },
    output: jsonOutput(),
    async execute(args) {
      // DSH runs from the workspace root (the invoking directory is the
      // default workspace root), so process.cwd() is the right default scope.
      const repo = args.repo ?? process.cwd();
      return await guarded(() => callOp<CurrentWork>('current_work', {
        repo,
        budget: args.budget ?? null,
      }, bridge));
    },
  });
}
