// A stand-in for the Core's `voyager api` stdio surface, for the
// `sessionflow_evidence_verify` contract tests.
//
// Shape is NOT invented: `voyager/api.py::evidence_verify` returns
// `evidence.verify(...)` verbatim as `{id, result}`, and `verify()` builds the
// dict whose keys are status / exit_code / session_id / seq / digest /
// found_digest / source_available / message (plus a few extra keys for found
// sessions). The CLI prints the same dict minus `session`. The scenario file
// simply carries that dict, so the fixture cannot quietly drift from the Core.
//
// Every spawn — including the `integration-info` discovery probe — appends a
// line to SESSIONFLOW_EVIDENCE_RECORD. That is what lets a test prove a bad
// reference was refused BEFORE anything was spawned (an empty record).
import { appendFileSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);

function record(line) {
  const file = process.env['SESSIONFLOW_EVIDENCE_RECORD'];
  if (!file) return;
  try { appendFileSync(file, line + '\n'); } catch { /* scratch dir may be gone */ }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj));
}

record('spawn:' + (argv[0] ?? ''));

if (argv[0] === 'integration-info') {
  // `runJson(['integration-info'])` parses stdout as a BARE info object.
  send({ name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
    schema_version: 1, ops: ['evidence_verify'], capabilities: ['evidence_verify'] });
} else if (argv[0] === 'api') {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    let req = {};
    try { req = JSON.parse(buf.trim() || '{}'); } catch { /* ignore */ }
    record('api:' + (req.op ?? '') + '|' + JSON.stringify(req.params ?? {}));
    const file = process.env['SESSIONFLOW_EVIDENCE_RESULT_FILE'];
    const scenario = JSON.parse(readFileSync(file, 'utf8'));
    // An older Core that lacks the op answers an error envelope, not a result.
    if (scenario && typeof scenario.error === 'string') {
      send({ id: 1, error: scenario.error });
    } else {
      send({ id: 1, result: scenario });
    }
  });
} else {
  send({});
}
