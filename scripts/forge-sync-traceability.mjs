#!/usr/bin/env node

import { syncTraceabilitySnapshot } from './lib/forge-traceability-sync.mjs';

const result = syncTraceabilitySnapshot(process.cwd());

if (!result) {
  process.stderr.write('[forge traceability] Missing .forge/traceability.json; nothing to sync\n');
  process.exit(1);
}

process.stdout.write('.forge/traceability.json\n');
