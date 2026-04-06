#!/usr/bin/env node

import { buildStatusModel, renderStatusText } from './lib/forge-status.mjs';

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    verbose: argv.includes('--verbose') || argv.includes('--detail') || argv.includes('--detailed'),
  };
}

const options = parseArgs(process.argv.slice(2));
const model = buildStatusModel({ cwd: process.cwd() });

if (options.json) {
  console.log(JSON.stringify(model || {
    project: '',
    next_action: {},
  }, null, 2));
} else {
  process.stdout.write(renderStatusText(model, { verbose: options.verbose }));
}
