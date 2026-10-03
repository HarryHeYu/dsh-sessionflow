// Version probe succeeds; every other command exits non-zero, so a test can
// prove a CLI failure is reported with its exit code and stderr.
//
// `process.exitCode` (not process.exit) so stderr flushes before exit.
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
  process.stderr.write('voyager: simulated failure\n');
  process.exitCode = 3;
}
