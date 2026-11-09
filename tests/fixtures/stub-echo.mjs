// Records the op and params it was asked for (into SESSIONFLOW_ECHO_FILE) and
// returns a superset response that every tool can parse.  A test can then prove
// which core op each tool forwards, regardless of the tool's post-processing.
import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);

function record(line) {
  const file = process.env['SESSIONFLOW_ECHO_FILE'];
  if (!file) return;
  try {
    appendFileSync(file, line + '\n');
  } catch {
    // scratch dir may already be gone
  }
}

function reply(result) {
  process.stdout.write(JSON.stringify({ id: 1, result }));
}

if (argv[0] === 'integration-info') {
  // The version probe parses stdout directly as the info object (it is a CLI
  // call, not a bridge op), so this one is NOT wrapped in an id/result envelope.
  process.stdout.write(JSON.stringify({
    name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
    schema_version: 1, ops: [], capabilities: [],
  }));
} else if (argv[0] === 'api') {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let req = {};
    try { req = JSON.parse(buf.trim() || '{}'); } catch { /* ignore */ }
    record(`${req.op}|${JSON.stringify(req.params ?? {})}`);
    // a superset of every shape the six tools read
    reply({
      op: req.op, params: req.params,
      stats: {}, threads: [], recent_sessions: [],
      bundle: '', count: 0, results: [], scope: [],
      has_thread: false,
    });
  });
} else {
  // a subcommand call such as `merge <options> --json -- <ids>`
  //
  // `--json` is now placed BEFORE the `--` separator rather than at the end of
  // argv (after the separator argparse would read it as a positional session
  // id).  Recording or slicing by POSITION would therefore drop a session id,
  // so the identity flag is filtered out by value and the `--` separator is
  // kept, which is what makes the recorded shape legible in a failure message.
  record(`${argv[0]}|${JSON.stringify(argv.filter((a) => a !== '--json'))}`);
  // A subcommand's `--json` output is a BARE payload, not an id/result
  // envelope: `_handoff_via_engine` does `print(json.dumps(payload))` directly
  // (cli.py).  Only the `api` op wraps its answer.  This stub used to wrap
  // both, which is why nothing here ever noticed that the subcommand branch
  // answered with a shape the real core cannot produce.
  process.stdout.write(JSON.stringify({
    action: 'bundle', context: '', thread_id: 'stub-thread',
    scope: null, style: 'continuation', context_chars: 0, member_count: 1,
    warnings: [], error: null, bundle_path: null, argv,
  }));
}
