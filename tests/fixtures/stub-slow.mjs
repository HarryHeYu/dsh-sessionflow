// Version probe succeeds, but slowly: the reply is delayed by
// SESSIONFLOW_TEST_DELAY_MS (default 2000).  A test uses this to prove the
// discovery probe has its own budget — a short per-call deadline must not make
// discovery fail, or a loaded machine reports a core that is installed and
// working as "not installed".
const delayMs = Number(process.env['SESSIONFLOW_TEST_DELAY_MS'] ?? '2000');
const argv = process.argv.slice(2);

setTimeout(() => {
  if (argv[0] === 'integration-info') {
    process.stdout.write(JSON.stringify({
      name: 'sessionFlow',
      package: 'voyager',
      version: '0.0.0-stub',
      schema_version: 1,
      ops: [],
      capabilities: [],
    }));
  } else {
    process.stdout.write(JSON.stringify({ ok: true }) + '\n');
  }
}, delayMs);
