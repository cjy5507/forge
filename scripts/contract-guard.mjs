#!/usr/bin/env node
// Forge Hook: PostToolUse (Write|Edit) — adaptive contract reminder

import { existsSync, readdirSync, readFileSync } from 'fs';
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
  const contractsDir = join(cwd, '.forge', 'contracts');

  if (!tierAtLeast(tier, 'medium') || (tier === 'medium' && risk.level === 'low')) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (!existsSync(contractsDir)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const contracts = readdirSync(contractsDir).filter(file =>
    file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.mjs') || file.endsWith('.zod')
  );
  if (contracts.length === 0) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const filePath = input?.tool_input?.file_path;
  let typeError = '';

  if (filePath && existsSync(join(cwd, filePath))) {
    const pkgPath = join(cwd, 'package.json');
    const tsConfigPath = join(cwd, 'tsconfig.json');
    
    if (existsSync(pkgPath) || existsSync(tsConfigPath)) {
      try {
        let hasTypecheck = false;
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts && pkg.scripts.typecheck) {
            hasTypecheck = true;
          }
        }

        const cmd = hasTypecheck ? 'npm' : 'npx';
        const args = hasTypecheck ? ['run', 'typecheck'] : ['tsc', '--noEmit'];
        
        // Only run tsc if tsconfig exists or typecheck script exists
        if (hasTypecheck || existsSync(tsConfigPath)) {
          const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
          if (result.status !== 0) {
            const output = result.stdout || result.stderr || '';
            // Only report if the error mentions the edited file to avoid blocking on unrelated errors
            if (output.includes(filePath)) {
              typeError = output;
            }
          }
        }
      } catch (err) {
        // ignore JSON parse or spawn errors
      }
    }
  }

  if (typeError) {
    console.log(JSON.stringify({
      continue: false,
      stopReason: `[Contract Guard] Type error introduced in ${filePath}:\n${typeError}`
    }));
    return;
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[Forge] contracts ${tier} ${risk.level} → ${contracts.join(', ')}`,
    },
  }));
}, { name: 'contract-guard' });
