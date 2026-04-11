#!/usr/bin/env node

import { buildContinueContext, selectContinueDirective } from './lib/forge-continue.mjs';
import { withJsonReadCache } from './lib/forge-io.mjs';
import { describeForgeHostDegradedExecution, getForgeHostAdapterContract } from './lib/forge-host.mjs';
import { buildStatusModel, renderStatusText } from './lib/forge-status.mjs';
import { readForgeState, readRuntimeState } from './lib/forge-session.mjs';
import { detectHostId } from './lib/forge-host.mjs';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    help: argv.includes('--help'),
  };
}

function printUsage() {
  console.log(`Forge continue helper

Usage:
  node scripts/forge-continue.mjs
  node scripts/forge-continue.mjs --json
`);
}

function getStalenessMs(runtime) {
  const timestamp = runtime?.stats?.last_finished_at || runtime?.updated_at;
  if (!timestamp) return Infinity;
  const elapsed = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : Infinity;
}

function getStaleTier(runtime) {
  const threshold = Number(process.env.FORGE_STALE_THRESHOLD_MS);
  const staleMs = Number.isFinite(threshold) && threshold > 0 ? threshold : TWENTY_FOUR_HOURS_MS;
  const elapsedMs = getStalenessMs(runtime);
  if (elapsedMs < ONE_HOUR_MS) return 'fresh';
  if (elapsedMs < staleMs) return 'warm';
  return 'stale';
}

function buildPayload(cwd = '.') {
  const state = readForgeState(cwd);
  if (!state) {
    return {
      active: false,
      project: '',
      skill: '',
      reason: '',
      stale_tier: 'stale',
      context: '',
      message: 'No active Forge project. Use `forge` to start one.',
    };
  }

  const runtime = readRuntimeState(cwd);
  const hostId = runtime?.host_context?.current_host || detectHostId({}, process.env) || 'unknown';
  const hostContract = getForgeHostAdapterContract(hostId);
  const selected = selectContinueDirective({ cwd, state, runtime });
  const context = buildContinueContext({
    cwd,
    state,
    runtime: selected.runtime,
    skill: selected.skill,
  });
  const statusText = renderStatusText(buildStatusModel({
    cwd,
    state,
    runtime: selected.runtime,
  })).trim();

  return {
    active: true,
    project: state.project || '',
    phase_id: state.phase_id || state.phase || '',
    mode: state.mode || 'build',
    host_id: hostId,
    host_contract: hostContract,
    degraded_execution_note: describeForgeHostDegradedExecution(hostId),
    skill: selected.skill,
    reason: selected.reason,
    stale_tier: getStaleTier(selected.runtime),
    context,
    status_text: statusText,
    message: `forge:${selected.skill}`,
  };
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printUsage();
  process.exit(0);
}

withJsonReadCache(() => {
  const payload = buildPayload(process.cwd());

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (!payload.active) {
    process.stdout.write(`${payload.message}\n`);
  } else {
    process.stdout.write(`${payload.status_text}\n\nResume skill: ${payload.message}\n`);
    if (payload.reason) {
      process.stdout.write(`Reason: ${payload.reason}\n`);
    }
    if (payload.degraded_execution_note) {
      process.stdout.write(`Host note: ${payload.degraded_execution_note}\n`);
    }
  }
});
