#!/usr/bin/env python3
"""Build the isolated demo environment for the cross-agent continuation demo.

Creates, under a root directory you choose:

  <root>/home      a throwaway HOME (the demo points USERPROFILE/HOME/APPDATA/
                   LOCALAPPDATA at it, so the real ~/.voyager, ~/.codex and
                   ~/.claude are never read or written)
  <root>/proj/demo a small git repository the sessions talk about
  <root>/home/.codex/sessions/...   one synthetic Codex rollout (JSONL)
  <root>/home/.claude/projects/...  one synthetic Claude Code session (JSONL)

The sessions tell one story: Codex set up config loading; Claude Code added a
--strict flag and left a failing test and a TODO. Everything is synthetic and
public — no user paths, no tokens, no private code.

Usage:  python build-env.py <root>
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve()
HOME = ROOT / 'home'
REPO = ROOT / 'proj' / 'demo'
CWD = REPO.as_posix()                      # e.g. E:/scratch/demo/proj/demo
MUNGED = CWD.replace(':', '-').replace('/', '--')


def write_repo():
    (REPO / 'tests').mkdir(parents=True, exist_ok=True)
    (REPO / 'README.md').write_text(
        '# demo\n\nA tiny CLI used by the sessionFlow cross-agent demo.\n',
        encoding='utf-8')
    (REPO / 'app.py').write_text(
        'import json\nimport sys\n\n\n'
        'def load_config(path="config.json"):\n'
        '    with open(path, encoding="utf-8") as fh:\n'
        '        return json.load(fh)\n\n\n'
        'def main(argv=None):\n'
        '    argv = list(sys.argv[1:] if argv is None else argv)\n'
        '    cfg = load_config()\n'
        '    print("config:", cfg)\n'
        '    return 0\n\n\n'
        'if __name__ == "__main__":\n'
        '    raise SystemExit(main())\n',
        encoding='utf-8')
    (REPO / 'config.json').write_text('{"name": "demo", "retries": 3}\n',
                                      encoding='utf-8')
    (REPO / 'tests' / 'test_app.py').write_text(
        'import app\n\n\n'
        'def test_load_config_reads_json(tmp_path):\n'
        '    p = tmp_path / "c.json"\n'
        '    p.write_text(\'{"a": 1}\', encoding="utf-8")\n'
        '    assert app.load_config(p) == {"a": 1}\n',
        encoding='utf-8')


def write_codex():
    sid = 'aaaaaaaa-1111-2222-3333-444444444444'
    d = HOME / '.codex' / 'sessions' / '2026' / '10' / '11'
    d.mkdir(parents=True, exist_ok=True)
    rows = [
        {"timestamp": "2026-10-11T15:00:00Z", "ordinal": 0, "type": "session_meta",
         "payload": {"session_id": sid, "id": sid,
                     "timestamp": "2026-10-11T15:00:00Z", "cwd": CWD,
                     "originator": "codex_cli", "cli_version": "0.153.0",
                     "source": "cli", "model_provider": "openai",
                     "git": {"commit_hash": "0000000", "branch": "main",
                             "repository_url": "git@github.com:example/demo.git"}}},
        {"timestamp": "2026-10-11T15:00:05Z", "ordinal": 1, "type": "response_item",
         "payload": {"type": "message", "role": "user",
                     "content": [{"type": "input_text",
                                  "text": "Set up config loading from config.json."}]}},
        {"timestamp": "2026-10-11T15:00:20Z", "ordinal": 2, "type": "response_item",
         "payload": {"type": "reasoning",
                     "summary": [{"type": "summary_text",
                                  "text": "add load_config() reading json"}]}},
        {"timestamp": "2026-10-11T15:00:30Z", "ordinal": 3, "type": "response_item",
         "payload": {"type": "function_call", "name": "shell_command",
                     "arguments": "{\"command\":\"python -m pytest -q\"}",
                     "call_id": "c1"}},
        {"timestamp": "2026-10-11T15:00:40Z", "ordinal": 4, "type": "response_item",
         "payload": {"type": "function_call_output", "call_id": "c1",
                     "output": "Exit code: 0\nWall time: 0.9s\nOutput:\n1 passed"}},
        {"timestamp": "2026-10-11T15:01:00Z", "ordinal": 5, "type": "response_item",
         "payload": {"type": "message", "role": "assistant",
                     "content": [{"type": "output_text",
                                  "text": "Config loading is in place: load_config() "
                                          "reads config.json and tests pass. "
                                          "Next: validate the keys."}]}},
    ]
    (d / ('rollout-2026-10-11T15-00-00-%s_w1.jsonl' % sid)).write_text(
        '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n',
        encoding='utf-8')
    return d


def write_claude():
    sid = 'cccccccc-1111-2222-3333-444444444444'
    d = HOME / '.claude' / 'projects' / MUNGED
    d.mkdir(parents=True, exist_ok=True)
    rows = [
        {"type": "file-history-snapshot", "messageId": "m1",
         "snapshot": {"trackedFileBackups": {CWD + '/app.py': 'h1@v1'},
                      "timestamp": "2026-10-12T09:00:00Z"},
         "isSnapshotUpdate": False},
        {"type": "user", "uuid": "u1", "parentUuid": None,
         "timestamp": "2026-10-12T09:00:00Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid, "version": "2.1.78",
         "message": {"role": "user",
                     "content": "Add a --strict flag to app.py that fails on unknown "
                                "config keys, then add a test for it."}},
        {"type": "assistant", "uuid": "a1", "parentUuid": "u1",
         "timestamp": "2026-10-12T09:00:10Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "message": {"role": "assistant", "model": "claude-sonnet",
                     "usage": {"input_tokens": 120, "output_tokens": 80,
                               "cache_read_input_tokens": 10},
                     "content": [{"type": "thinking", "thinking": "read app.py first"},
                                 {"type": "tool_use", "id": "t1", "name": "Read",
                                  "input": {"file_path": CWD + "/app.py"}}]}},
        {"type": "user", "uuid": "u2", "parentUuid": "a1",
         "timestamp": "2026-10-12T09:00:20Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "toolUseResult": {"stdout": "app.py body", "return_code": 0},
         "message": {"role": "user",
                     "content": [{"type": "tool_result", "tool_use_id": "t1",
                                  "content": "app.py body"}]}},
        {"type": "assistant", "uuid": "a2", "parentUuid": "u2",
         "timestamp": "2026-10-12T09:00:40Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "message": {"role": "assistant", "model": "claude-sonnet",
                     "content": [{"type": "tool_use", "id": "t2", "name": "Write",
                                  "input": {"file_path": CWD + "/app.py",
                                            "content": "def load_config(path='config.json', "
                                                       "strict=False): ..."}}]}},
        {"type": "user", "uuid": "u3", "parentUuid": "a2",
         "timestamp": "2026-10-12T09:00:50Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid, "toolUseResult": {"stdout": "", "return_code": 0},
         "message": {"role": "user",
                     "content": [{"type": "tool_result", "tool_use_id": "t2",
                                  "content": "file written"}]}},
        {"type": "assistant", "uuid": "a3", "parentUuid": "u3",
         "timestamp": "2026-10-12T09:01:10Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "message": {"role": "assistant", "model": "claude-sonnet",
                     "content": [{"type": "tool_use", "id": "t3", "name": "Bash",
                                  "input": {"command": "python -m pytest -q"}}]}},
        {"type": "user", "uuid": "u4", "parentUuid": "a3",
         "timestamp": "2026-10-12T09:01:20Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "toolUseResult": {"stdout": "1 failed, 1 passed", "return_code": 1},
         "message": {"role": "user",
                     "content": [{"type": "tool_result", "tool_use_id": "t3",
                                  "content": "1 failed, 1 passed"}]}},
        {"type": "assistant", "uuid": "a4", "parentUuid": "u4",
         "timestamp": "2026-10-12T09:01:30Z", "cwd": CWD, "gitBranch": "main",
         "sessionId": sid,
         "message": {"role": "assistant", "model": "claude-sonnet",
                     "content": [{"type": "text",
                                  "text": "I added --strict to load_config() and a test, "
                                          "but test_strict_rejects_unknown_keys is still "
                                          "failing: strict mode does not raise on unknown "
                                          "keys yet. TODO: raise on unknown keys in "
                                          "strict mode."}]}},
    ]
    (d / (sid + '.jsonl')).write_text(
        '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows) + '\n',
        encoding='utf-8')
    return d


if __name__ == '__main__':
    write_repo()
    c = write_codex()
    l = write_claude()
    print('root      :', ROOT)
    print('home      :', HOME)
    print('repo      :', REPO)
    print('codex     :', c)
    print('claude    :', l)
    print()
    print('Next:')
    print('  cd %s && git init -q -b main && git add -A && '
          'git -c user.email=d@e.x -c user.name=demo commit -qm "demo: initial CLI"'
          % REPO)
