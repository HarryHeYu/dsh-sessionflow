// A core that answers valid JSON but omits schema_version.
//
// The program exists and answered, so this is an INCOMPATIBLE protocol
// response, not VOYAGER_NOT_FOUND.
process.stdout.write(JSON.stringify({
  name: 'sessionFlow', package: 'voyager', version: '0.0.0-stub',
  ops: [], capabilities: [],
}) + '\n');
