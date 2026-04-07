import {
  DEFAULT_RUNTIME,
  requireString,
  normalizeCompanyMode,
  normalizeDeliveryReadiness,
  normalizeBlockers,
} from './forge-io.mjs';
import { PHASE_SEQUENCE, resolvePhase } from './forge-phases.mjs';
import { normalizeTier, inferTierFromState } from './forge-tiers.mjs';
import { summarizeLaneCounts, selectNextLane, normalizeLane } from './forge-lanes.mjs';

export function compactForgeContext(state, runtime = DEFAULT_RUNTIME) {
  if (!state) {
    return '[Forge] light idle';
  }

  const phase = resolvePhase(state);
  const spec = state.spec_approved ? '\u2713spec' : '\u00d7spec';
  const design = state.design_approved ? '\u2713design' : '\u00d7design';
  const tier = normalizeTier(runtime?.active_tier || state.tier || inferTierFromState(state));
  const companyMode = normalizeCompanyMode(runtime?.company_mode);
  const activeGate = requireString(runtime?.active_gate);
  const deliveryReadiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const currentSessionGoal = requireString(runtime?.current_session_goal);
  const nextSessionOwner = requireString(runtime?.next_session_owner);
  const agentCount = Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents.length : 0;
  const laneCounts = summarizeLaneCounts(runtime);
  const nextLane = selectNextLane(runtime);
  const nextLaneRecord = nextLane ? normalizeLane(runtime?.lanes?.[nextLane], nextLane) : null;
  let focusHint = '';

  if (nextLaneRecord?.merge_state === 'rebasing') {
    focusHint = ' rebase';
  } else if (nextLaneRecord?.review_state === 'changes_requested') {
    focusHint = ' review!';
  } else if (nextLaneRecord?.review_state === 'approved' || nextLaneRecord?.merge_state === 'ready') {
    focusHint = ' merge';
  } else if (nextLaneRecord?.merge_state === 'queued') {
    focusHint = ' queue';
  } else if (nextLaneRecord?.status === 'in_review') {
    focusHint = ' review';
  }

  if (nextLaneRecord?.model_hint) {
    focusHint += `[${nextLaneRecord.model_hint}]`;
  }

  const companySuffix = [
    companyMode === 'autonomous_company' ? 'auto' : '',
    activeGate ? `gate:${activeGate}` : '',
    customerBlockers.length ? `c${customerBlockers.length}` : '',
    internalBlockers.length ? `i${internalBlockers.length}` : '',
    currentSessionGoal ? 'goal' : '',
    nextSessionOwner ? `next:${nextSessionOwner}` : '',
    deliveryReadiness === 'ready_for_review' ? 'deliver!' : '',
    deliveryReadiness === 'blocked' ? 'hold' : '',
  ].filter(Boolean).join(' ');

  const laneSuffix = laneCounts.total
    ? ` ${laneCounts.merged + laneCounts.done}/${laneCounts.total}l${laneCounts.blocked ? ` ${laneCounts.blocked}b` : ''}${nextLane ? ` \u21ba${nextLane}${focusHint}` : ''}`
    : '';

  const mode = state.mode || 'build';
  const seq = phase.sequence || PHASE_SEQUENCE;
  const total = seq.length - 1;
  const truncate = (s, max = 50) => s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  let action = '';

  if (phase.mismatch) {
    action = ` \u2192 MISMATCH: "${phase.id}" not in ${phase.mode} sequence`;
  } else if (state._phase_gate_warning) {
    action = ` \u2192 GATE: ${truncate(state._phase_gate_warning)}`;
  } else if (customerBlockers.length) {
    action = ` \u2192 waiting on client: ${truncate(String(customerBlockers[0]?.summary || customerBlockers[0]))}`;
  } else if (internalBlockers.length) {
    action = ` \u2192 blocked: ${truncate(String(internalBlockers[0]?.summary || internalBlockers[0]))}`;
  } else if (deliveryReadiness === 'ready_for_review') {
    action = ' \u2192 ready for review';
  } else if (nextLane && focusHint) {
    action = ` \u2192 ${nextLane}${focusHint}`;
  }

  return `[Forge] ${mode} ${tier} ${phase.id} ${phase.index}/${total} ${spec} ${design}${companySuffix ? ` ${companySuffix}` : ''}${agentCount ? ` ${agentCount}a` : ''}${laneSuffix}${action}`;
}

export function summarizePendingWork(state, runtime = null) {
  if (!state) {
    return [];
  }

  const phase = resolvePhase(state);
  const pending = [];

  if (state.mode !== 'repair' && !state.spec_approved && phase.index >= PHASE_SEQUENCE.indexOf('design')) {
    pending.push('spec');
  }

  if (state.mode !== 'repair' && !state.design_approved && phase.index >= PHASE_SEQUENCE.indexOf('plan')) {
    pending.push('design');
  }

  if ((state.holes?.length || 0) > 0 && phase.id !== 'complete') {
    pending.push(`${state.holes.length} holes`);
  }

  if ((state.tasks?.length || 0) > 0 && ['plan', 'develop'].includes(phase.id)) {
    pending.push(`${state.tasks.length} tasks`);
  }

  if (runtime) {
    const laneCounts = summarizeLaneCounts(runtime);
    if (laneCounts.total > 0 && phase.id !== 'complete') {
      pending.push(`${laneCounts.total} lane${laneCounts.total === 1 ? '' : 's'}`);
      if (laneCounts.blocked > 0) {
        pending.push(`${laneCounts.blocked} blocked`);
      }
    }
  }

  if ((state.pr_queue?.length || 0) > 0) {
    pending.push(`${state.pr_queue.length} prs`);
  }

  if (phase.id !== 'complete' && pending.length === 0) {
    pending.push(phase.id);
  }

  return pending;
}
