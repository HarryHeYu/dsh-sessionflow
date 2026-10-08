/**
 * dsh-sessionflow — sessionFlow for DeepSeek Harness.
 *
 * Cross-agent session continuity for DeepSeek Harness.  Continue work from
 * Codex, Claude Code, Grok, ZCode and the other coding agents directly inside
 * DSH.  The plugin is a **thin adapter**: it registers six tools and forwards
 * every call to the existing sessionFlow/Voyager core over its stable JSON
 * interface.  No session parsing, indexing, ranking, merging or context
 * compilation happens here — the core stays the single source of truth.
 *
 *   DSH → plugin tool → bridge (argv, JSON) → Voyager core → structured result
 */

import type { Context } from '@deepseek-ai/cordis';
import {
  assertCompatible,
  integrationInfo,
  type BridgeOptions,
} from './bridge.js';
import { searchTool } from './tools/search.js';
import { recentTool } from './tools/recent.js';
import { sessionTool } from './tools/session.js';
import { currentWorkTool } from './tools/current-work.js';
import { continueTool } from './tools/continue.js';
import { mergeTool } from './tools/merge.js';

export const name = 'dsh-sessionflow';

/** The tools service must be mounted before the tools can be registered. */
export const inject = ['tools'];

export interface Config {
  /**
   * Explicit `voyager` executable.  When omitted the plugin tries `voyager` on
   * PATH and then `python -m voyager.cli`.
   */
  voyagerBin?: string;
  /** Leading arguments for `voyagerBin` (e.g. a script path). */
  voyagerArgs?: string[];
  /** Python interpreter used by the `python -m voyager.cli` fallback. */
  python?: string;
  /** Per-call deadline in milliseconds (default 20000). */
  timeoutMs?: number;
}

export function apply(ctx: Context, config: Config = {}): void {
  const bridge: BridgeOptions = {};
  if (config.voyagerBin !== undefined) bridge.voyagerBin = config.voyagerBin;
  if (config.voyagerArgs !== undefined) bridge.voyagerArgs = config.voyagerArgs;
  if (config.python !== undefined) bridge.python = config.python;
  if (config.timeoutMs !== undefined) bridge.timeoutMs = config.timeoutMs;

  // `voyagerArgs` is only applied to a candidate that also has `voyagerBin`
  // set, so on its own it is silently dropped and the plugin quietly talks to
  // the default core instead of the one the operator configured.  Say so.
  if (config.voyagerArgs !== undefined && config.voyagerArgs.length > 0
      && config.voyagerBin === undefined && process.env['VOYAGER_BIN'] === undefined) {
    ctx.logger.warn(
      '[dsh-sessionflow] `voyagerArgs` is set without `voyagerBin`, so it will be ' +
      'ignored and the default `voyager` will be used. Set both together, e.g. ' +
      'voyagerBin: py + voyagerArgs: [-m, voyager.cli, --db, <index>].');
  }

  ctx.effect(() => {
    const tools = [
      searchTool(bridge),
      recentTool(bridge),
      sessionTool(bridge),
      currentWorkTool(bridge),
      continueTool(bridge),
      mergeTool(bridge),
    ];
    const disposers = tools.map((tool) => ctx.tools.register(tool));
    return () => {
      for (const dispose of disposers) dispose();
    };
  });

  // Prove the core is reachable and compatible, loudly but without blocking
  // boot: a missing Voyager must not stop DSH from starting, and the first
  // tool call still reports precisely what is wrong.
  void integrationInfo(bridge)
    .then(assertCompatible)
    .catch((e: unknown) => {
      ctx.logger.warn(`[dsh-sessionflow] ${e instanceof Error ? e.message : String(e)}`);
    });
}

export { searchTool, recentTool, sessionTool, currentWorkTool, continueTool, mergeTool };
