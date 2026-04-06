#!/usr/bin/env node
// Forge Hook: SessionStart — restores .forge/ state and injects compact adaptive context
//
// Host compatibility: Handles the SessionStart event.  On hosts that do not
// fire SessionStart (or send no stdin payload), readStdin() rejects and the
// catch block returns { continue: true } — state is not restored for that
// session but nothing is written or corrupted.
//
// The hookSpecificOutput response field (used to inject additionalContext) is a
// Claude Code convention.  On other hosts this field is silently ignored if the
// host does not understand it.

import { runHook } from './lib/hook-runner.mjs';
import { buildStatusModel, renderStatusText } from './lib/forge-status.mjs';
import {
  compactForgeContext,
  readForgeState,
  readRuntimeState,
  resolvePhase,
  selectResumeSkill,
  updateHudLine,
  updateRuntimeState,
  writeForgeState,
} from './lib/forge-state.mjs';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

function getStalenessMs(runtime) {
  const timestamp = runtime?.stats?.last_finished_at || runtime?.updated_at;
  if (!timestamp) return Infinity;
  const elapsed = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : Infinity;
}

function getStaleTier(elapsedMs) {
  const threshold = Number(process.env.FORGE_STALE_THRESHOLD_MS);
  const staleMs = Number.isFinite(threshold) && threshold > 0 ? threshold : TWENTY_FOUR_HOURS_MS;
  if (elapsedMs < ONE_HOUR_MS) return 'fresh';
  if (elapsedMs < staleMs) return 'warm';
  return 'stale';
}

function abbreviatedContext(state, runtime) {
  const phase = resolvePhase(state);
  const lanes = Object.values(runtime?.lanes || {});
  const activeLanes = lanes.filter(l => l.status !== 'done' && l.status !== 'merged');
  const laneHint = activeLanes.length ? ` ${activeLanes.length} active lane(s)` : '';
  return `[Forge] ${phase.id} ${phase.index}/${phase.sequence.length - 1}${laneHint} — use 'forge continue' to resume`;
}

// HUD update is now handled by the shared updateHudLine() from forge-state.mjs

runHook(async (input) => {
  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const normalized = writeForgeState(cwd, state);
  const nextRuntime = updateRuntimeState(cwd, current => {
    const withStats = {
      ...current,
      active_tier: normalized.tier,
      stats: {
        ...(current.stats || {}),
        started_at: (current.stats || {}).started_at || normalized.created_at || new Date().toISOString(),
        session_count: ((current.stats || {}).session_count || 0) + 1,
      },
    };

    const elapsedMs = getStalenessMs(withStats);
    const staleTier = getStaleTier(elapsedMs);

    let context;
    if (staleTier === 'stale') {
      context = "[Forge] Inactive project detected. Run 'forge continue' or 'forge cancel'.";
    } else if (staleTier === 'warm') {
      context = abbreviatedContext(normalized, withStats);
    } else {
      context = compactForgeContext(normalized, withStats);
    }

    return {
      ...withStats,
      last_compact_context: context,
    };
  });

  const elapsedMs = getStalenessMs(nextRuntime);
  const staleTier = getStaleTier(elapsedMs);

  try { updateHudLine(normalized, nextRuntime, staleTier); } catch { /* HUD not installed */ }

  // For fresh and warm sessions, auto-dispatch the best resume skill
  let additionalContext = nextRuntime.last_compact_context;
  if (staleTier === 'fresh' || staleTier === 'warm') {
    const resume = selectResumeSkill(normalized, nextRuntime);
    const resumeSkill = resume.skill || 'continue';
    if (resumeSkill === 'info') {
      additionalContext = `${renderStatusText(buildStatusModel({
        cwd,
        state: normalized,
        runtime: nextRuntime,
      })).trim()}

[Forge] Canonical status surface from scripts/forge-status.mjs`;
    }
    const warmNote = staleTier === 'warm'
      ? '\nResume from the saved handoff first, then continue the current phase from that context.'
      : '';
    const resumeReason = resume.reason ? `\nReason: ${resume.reason}` : '';
    additionalContext = `${additionalContext}

[MAGIC KEYWORD: FORGE:${resumeSkill.toUpperCase()}]

You MUST invoke the skill using the Skill tool:
Skill: forge:${resumeSkill}

IMPORTANT: Invoke the skill IMMEDIATELY to resume the Forge pipeline. Do not ask the user — the project is ready to continue.${warmNote}${resumeReason}`;
  }

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  }));
}, { name: 'state-restore' });
