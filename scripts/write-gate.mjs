#!/usr/bin/env node
// Forge Hook: PreToolUse (Write|Edit) — adaptive, risk-based evidence gate

import { existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import {
  detectWriteRisk,
  readActiveTier,
  readForgeState,
  resolvePhase,
  tierAtLeast,
} from './lib/forge-state.mjs';

async function main() {
  const envTier = process.env.FORGE_TIER;
  if (envTier === 'off' || envTier === 'light') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  let input;
  try {
    input = await readStdin();
  } catch {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const phase = resolvePhase(state);
    const tier = readActiveTier(cwd, state, input);
    const risk = detectWriteRisk(input);
    const shouldSkipApprovalChecks = state.mode === 'repair' || state.mode === 'express';

    if (!tierAtLeast(tier, 'medium') || phase.index < resolvePhase({ phase_id: 'develop' }).index) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    if (tier === 'medium' && risk.level === 'low') {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const missing = [];
    const rulesFile = `${cwd}/.forge/code-rules.md`;
    const contractsDir = `${cwd}/.forge/contracts`;
    const evidenceDir = `${cwd}/.forge/evidence`;
    const contracts = existsSync(contractsDir)
      ? readdirSync(contractsDir).filter(file => file.endsWith('.ts'))
      : [];

    if (!shouldSkipApprovalChecks && !state.spec_approved) {
      missing.push('approved spec');
    }

    if (!shouldSkipApprovalChecks && !state.design_approved) {
      missing.push('approved design');
    }

    if (!existsSync(rulesFile)) {
      missing.push('.forge/code-rules.md');
    }

    if (contracts.length === 0) {
      missing.push('contract files in .forge/contracts/');
    }

    if (!existsSync(evidenceDir)) {
      missing.push('.forge/evidence/');
    }

    if (missing.length > 0) {
      if (tier === 'full' || risk.level === 'high') {
        console.log(JSON.stringify({
          continue: true,
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Forge ${tier} guard blocked ${risk.level}-risk write during ${phase.id}. Missing: ${missing.join(', ')}.`,
          },
        }));
        return;
      }

      console.log(JSON.stringify({
        continue: true,
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `[Forge] ${tier} ${risk.level} write (${risk.reason}) missing ${missing.join(', ')}`,
        },
      }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `[Forge] ${tier} ${risk.level} write (${risk.reason})`,
      },
    }));
  } catch (error) {
    handleHookError(error, 'write-gate', cwd);
  }
}

main();
