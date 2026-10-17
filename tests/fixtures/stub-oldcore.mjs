// A stand-in for a core that IS installed and DOES answer, but is too old.
//
// `integration-info` succeeds and reports a schema_version below the one this
// plugin needs.  This is the case the resolver used to flatten into
// VOYAGER_NOT_FOUND: the binary exists and runs, so telling the user "not
// installed" is false and sends them to reinstall something they already have.
//
// Everything else exits 0 with an empty object, so a caller that ignores the
// schema still gets well-formed JSON rather than a crash.
const arg = process.argv[2] ?? '';
if (arg === 'integration-info') {
  process.stdout.write(JSON.stringify({
    schema_version: 0,
    name: 'sessionFlow',
    package: 'voyager',
    version: '1.0.0',
    ops: ['bundle_preview', 'continue_context'],
  }) + '\n');
} else {
  process.stdout.write('{}\n');
}
