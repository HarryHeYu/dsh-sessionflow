# Demo — continue a Claude Code task inside DeepSeek Harness

This is the demo the project is judged by: an unfinished task left in **Claude
Code** is picked up inside **DSH**, with the goal, the files and the open items
intact.

It is **fully reproducible and fully synthetic**. No real agent history, no real
repository, no credentials, no network. The generator writes two controlled
sessions (one Codex, one Claude Code) that talk about a throwaway git repository
it also creates, then points the whole run at a private `HOME` so your real
`~/.voyager`, `~/.codex` and `~/.claude` are never read or written.

---

## What it demonstrates

| # | Step | What it proves |
|---|---|---|
| 1 | Build the isolated environment | The demo touches nothing real |
| 2 | `voyager scan` | Two different agent formats land in one local index |
| 3 | `voyager list` | Both sessions are searchable |
| 4 | `voyager repo <path>` | One cross-agent timeline per project |
| 5 | `voyager search "strict"` | Full-text search across agents |
| 6 | `voyager continue` | The newest work in the repo is picked back up |
| 7 | `voyager handoff --to codex` | A Context Package another agent can read |
| 8 | `voyager merge` | Sessions grouped into a WorkThread |
| 9–10 | second WorkThread, then `continue` | Ambiguity is **reported, not guessed** (exit 2) |
| 11 | `voyager continue --thread <id>` | Naming the thread proceeds |

The plugin half of the story — the six `sessionflow_*` tools over this same
index — is covered by `tests/bridge.test.ts` and by the Linux cold-start job in
CI; the demo script stops at the core boundary so it needs no model provider.

---

## Run it

Prerequisites: Python ≥ 3.10 with sessionFlow installed (see the
[Quick Start](https://github.com/HarryHeYu/sessionFlow/blob/main/docs/QUICKSTART.md)),
plus `git`.

```sh
git clone https://github.com/HarryHeYu/dsh-sessionflow
cd dsh-sessionflow
PYTHON=python3 bash docs/demo/run-demo.sh /tmp/sf-demo
```

On Windows, run it from Git Bash and point `PYTHON` at the interpreter that has
sessionFlow:

```sh
PYTHON=/c/path/to/python.exe bash docs/demo/run-demo.sh /e/sf-demo
```

The script exits non-zero if any step misbehaves — in particular it asserts that
the ambiguous `continue` returns exit code **2**, so a regression cannot pass
silently.

---

## What you should see

After `voyager scan`, one index holds both agents:

```
  codex: 1 sessions indexed (1 new/refreshed, 0 unchanged)
  claude: 1 sessions indexed (1 new/refreshed, 0 unchanged)
  ...
scan complete: 2 sessions, 15 events (new/refreshed: 2, unchanged: 0)
```

`voyager repo` shows the point of the tool — every agent that touched the
project, in order:

```
E:/…/proj/demo  (2 sessions)
  2026-10-12 17:01  claude  "Add a --strict flag to app.py …"  2 msgs / 3 tools  branch:main  commit:f285d267b3
  2026-10-11 23:01  codex   "Set up config loading from config.json."  2 msgs / 1 tools  branch:main
```

The handoff package is the payload the target agent reads. It carries the goal,
**where the work stopped**, the files and the commands:

```markdown
## User goal / instructions
Add a --strict flag to app.py that fails on unknown config keys, then add a test for it.

## Where the work stopped (last assistant message)
I added --strict to load_config() and a test, but test_strict_rejects_unknown_keys is
still failing: strict mode does not raise on unknown keys yet. TODO: raise on unknown keys.

## Files this session touched
- `…/proj/demo/app.py`

## Commands executed
- `python -m pytest -q`
```

And when the repository has two active lines of work, nothing guesses:

```
error: 2 active WorkThreads for this repo — refusing to guess which one you meant.
  thr_8e117a914a  Add a --json output mode
  thr_d14b834a14  merge: claude:cccccccc-1 + codex:aaaaaaaa-1
Pick one explicitly: --thread <id>
```

The full transcript is in [`expected-output.md`](expected-output.md).

---

## How to verify it is real

1. **Nothing real was touched.** Before and after, check that your own index did
   not move:

   ```sh
   stat -c '%s %y' ~/.voyager/index.db     # GNU; use `stat -f` on macOS
   ```

   The script exports `USERPROFILE`, `HOME`, `APPDATA` and `LOCALAPPDATA` to the
   throwaway root, so `~/.voyager` in the run *is* the demo's, not yours.

2. **The index is a real SQLite database**, not canned text:

   ```sh
   python -c "import sqlite3,sys; \
     c=sqlite3.connect(sys.argv[1]); \
     print(c.execute('select provider, count(*) from sessions group by 1').fetchall())" \
     /tmp/sf-demo/home/.voyager/index.db
   ```

3. **Re-run it.** Every run rebuilds from the generator and produces the same
   two sessions and the same decisions.

---

## What it does *not* prove

- **Native resume.** `voyager continue` prints the resume command it *would*
  run; no resume is executed here, and none has been observed working end to end
  on any provider.
- **A model turn.** The script drives the core only. The plugin's live
  model-turn evidence is separate — see `docs/p8-live-verification.md` and
  `docs/p9-live-verification.md`.
- **Real provider parsing on your machine.** The sessions are real *formats*
  written by the generator, not files your agents produced.

---

## Recording it

[`storyboard.md`](storyboard.md) is the shot list for a ~60-second GIF or video:
what to type, what to show, and the exact timings. It is written so the
recording can be made without inventing anything — every frame is a step of
`run-demo.sh`.
