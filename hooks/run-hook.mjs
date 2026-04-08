#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(HOOK_DIR);
const ALLOWED_HOOKS = new Set([
  'code-rules-guard',
  'context-manager',
  'contract-guard',
  'phase-detector',
  'session-end',
  'state-restore',
  'stop-failure',
  'stop-guard',
  'subagent-start',
  'subagent-stop',
  'tool-failure',
  'write-gate',
]);

function fail(message) {
  process.stderr.write(`[forge hooks] ${message}\n`);
  process.exit(1);
}

const hookName = String(process.argv[2] || '').trim();
if (!ALLOWED_HOOKS.has(hookName)) {
  fail(`Unknown hook: ${hookName || '(empty)'}`);
}

const targetScript = join(ROOT_DIR, 'scripts', `${hookName}.mjs`);
const input = process.stdin.isTTY ? '' : await new Promise((resolve) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
});

const result = spawnSync(process.execPath, [targetScript], {
  cwd: process.cwd(),
  input,
  encoding: 'utf8',
  env: process.env,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  fail(result.error.message);
}

process.exit(result.status ?? 1);
