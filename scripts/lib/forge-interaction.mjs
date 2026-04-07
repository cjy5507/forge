import { DEFAULT_RUNTIME } from './forge-io.mjs';
import { allTriggers, INTERACTIVE_PATTERNS } from './i18n-patterns.mjs';
import { resolvePhase } from './forge-phases.mjs';
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
  const recommendedAgents = recommendedAgentsFor({ tier: inferredTier, taskType, phaseId, runtime: currentRuntime || DEFAULT_RUNTIME });

  const runtime = updateRuntimeState(cwd, current => applyHostContext({
    ...current,
    active_tier: inferredTier,
    last_task_type: taskType,
    recommended_agents: current.recommended_agents?.length ? current.recommended_agents : recommendedAgents,
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
