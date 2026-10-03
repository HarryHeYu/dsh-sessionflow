// Answers the version probe honestly, then returns non-JSON for any op — so a
// test can prove `callOp` rejects garbage instead of leaking a parse error.
//
// Nothing calls process.exit(): on Windows that can truncate a pending pipe
// write, which would make the probe itself flaky.
const argv = process.argv.slice(2);

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
  process.stdout.write('this is not json');
}
