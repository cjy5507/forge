#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const COMMAND_SCRIPTS = new Map([
  ['analytics', 'forge-analytics.mjs'],
  ['continue', 'forge-continue.mjs'],
  ['eval', 'forge-eval.mjs'],
  ['health', 'forge-health.mjs'],
  ['info', 'forge-status.mjs'],
  ['recovery', 'forge-recovery.mjs'],
  ['setup', 'setup-plugin.mjs'],
  ['status', 'forge-status.mjs'],
  ['verification', 'forge-verification.mjs'],
  ['worktree', 'forge-worktree.mjs'],
]);

const LANE_ALIASES = new Map([
  ['analysis-status', 'analysis-status'],
  ['assign', 'assign-owner'],
  ['decompose', 'auto-decompose'],
  ['gate', 'set-company-gate'],
  ['handoff', 'write-handoff'],
  ['init', 'init-lane'],
  ['merge', 'mark-merge-state'],
  ['review', 'mark-review-state'],
  ['session', 'set-session-brief'],
  ['session-handoff', 'write-session-handoff'],
  ['status', 'update-lane-status'],
  ['summarize', 'summarize-lanes'],
]);

function printUsage() {
  process.stdout.write(`Forge CLI

Usage:
  forge analytics [--json]
  forge status [--json|--verbose]
  forge verification [--json]
  forge recovery [--json]
  forge continue [--json]
  forge health [--json] [--host <id>]
  forge lane summarize [--json]
  forge lane analysis-status [--json]
  forge worktree <args...>
  forge eval <args...>
  forge setup <args...>
  forge help
`);
}

function fail(message) {
  process.stderr.write(`[forge] ${message}\n`);
  process.exit(1);
}

function dispatch(scriptName, args) {
  const result = spawnSync(process.execPath, [join(SCRIPT_DIR, scriptName), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.error) {
    fail(result.error.message);
  }

  process.exit(result.status ?? 1);
}

function main(argv) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    printUsage();
    return;
  }

  const [command, ...rest] = argv;
  if (command === 'lane') {
    const [laneCommand = 'summarize', ...laneArgs] = rest;
    const normalized = LANE_ALIASES.get(laneCommand) || laneCommand;
    dispatch('forge-lane-runtime.mjs', [normalized, ...laneArgs]);
    return;
  }

  const scriptName = COMMAND_SCRIPTS.get(command);
  if (!scriptName) {
    fail(`Unknown command: ${command}`);
  }

  dispatch(scriptName, rest);
}

main(process.argv.slice(2));
