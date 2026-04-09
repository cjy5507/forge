import { DEFAULT_RUNTIME } from './forge-io.mjs';
import { allTriggers, INTERACTIVE_PATTERNS } from './i18n-patterns.mjs';
import { resolvePhase } from './forge-phases.mjs';
import { detectLocale, normalizeLocale } from './forge-locale.mjs';
import {
  deriveBehavioralProfile,
  prescriptionsForProfile,
  updateBehavioralCounters,
} from './forge-behavioral-audit.mjs';
import { isDesignImprovementRequest } from './forge-phase-routing.mjs';
import {
  classifyTierFromMessage,
  detectTaskType,
  recommendedAgentsFor,
} from './forge-tiers.mjs';
import { applyHostContext } from './forge-host-context.mjs';

const interactivePatterns = allTriggers(INTERACTIVE_PATTERNS);

export function messageLooksInteractive(message = '') {
  const text = String(message).toLowerCase();
  return interactivePatterns.some(re => re.test(text));
}

export function isProjectActive(state) {
  if (!state) {
    return false;
  }

  const status = String(state.status || '').toLowerCase();
  if (['complete', 'delivered', 'cancelled', 'canceled'].includes(status)) {
    return false;
  }

  return resolvePhase(state).id !== 'complete';
}

export function updateAdaptiveTierWith({ readRuntimeState, updateRuntimeState }, cwd = '.', {
  state = null,
  message = '',
  hostId = '',
  eventName = '',
} = {}) {
  const inferredTier = classifyTierFromMessage(message, state);
  const taskType = detectTaskType(message);
  const phaseId = state ? resolvePhase(state).id : 'develop';
  const currentRuntime = readRuntimeState(cwd);
  const detectedLocale = detectLocale(message, currentRuntime?.preferred_locale || currentRuntime?.detected_locale || 'en');
  const isDesignImprovement = isDesignImprovementRequest(message);
  const nextBehavioralCounters = updateBehavioralCounters(currentRuntime?.behavioral_counters, {
    taskType,
    isDesignImprovement,
  });
  const nextBehavioralProfile = deriveBehavioralProfile({
    state,
    runtime: {
      ...currentRuntime,
      behavioral_counters: nextBehavioralCounters,
    },
  });
  const recommendedAgents = recommendedAgentsFor({ tier: inferredTier, taskType, phaseId, runtime: currentRuntime || DEFAULT_RUNTIME });

  const runtime = updateRuntimeState(cwd, current => applyHostContext({
    ...current,
    active_tier: inferredTier,
    detected_locale: detectedLocale,
    preferred_locale: normalizeLocale(detectedLocale || current.preferred_locale || current.detected_locale || 'en', 'en'),
    last_task_type: taskType,
    recommended_agents: recommendedAgents,
    behavioral_counters: nextBehavioralCounters,
    behavioral_profile: nextBehavioralProfile,
    active_prescriptions: prescriptionsForProfile(nextBehavioralProfile),
    stats: {
      ...current.stats,
      started_at: current.stats.started_at || new Date().toISOString(),
      last_prompt_at: new Date().toISOString(),
    },
  }, {
    hostId,
    eventName,
  }));

  return {
    tier: inferredTier,
    taskType,
    recommendedAgents,
    runtime,
  };
}
