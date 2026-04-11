#!/usr/bin/env node

import { buildForgeAnalyticsReport, renderForgeAnalyticsText } from './lib/forge-metrics.mjs';

function parseArgs(argv) {
  const options = {
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  process.stdout.write(`Forge analytics

Usage:
  node scripts/forge-analytics.mjs
  node scripts/forge-analytics.mjs --json
`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const report = buildForgeAnalyticsReport(process.cwd());
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderForgeAnalyticsText(report));
  }
} catch (error) {
  process.stderr.write(`[forge analytics] ${error.message}\n`);
  process.exit(1);
}
