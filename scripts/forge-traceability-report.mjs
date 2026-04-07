#!/usr/bin/env node

import { renderTraceabilityMarkdown, readTraceabilitySnapshot, summarizeTraceability } from './lib/forge-traceability.mjs';

const args = process.argv.slice(2);
const cwd = process.cwd();
const format = args.includes('--markdown') ? 'markdown' : 'json';

const snapshot = readTraceabilitySnapshot(cwd);

if (!snapshot) {
  process.stderr.write('[forge traceability] Missing or invalid .forge/traceability.json\n');
  process.exit(1);
}

const summary = summarizeTraceability(snapshot);

if (format === 'markdown') {
  process.stdout.write(`${renderTraceabilityMarkdown(summary)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
