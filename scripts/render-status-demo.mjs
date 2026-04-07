#!/usr/bin/env node
/**
 * Renders the forge status dashboard for each fixture file.
 * Used for demo preparation and output quality review.
 *
 * Usage: node scripts/render-status-demo.mjs [fixture-name]
 *   Without args: renders all fixtures
 *   With arg: renders only the named fixture (e.g. "blocker-active")
 */

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { compactForgeContext, normalizeRuntimeState, summarizePendingWork, selectContinuationTarget } from './lib/forge-session.mjs';
import { selectNextLane, summarizeLaneBriefs, summarizeLaneCounts, normalizeLane, normalizeRuntimeLanes } from './lib/forge-lanes.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url).pathname;
const PHASE_LABELS = {
  intake: 'Intake', discovery: 'Discovery', design: 'Design',
  plan: 'Plan', develop: 'Development', qa: 'QA', security: 'Security',
  fix: 'Fix Loop', delivery: 'Delivery', isolate: 'Isolation',
  diagnose: 'Diagnosis', complete: 'Complete',
};

function progressBar(ratio, width = 20) {
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function phaseProgress(phaseIndex, total, runtime) {
  const ranges = { 0: [0, 12], 1: [12, 25], 2: [25, 40], 3: [40, 55], 4: [55, 70], 5: [70, 80], 6: [80, 90], 7: [90, 100] };
  const range = ranges[Math.min(phaseIndex, 7)] || [0, 100];
  let pct = range[0];

  // Refine within the develop phase by lane completion.
  if (phaseIndex === 4 && runtime) {
    const counts = summarizeLaneCounts(runtime);
    if (counts.total > 0) {
      const doneRatio = (counts.done + counts.merged) / counts.total;
      pct = range[0] + Math.round((range[1] - range[0]) * doneRatio);
    }
  }

  return pct;
}

function renderDashboard(name, data) {
  const state = data.state;
  const runtime = normalizeRuntimeState(data.runtime, { state });
  const phase = resolvePhase(state);
  const mode = state.mode === 'repair' ? 'repair' : 'build';
  const total = 8; // max phases
  const pct = phaseProgress(phase.index, total, runtime);
  const phaseName = PHASE_LABELS[phase.id] || phase.id;
  const counts = summarizeLaneCounts(runtime);
  const nextLane = selectNextLane(runtime);
  const cont = selectContinuationTarget(state, runtime);
  const nextAction = runtime?.next_action || {};
  const customerBlockers = Array.isArray(runtime?.customer_blockers) ? runtime.customer_blockers : [];
  const internalBlockers = Array.isArray(runtime?.internal_blockers) ? runtime.internal_blockers : [];

  // Actionable summary (first-match priority)
  let actionLine = nextAction.summary ? `Next action: ${nextAction.summary}` : '';
  let supportLine = '';
  if (customerBlockers.length) {
    supportLine = `Waiting on you: ${customerBlockers[0]}`;
    actionLine = actionLine || supportLine;
  } else if (internalBlockers.length) {
    supportLine = `Blocked: ${internalBlockers[0]} (owner: ${runtime?.active_gate_owner || 'unknown'})`;
    actionLine = actionLine || supportLine;
  } else if (runtime?.delivery_readiness === 'ready_for_review') {
    supportLine = 'Ready for review — run `forge deliver` to finalize';
    actionLine = actionLine || supportLine;
  } else if (counts.in_progress > 0) {
    const activeNames = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}))
      .filter(l => l.status === 'in_progress')
      .map(l => l.id);
    supportLine = `Active: ${activeNames.join(', ')}. Next: continue ${cont.target || 'current phase'}`;
    actionLine = actionLine || supportLine;
  } else if (nextLane) {
    supportLine = `Next: pick up ${nextLane}`;
    actionLine = actionLine || supportLine;
  } else {
    supportLine = `Phase ${phaseName} in progress`;
    actionLine = actionLine || supportLine;
  }

  // Lane detail lines
  const laneLines = [];
  if (counts.total > 0) {
    const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}))
      .filter(l => l.status !== 'done' && l.status !== 'merged');
    for (const lane of lanes) {
      const lastNote = lane.handoff_notes?.[lane.handoff_notes.length - 1];
      const noteText = lastNote?.note ? ` — "${lastNote.note}"` : '';
      let detail;
      if (lane.status === 'blocked') {
        detail = `  ${lane.id} (${lane.owner_role || '?'}, blocked) — ${lane.blocked_reason || 'no reason'}`;
      } else {
        detail = `  ${lane.id} (${lane.owner_role || '?'}, ${lane.status})${noteText}`;
      }
      // Truncate to fit dashboard width
      laneLines.push(detail.length > 58 ? detail.slice(0, 57) + '…' : detail);
    }
  }

  // Issue counts (from state if available)
  const holes = data.artifacts?.holes?.length || state.holes?.length || 0;

  // Truncate action line to fit dashboard
  if (actionLine.length > 58) actionLine = actionLine.slice(0, 57) + '…';
  if (supportLine.length > 58) supportLine = supportLine.slice(0, 57) + '…';

  const lines = [
    `Forge: ${state.project || 'unknown'} (${mode})`,
    `Phase ${phase.index}/${total} — ${phaseName}`,
    `${progressBar(pct / 100)} ${pct}%`,
    '',
    actionLine,
  ];

  if (supportLine && supportLine !== actionLine) {
    lines.push(supportLine);
  }

  if (counts.total > 0) {
    const doneCount = counts.done + counts.merged;
    let laneSummary = `Lanes: ${doneCount}/${counts.total} done`;
    if (counts.blocked) laneSummary += `, ${counts.blocked} blocked`;
    lines.push('', laneSummary);
    lines.push(...laneLines);
  }

  if (holes > 0) {
    lines.push(`Issues: ${holes} tracked`);
  }

  console.log(`\n╔${'═'.repeat(62)}╗`);
  console.log(`║  FIXTURE: ${name.padEnd(50)} ║`);
  console.log(`╠${'═'.repeat(62)}╣`);
  for (const line of lines) {
    console.log(`║  ${line.padEnd(60)}║`);
  }
  console.log(`╚${'═'.repeat(62)}╝`);

  // Also show the compact hook line for comparison
  console.log(`  Hook: ${compactForgeContext(state, runtime)}`);
  console.log(`  Next action: ${nextAction.skill || '(none)'}${nextAction.summary ? ' — ' + nextAction.summary : ''}`);
  console.log(`  Continue: ${cont.kind} → ${cont.target}${cont.detail ? ' (' + cont.detail.slice(0, 50) + ')' : ''}`);
  console.log('');
}

// Main
const filterName = process.argv[2];
const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));

for (const file of files) {
  const name = basename(file, '.json');
  if (filterName && name !== filterName) continue;
  const data = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));
  renderDashboard(name, data);
}
