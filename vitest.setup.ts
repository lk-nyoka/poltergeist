import fc from 'fast-check';

fc.configureGlobal({
  numRuns: Number(process.env['FC_NUM_RUNS'] ?? 100),
});
