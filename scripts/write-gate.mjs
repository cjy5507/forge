#!/usr/bin/env node
// Forge Hook: PreToolUse (Write|Edit) — adaptive, risk-based evidence gate
// Phase gate checks are TIER-INDEPENDENT — they run even at light tier.

import { existsSync, readdirSync } from 'fs';
import { runHook } from './lib/hook-runner.mjs';
import { resolve } from 'path';
import { checkPhaseGate, resolvePhase } from './lib/forge-phases.mjs';
import { detectWriteRisk, readActiveTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { readForgeState, readRuntimeState } from './lib/forge-session.mjs';
import { resolveForgeBaseDir } from './lib/forge-io.mjs';
import { resolveRuntimeLaneContext } from './lib/forge-lanes.mjs';
import { readEnvTier } from './lib/forge-tiers.mjs';

function isCodeWritingPhase(phase) {
  if (!phase || typeof phase !== 'object') {
    return false;
  }

  if (phase.mode === 'repair') {
    return phase.index >= resolvePhase({ mode: 'repair', phase_id: 'fix' }).index;
  }

  if (phase.mode === 'express') {
    return phase.index >= resolvePhase({ mode: 'express', phase_id: 'build' }).index;
  }

  return phase.index >= resolvePhase({ mode: 'build', phase_id: 'develop' }).index;
}

function resolveForgeAwarePath(cwd = '.', filePath = '') {
  const baseDir = resolveForgeBaseDir(cwd);
  const target = String(filePath || '').trim();
  if (!target) {
    return resolve(cwd);
  }

  if (target === '.forge' || target.startsWith('.forge/')) {
    return resolve(baseDir, target);
  }

  return resolve(cwd, target);
}

function isForgeStateFile(filePath, cwd = '.') {
  if (!filePath) return false;
  const forgeDir = resolve(resolveForgeBaseDir(cwd), '.forge');
  const resolved = resolveForgeAwarePath(cwd, filePath);
  return resolved.startsWith(forgeDir + '/') || resolved === forgeDir;
}

function normalizeRefs(values) {
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

function laneRequirementLinkage(lane) {
  if (!lane || typeof lane !== 'object') {
    return { count: 0, refs: [] };
  }

  const refs = [
    ...normalizeRefs(lane.requirement_refs),
    ...normalizeRefs(lane.acceptance_refs),
  ];

  return {
    count: refs.length,
    refs,
  };
}

function resolveIntentLane(runtime, cwd) {
  const current = resolveRuntimeLaneContext(runtime, cwd, cwd);
  if (current.lane) {
    return current.lane;
  }

  const nextLaneId = typeof runtime?.next_lane === 'string' ? runtime.next_lane : '';
  if (nextLaneId && runtime?.lanes?.[nextLaneId]) {
    return runtime.lanes[nextLaneId];
  }

  return null;
}

runHook(async (input) => {
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

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
  const runtime = readRuntimeState(cwd);

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
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const shouldSkipApprovalChecks = state.mode === 'repair' || state.mode === 'express';

  if (!tierAtLeast(tier, 'medium') || !isCodeWritingPhase(phase)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  if (tier === 'medium' && risk.level === 'low') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const missing = [];
  const forgeBaseDir = resolveForgeBaseDir(cwd);
  const rulesFile = resolve(forgeBaseDir, '.forge', 'code-rules.md');
  const contractsDir = resolve(forgeBaseDir, '.forge', 'contracts');
  const evidenceDir = resolve(forgeBaseDir, '.forge', 'evidence');
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

  if (!isForgeStateFile(filePath, cwd)) {
    const activeLane = resolveIntentLane(runtime, cwd);
    const linkage = laneRequirementLinkage(activeLane);

    if (activeLane && linkage.count === 0) {
      const reason = `Forge intent guard: lane "${activeLane.id}" has no requirement linkage. Add requirement_refs or acceptance_refs before continuing implementation.`;
      if (risk.level === 'high') {
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
          additionalContext: `[Forge] intent warning: ${reason}`,
        },
      }));
      return;
    }
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `[Forge] ${tier} ${risk.level} write (${risk.reason})`,
    },
  }));
}, { name: 'write-gate' });
