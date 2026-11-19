// Reproduces V05: a syntactically valid bridge answer followed by a non-zero
// exit. The real `voyager api` exits 0 on every normal path, so this wrapper is
// the only way to make the abnormal contract deterministic in a unit test.
const argv = process.argv.slice(2);

if (argv[0] === 'integration-info') {
  process.stdout.write(JSON.stringify({
    name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
    schema_version: 1, ops: ['api'], capabilities: [],
  }) + '\n');
} else if (argv[0] === 'api') {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => {
    try { JSON.parse(buf.trim() || '{}'); } catch { /* still answer, then fail */ }
    process.stdout.write(JSON.stringify({ id: 1, result: { ok: true } }) + '\n');
    process.exitCode = 3;
  });
} else {
  process.stdout.write('{}\n');
}
