// A stand-in for a configured `voyagerBin` that does not work.
//
// Every command — including the `integration-info` version probe — exits
// non-zero, so the bridge must reject this candidate.  Used to prove that a
// *configured* core which fails is reported by name instead of being silently
// swapped for another `voyager` found on PATH.
process.stderr.write('voyager: this configured core does not work\n');
process.exitCode = 127;
