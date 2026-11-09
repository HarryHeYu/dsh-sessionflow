// Answers `overview` with a fixed JSON payload read from a file, so a test can
// control exactly which rows the tool's own filtering has to sift.  Records the
// params it was asked for, like stub-echo does.
//
// Invocation is `node stub-overview.mjs <payload.json>` with the bridge's
// arguments appended, so the payload path sits in argv BEFORE the subcommand
// (`integration-info`, `api`).  Locating the subcommand by membership rather
// than by index is therefore load-bearing: indexing argv[0] would look at the
// payload path and every probe would be answered as an unknown subcommand.
import { appendFileSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const payloadPath = argv[0];

function record(line) {
  const file = process.env['SESSIONFLOW_ECHO_FILE'];
  if (!file) return;
  try {
    appendFileSync(file, line + '\n');
  } catch {
    // scratch dir may already be gone
  }
}

if (argv.includes('integration-info')) {
  process.stdout.write(JSON.stringify({
    name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
    schema_version: 1, ops: [], capabilities: [],
  }));
} else if (argv.includes('api')) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let req = {};
    try { req = JSON.parse(buf.trim() || '{}'); } catch { /* ignore */ }
    record(`${req.op}|${JSON.stringify(req.params ?? {})}`);
    let result = {};
    try { result = JSON.parse(readFileSync(payloadPath, 'utf8')); } catch { /* ignore */ }
    process.stdout.write(JSON.stringify({ id: 1, result }));
  });
} else {
  process.stdout.write('{}');
}
