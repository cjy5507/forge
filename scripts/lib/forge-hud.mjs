// Forge HUD — extracted HUD integration for claude-hud statusline
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolvePhase } from './forge-phases.mjs';
import { normalizeBlockers, writeJsonFile } from './forge-io.mjs';

/**
 * Update the claude-hud custom status line with current Forge state.
 * Shows phase, active agents, lanes, and blockers dynamically.
 * Safe to call from any hook — silently no-ops if HUD is not installed.
 */
export function updateHudLine(state, runtime, staleTier = 'fresh') {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) return;
  const hudConfigDir = join(homeDir, '.claude', 'plugins', 'claude-hud');
  const hudConfigPath = join(hudConfigDir, 'config.json');
  if (!existsSync(hudConfigPath) && !existsSync(hudConfigDir)) return;

  let config = {};
  try {
    config = JSON.parse(readFileSync(hudConfigPath, 'utf8'));
  } catch { /* no config yet */ }

  // Use resolvePhase for consistent numbering with compactForgeContext
  const resolved = resolvePhase(state || {});
  const phase = resolved.id;
  const phaseIdx = resolved.index;
  const maxPhase = resolved.sequence.length - 1; // exclude 'complete'

  // For stale projects, show minimal HUD
  if (staleTier === 'stale') {
    const nextLine = 'forge:stale';
    config.display = config.display || {};
    if (config.display.customLine === nextLine) return;
    config.display.customLine = nextLine;
    writeJsonFile(hudConfigPath, config);
    return;
  }

  // Active agents
  const activeAgents = runtime?.active_agents || {};
  const agentEntries = Object.values(activeAgents).filter(a => a.status === 'running');
  const agentInfo = agentEntries.length > 0
    ? agentEntries.map(a => (a.type || 'agent').replace(/^forge:/, '')).join(' ')
    : '';

  // Active lanes
  const lanes = runtime?.lanes || {};
  const allLanes = Object.values(lanes);
  const activeLanes = allLanes.filter(l => l.status !== 'done' && l.status !== 'merged');
  const mergedCount = allLanes.length - activeLanes.length;
  const activeDetail = activeLanes.map(l => `${l.id}(${l.status})`).join(' ');
  const laneInfo = allLanes.length > 0
    ? `${mergedCount}/${allLanes.length}l${activeDetail ? ` ${activeDetail}` : ''}`
    : '';

  const blockers = normalizeBlockers(runtime?.customer_blockers).length + normalizeBlockers(runtime?.internal_blockers).length;
  const nextAction = runtime?.next_action?.skill
    ? `next:${runtime.next_action.skill}${runtime?.next_action?.target ? `(${runtime.next_action.target})` : ''}`
    : '';

  // Build dynamic line: phase | agents | lanes | blockers
  const parts = [`forge:${phase} ${phaseIdx}/${maxPhase}`];
  if (agentInfo) parts.push(agentInfo);
  if (laneInfo) parts.push(laneInfo);
  if (nextAction) parts.push(nextAction);
  parts.push(`${blockers} blockers`);

  const nextLine = parts.join(' | ').slice(0, 80);

  // Only write when the line actually changed to avoid HUD flickering
  config.display = config.display || {};
  if (config.display.customLine === nextLine) return;
  config.display.customLine = nextLine;
  writeJsonFile(hudConfigPath, config);
}
