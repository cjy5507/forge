#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — full-tier code-rules reminder

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { runHook } from './lib/hook-runner.mjs';
import { detectWriteRisk, readActiveTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { readForgeState } from './lib/forge-session.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);
  const tier = readActiveTier(cwd, state, input);
  const risk = detectWriteRisk(input);

  if (!tierAtLeast(tier, 'full') || risk.level === 'low') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const rulesFile = join(cwd, '.forge', 'code-rules.md');
  if (!existsSync(rulesFile)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const filePath = input?.tool_input?.file_path;
  let validationError = '';

  if (filePath && existsSync(join(cwd, filePath))) {
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.lint) {
          const result = spawnSync('npm', ['run', 'lint', '--', filePath], { cwd, encoding: 'utf8', stdio: 'pipe' });
          if (result.status !== 0) {
            validationError = result.stdout || result.stderr || 'Linter check failed';
          }
        }
      } catch (err) {
        // ignore JSON parse or spawn errors
      }
    }
  }

  if (validationError) {
    console.log(JSON.stringify({
      continue: false,
      stopReason: `[Code Rules Guard] Linter failed for ${filePath}. Fix the issues:\n${validationError}`
    }));
    return;
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[Forge] rules full ${risk.level} → re-check .forge/code-rules.md`,
    },
  }));
}, { name: 'code-rules-guard' });
