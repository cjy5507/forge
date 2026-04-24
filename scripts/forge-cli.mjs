#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const COMMANDS = {
  analytics: 'forge-analytics.mjs',
  analyze: 'forge-lane-runtime.mjs',
  continue: 'forge-continue.mjs',
  eval: 'forge-eval.mjs',
  health: 'forge-health.mjs',
  info: 'forge-status.mjs',
  status: 'forge-status.mjs',
  verification: 'forge-verification.mjs',
};

function printUsage() {
  process.stdout.write(`Forge CLI

Usage:
  forge <command> [args]

Commands:
  info, status       Show current Forge status
  continue           Build resume context from .forge state
  health             Inspect host/runtime health
  analytics          Summarize saved artifact trail
  eval               Generate a harness scorecard
  verification       Inspect latest verification artifact
  analyze            Use lane-runtime analysis helpers
`);
}

const [command = '', ...args] = process.argv.slice(2);

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(0);
}

const script = COMMANDS[command];
if (!script) {
  process.stderr.write(`[forge] unknown command: ${command}\n`);
  printUsage();
  process.exit(1);
}

const forwardedArgs = command === 'analyze' ? ['analysis-status', ...args] : args;
const result = spawnSync(process.execPath, [join(SCRIPT_DIR, script), ...forwardedArgs], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
