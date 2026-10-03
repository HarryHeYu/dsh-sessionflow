import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, jsonOutput } from './common.js';

interface SearchHit {
  id: string;
  provider: string;
  native_session_id: string | null;
  title: string | null;
  repo: string | null;
  updated_at: number | null;
  matched_at: number | null;
  matched_kind: string | null;
  matched_tool: string | null;
  matched_file: string | null;
  excerpt: string;
}

interface SearchResult {
  query: string;
  count: number;
  results: SearchHit[];
}

export function searchTool(bridge: BridgeOptions) {
  return defineTool({
    name: 'sessionflow_search',
    description:
      'Search the history of every AI coding agent sessionFlow has indexed ' +
      '(Codex, Claude Code, DSH, Grok, ZCode, Cursor, Kiro, Antigravity). ' +
      'Call it whenever the user refers to earlier work — "find the session ' +
      'where I fixed the parser", "what did I do about the flaky test" — ' +
      'instead of guessing. Returns matching sessions with the matching turn.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'Text to search for. Plain substring, any language.',
      },
      provider: {
        type: 'string',
        description: 'Comma list to restrict providers, e.g. "codex,claude".',
      },
      repo: { type: 'string', description: 'Restrict to a repo/cwd path substring.' },
      since: { type: 'string', description: 'Lower time bound: 2026-09-30 or 7d.' },
      until: { type: 'string', description: 'Upper time bound, same forms as since.' },
      limit: { type: 'number', description: 'Maximum hits (default 20).' },
    },
    output: jsonOutput(),
    async execute(args) {
      return await guarded(() => callOp<SearchResult>('search', {
        query: args.query,
        provider: args.provider ?? null,
        repo: args.repo ?? null,
        since: args.since ?? null,
        until: args.until ?? null,
        limit: args.limit ?? 20,
      }, bridge));
    },
  });
}
