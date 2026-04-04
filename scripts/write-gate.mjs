#!/usr/bin/env node
// Forge Hook: PreToolUse (Write|Edit) — adaptive, risk-based evidence gate
// Phase gate checks are TIER-INDEPENDENT — they run even at light tier.

import { existsSync, readdirSync } from 'fs';
import { readStdin } from './lib/stdin.mjs';
import { handleHookError } from './lib/error-handler.mjs';
import { resolve } from 'path';
import {
  checkPhaseGate,
  detectWriteRisk,
  readActiveTier,
  readForgeState,
  resolveForgeBaseDir,
  resolvePhase,
  tierAtLeast,
} from './lib/forge-state.mjs';

// Phase index at which "writing code" begins — tier-based artifact checks
// (spec, design, contracts) only apply at or past this threshold.
const CODE_WRITING_THRESHOLD = resolvePhase({ phase_id: 'develop' }).index;

function isForgeStateFile(filePath, cwd = '.') {
  if (!filePath) return false;
  const forgeDir = resolve(resolveForgeBaseDir(cwd), '.forge');
  const resolved = resolve(cwd, filePath);
  return resolved.startsWith(forgeDir + '/') || resolved === forgeDir;
}

async function main() {
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
    const filePath = String(
      input?.tool_input?.file_path ||
      input?.tool_input?.path ||
      input?.tool_input?.target_file ||
      input?.tool_input?.file ||
      '',
    );

    // ── Phase checks (TIER-INDEPENDENT) ──
    // Runs at ALL tiers including light. Skips only for .forge/ state files.
    if (!isForgeStateFile(filePath, cwd)) {
      // Mode-phase mismatch — check first since it's more fundamental
      if (phase.mismatch) {
        console.log(JSON.stringify({
          continue: true,
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Forge phase mismatch: "${phase.id}" is not in the ${phase.mode} sequence. Fix .forge/state.json before writing code.`,
          },
        }));
        return;
      }

      // Phase gate check
      const gateResult = checkPhaseGate(cwd, phase.id, phase.mode);
      if (!gateResult.canAdvance) {
        console.log(JSON.stringify({
          continue: true,
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Forge phase gate: ${phase.id} requires [${gateResult.missing.join(', ')}]. Create these artifacts before writing code.`,
          },
        }));
        return;
      }
    }

    // ── Tier-based checks (existing behavior) ──
    const envTier = (process.env.FORGE_TIER || '').toLowerCase();
    if (envTier === 'off') {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const shouldSkipApprovalChecks = state.mode === 'repair' || state.mode === 'express';

    if (!tierAtLeast(tier, 'medium') || phase.index < CODE_WRITING_THRESHOLD) {
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
      ? readdirSync(contractsDir).filter(file =>
          file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.mjs') || file.endsWith('.zod')
        )
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
        let reason = `Forge ${tier} guard blocked ${risk.level}-risk write during ${phase.id}. Missing: ${missing.join(', ')}.`;
        if (contracts.length > 0) {
          reason += ` Check .forge/contracts/ for interface definitions before implementing (${contracts.join(', ')}).`;
        }
        console.log(JSON.stringify({
          continue: true,
          suppressOutput: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
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
