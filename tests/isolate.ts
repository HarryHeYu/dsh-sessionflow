/**
 * Point the home-shaped environment variables at a throwaway directory.
 *
 * **Import this first, before anything else in a test file.**  ESM evaluates
 * imports in source order, so listing it above `../lib/bridge.js` guarantees it
 * runs before anything can read the environment.
 *
 * Why it is needed: the integration tests spawn the *real* core as a child
 * process, and a child inherits this process's environment.  The core resolves
 * `~/.voyager/bundles/` from `Path.home()`, so with the developer's real home in
 * place a `merge` test wrote its bundle into their profile — 186 files by the
 * time it was noticed — and, because the default bundle name was the member list
 * plus a one-second timestamp, two suites running at once computed the same path
 * and one read-back came back empty.
 *
 * ## What is redirected, and what deliberately is not
 *
 * **HOME and USERPROFILE** — redirected.  Every path the product *writes* for a
 * user resolves from `Path.home()`: `~/.voyager/index.db`,
 * `~/.voyager/bundles/`, `~/.voyager/bin/`, and the provider config files
 * `integrate install` writes.  Redirecting these two is what makes the suite
 * unable to reach any of them.
 *
 * **APPDATA and LOCALAPPDATA** — deliberately **left alone**, and the reason is
 * not that they are harmless: it is that redirecting `APPDATA` breaks the suite
 * outright.  On Windows, Python resolves its **user site-packages** from
 * `APPDATA`, and that is where an editable install of the core lives, so a
 * redirected `APPDATA` makes every spawned core fail with
 * `ModuleNotFoundError: No module named 'voyager'`.  Measured: nineteen
 * integration tests then **skip silently** — a much worse outcome than the leak
 * this file exists to prevent, because a skip reads as "host gap" rather than as
 * a defect.
 *
 * What that leaves exposed is small and known: `%APPDATA%` is read by exactly
 * one place in the product (`kiro.py`, to locate Kiro's session directory) and
 * is never written to.  These tests never scan — they pass an explicit `--db`
 * and set `VOYAGER_NO_SYNC=1` — so no discovery runs against it.
 *
 * `SESSIONFLOW_TEST_TMPDIR` relocates the whole thing (used to keep scratch off
 * a drive the suite does not own); it defaults to the OS temp dir and is removed
 * on exit either way.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The developer's real values, captured before anything is changed. */
export const REAL_HOME: string = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
export const REAL_APPDATA: string = process.env['APPDATA'] ?? '';

const base = process.env['SESSIONFLOW_TEST_TMPDIR'] || tmpdir();

/** A throwaway home. Every child this suite spawns sees this one. */
export const TEST_HOME: string = mkdtempSync(join(base, 'dsh-sessionflow-home-'));

for (const key of ['HOME', 'USERPROFILE']) {
  process.env[key] = TEST_HOME;
}

process.on('exit', () => {
  try {
    rmSync(TEST_HOME, { recursive: true, force: true });
  } catch {
    // best effort: a leftover temp dir must never fail the suite
  }
});

/** True when the process is running against a throwaway home. */
export function isIsolated(): boolean {
  const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
  return home.length > 0 && home === TEST_HOME && home !== REAL_HOME;
}

/** True when APPDATA was intentionally left pointing at the real one. */
export function appdataIsShared(): boolean {
  return (process.env['APPDATA'] ?? '') === REAL_APPDATA;
}
