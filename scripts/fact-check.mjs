#!/usr/bin/env node
// Forge Hook: PreToolUse (Write|Edit) — denies writes when the Forge harness is missing prerequisites

import { existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { readForgeState, resolvePhase } from './lib/forge-state.mjs';

async function main() {
  const input = await readStdin();
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  try {
    const phase = resolvePhase(state);

    if (phase.index < resolvePhase({ phase_id: 'develop' }).index) {
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

    if (!state.spec_approved) {
      missing.push('approved spec');
    }

    if (!state.design_approved) {
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
      console.log(JSON.stringify({
        continue: true,
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Forge guard blocked code writes during ${phase.id}. Missing prerequisites: ${missing.join(', ')}.`,
        },
      }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: '[Forge Fact Checker] Harness prerequisites are present. Verify imports, APIs, and contracts before writing.',
      },
    }));
  } catch (error) {
    handleHookError(error, 'fact-check');
  }
}

main();
