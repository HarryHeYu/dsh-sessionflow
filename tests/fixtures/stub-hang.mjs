// Version probe succeeds; every op then hangs, so a test can prove the
// per-call deadline kills the child instead of blocking forever.
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
  // A pending timer keeps the process (and its pipes) alive until killed.
  setTimeout(() => { /* never reached: the bridge kills the child */ }, 60_000);
}
