#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HELP_COMMANDS = new Set(['help', '--help']);
const USAGE = `Forge CLI

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
`;

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
  process.stdout.write(USAGE);
}

function fail(message) {
  process.stderr.write(`[forge] ${message}\n`);
}

function runScript(scriptName, args) {
  const result = spawnSync(process.execPath, [join(SCRIPT_DIR, scriptName), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.error) {
    return {
      status: 1,
      error: result.error.message,
    };
  }

  return {
    status: result.status ?? 1,
    error: '',
  };
}

function resolveInvocation(argv) {
  if (argv.length === 0 || HELP_COMMANDS.has(argv[0])) {
    return { kind: 'help' };
  }

  const [command, ...rest] = argv;
  if (command === 'lane') {
    const [laneCommand = 'summarize', ...laneArgs] = rest;
    return {
      kind: 'dispatch',
      scriptName: 'forge-lane-runtime.mjs',
      args: [(LANE_ALIASES.get(laneCommand) || laneCommand), ...laneArgs],
    };
  }

  const scriptName = COMMAND_SCRIPTS.get(command);
  if (!scriptName) {
    return {
      kind: 'error',
      message: `Unknown command: ${command}`,
    };
  }

  return {
    kind: 'dispatch',
    scriptName,
    args: rest,
  };
}

function main(argv) {
  const invocation = resolveInvocation(argv);

  if (invocation.kind === 'help') {
    printUsage();
    return 0;
  }

  if (invocation.kind === 'error') {
    fail(invocation.message);
    return 1;
  }

  const result = runScript(invocation.scriptName, invocation.args);
  if (result.error) {
    fail(result.error);
  }

  return result.status;
}

process.exitCode = main(process.argv.slice(2));
