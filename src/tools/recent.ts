import { defineTool } from '@deepseek-ai/dsh-tools';
import { callOp, type BridgeOptions } from '../bridge.js';
import { guarded, intArg, jsonOutput, numArg } from './common.js';

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

/**
 * How many rows to ask the core for when a provider filter will be applied here.
 *
 * Matches the ceiling `intArg` allows for `limit`, so the filtered answer can
 * never be short because the request was: the window is the widest the core
 * will honour, and `limit` then decides how much of it to show.
 */
const PROVIDER_FILTER_WINDOW = 200;

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
      // Validated OUTSIDE `guarded` on purpose: a refusal must stay a
      // ParameterError rather than being flattened into the same generic
      // message every core failure produces.  Nothing has been spawned yet.
      // Bounded before the op is built.  `limit: 0` used to reach the core,
      // where `int(limit or 20)` turned it into 20 — a call that asked for
      // nothing and got a full page.  A negative value was worse: SQLite
      // treated `LIMIT -3` as "no cap" and returned 91 rows.
      const limit = intArg('limit', args.limit,
        { min: 1, max: 200, fallback: 12, what: 'a whole number of rows' });
      // A negative window is not "since forever": the core computes
      // `cutoff = now - hours*3600`, so -5 asks for a cutoff in the future
      // and every session is filtered out.  The caller gets an empty list and
      // no hint that the window was the problem.
      const hours = numArg('hours', args.hours,
        { min: 0, max: 24 * 365 * 10, fallback: 48, what: 'a non-negative number of hours' });
      return await guarded(async () => {
        // The core's `overview` op has no provider filter, so a provider
        // narrowing has to happen here — but applying it *after* the core's
        // `limit` would silently under-return.  The previous fix asked for
        // `limit * 4` rows and hoped; that is a guess, and when the wanted
        // provider is rarer than one row in four it still under-returns, with
        // no signal that it did.  Ask for the ceiling up front instead: the
        // extra rows are cheap (the core filters and sorts before it reads any
        // events) and the answer is then exact rather than probable.
        const want = args.provider ? PROVIDER_FILTER_WINDOW : limit;
        const ov = await callOp<Overview>('overview', {
          repo: args.repo ?? null,
          hours,
          limit: want,
        }, bridge);
        const matched = args.provider
          ? ov.recent_sessions.filter((s) => s.provider === args.provider)
          : ov.recent_sessions;
        // Say when the window, not the filter, is what limited the answer.
        //
        // The condition is "the core filled the window", NOT "we had to cut
        // more than `limit`".  Those differ in the case that matters: the
        // wanted provider can sit entirely BEHIND the window, where the filter
        // matches zero rows and cuts nothing — yet the empty list is exactly as
        // uninformed as a cut one.  The previous predicate required
        // `matched.length > limit`, so that case reported no signal at all and
        // an empty answer stood in for "no such sessions exist" (measured on a
        // real 255-session index: 250 fresher `claude` rows ahead of 5 `codex`
        // rows, `{provider:'codex', limit:5}` returned 0 rows, `truncated`
        // absent, while `sessions {platform:'codex'}` shows the 5 exist).
        //
        // Only a filtered call can be in this position: an unfiltered one asks
        // for exactly `limit` and a full page is the answer, not a truncation.
        const truncated = Boolean(args.provider) && ov.recent_sessions.length >= want;
        return {
          stats: ov.stats,
          threads: ov.threads,
          recent_sessions: matched.slice(0, limit),
          ...(truncated ? { truncated: true } : {}),
        };
      });
    },
  });
}
