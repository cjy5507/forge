#!/usr/bin/env node

import { readRuntimeState } from './lib/forge-session.mjs';
import { renderRecoverySummary } from './lib/forge-recovery.mjs';

const options = {
  json: process.argv.includes('--json'),
};

const runtime = readRuntimeState(process.cwd());
const recovery = runtime?.recovery || { latest: null, active: [] };

if (options.json) {
  process.stdout.write(`${JSON.stringify(recovery, null, 2)}\n`);
} else {
  const lines = [
    `Recovery status: ${recovery.latest?.status || '(none)'}`,
    `Active recovery items: ${Array.isArray(recovery.active) ? recovery.active.length : 0}`,
  ];

  if (recovery.latest) {
    lines.push(`Latest: ${renderRecoverySummary(recovery.latest)}`);
    if (recovery.latest.suggested_command) {
      lines.push(`Retry command: ${recovery.latest.suggested_command}`);
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}
