// Records every invocation into SESSIONFLOW_ECHO_FILE, including the
// `integration-info` probe, and answers compatibly.  A test uses this to count
// how many times the bridge actually spawned a candidate — which is how
// "concurrent calls share one probe" is proven rather than asserted.
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

if (argv[0] === 'integration-info') {
  record('probe');
  process.stdout.write(JSON.stringify({
    name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
    schema_version: 1, ops: [], capabilities: [],
  }));
} else {
  record('call');
  process.stdout.write(JSON.stringify({ id: 1, result: { ok: true } }) + '\n');
}
