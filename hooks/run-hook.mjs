#!/usr/bin/env node

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { getForgeHookNames, shouldRunForgeHook } from '../scripts/lib/forge-hook-controls.mjs';

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(HOOK_DIR);
const ALLOWED_HOOKS = new Set(getForgeHookNames());

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
  let done = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => { if (!done) { done = true; clearTimeout(t); resolve(data); } });
  const t = setTimeout(() => { if (!done) { done = true; resolve(data); } }, 3000);
});

if (!shouldRunForgeHook(hookName, process.env)) {
  process.stdout.write(`${JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSkipped: true,
    hookName,
    activeProfile: process.env.FORGE_HOOK_PROFILE || 'standard',
  })}\n`);
  process.exit(0);
}

const HOOK_SPAWN_TIMEOUT_MS = Number(process.env.FORGE_HOOK_SPAWN_TIMEOUT_MS) || 25000;

const result = spawnSync(process.execPath, [targetScript], {
  cwd: process.cwd(),
  input,
  encoding: 'utf8',
  env: process.env,
  timeout: HOOK_SPAWN_TIMEOUT_MS,
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
