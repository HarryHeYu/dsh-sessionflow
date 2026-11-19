// A core that answers the version probe with non-JSON but exits 0.
//
// This is not a missing executable: the program was found and ran, so the
// resolver must report a protocol/configuration problem (BAD_JSON, found=true)
// instead of telling the user to install the core again.
process.stdout.write('this is not integration-info json\n');
