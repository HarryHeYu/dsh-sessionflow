// Simulates a CORE OLDER THAN the one that added `merge --repo`.
// The version probe succeeds, but `merge` with --repo is rejected the way
// argparse rejects an unknown flag: exit 2 with "unrecognized arguments".
// This is the real signal the plugin must turn into INCOMPATIBLE, not a
// VOYAGER_NOT_FOUND and not a silently dropped repo.
const argv = process.argv.slice(2);

if (argv[0] === 'integration-info') {
  process.stdout.write(JSON.stringify({
    name: 'sessionFlow', package: 'voyager', version: '1.5.0',
    schema_version: 1, ops: ['merge'], capabilities: ['merge'],
  }));
} else if (argv.includes('--repo') || argv.some((a) => a.startsWith('--repo='))) {
  process.stderr.write('voyager: error: unrecognized arguments: ' +
    (argv.find((a) => a.startsWith('--repo=')) || '--repo') + '\n');
  process.exitCode = 2;
} else {
  // Without --repo the old core answers normally (proves old behaviour intact).
  process.stdout.write(JSON.stringify({
    action: 'bundle', context: 'old core ok', thread_id: 't', scope: null,
    style: 'continuation', context_chars: 0, member_count: 1,
    warnings: [], error: null, bundle_path: null, argv,
  }));
}
