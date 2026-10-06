// Version probe succeeds; every op then writes to a marker file on a fixed
// interval and never exits.  A test can therefore prove the bridge KILLS the
// child at the deadline: the marker must stop growing afterwards.
import { appendFileSync } from 'node:fs';

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
  const marker = process.env['SESSIONFLOW_TEST_MARKER'];
  setInterval(() => {
    if (!marker) return;
    try {
      appendFileSync(marker, 'x');
    } catch {
      // the parent may already have removed the scratch dir
    }
  }, 50);
}
