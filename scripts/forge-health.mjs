#!/usr/bin/env node

import { buildHealthReport, renderHealthText } from './lib/forge-health.mjs';

function parseArgs(argv) {
  const options = {
    audit: false,
    json: false,
    host: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--audit') {
      options.audit = true;
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--host') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --host');
      }
      options.host = value.trim();
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  process.stdout.write(`Forge health

Usage:
  node scripts/forge-health.mjs
  node scripts/forge-health.mjs --json
  node scripts/forge-health.mjs --audit
  node scripts/forge-health.mjs --host codex
`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const report = buildHealthReport({
    audit: options.audit,
    cwd: process.cwd(),
    hostId: options.host,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderHealthText(report));
  }
} catch (error) {
  process.stderr.write(`[forge health] ${error.message}\n`);
  process.exit(1);
}
