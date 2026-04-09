import { buildContinueDirective } from './forge-continue.mjs';
import { buildStatusModel, renderStatusText } from './forge-status.mjs';
import { shouldRefreshAnalysis } from './forge-session.mjs';
import { compactForgeContext } from './forge-compact-context.mjs';
import { PHASE_SEQUENCE, resolvePhase } from './forge-phases.mjs';
import { isDesignImprovementRequest, resolveTargetSkill } from './forge-phase-routing.mjs';
import { formatBehavioralContext } from './forge-behavioral-audit.mjs';

export function resolveActiveForgePrompt({
  cwd = '.',
  state,
  runtime,
  request,
  projectActive = false,
  recommendedAgents = [],
} = {}) {
  const phase = resolvePhase(state);
  const { currentSkill: initialSkill, resumeSurfaceRequested } = resolveTargetSkill({
    explicitSkill: request?.explicitSkill,
    naturalMode: request?.naturalMode,
    naturalSkill: request?.naturalSkill,
    projectActive,
    phaseId: phase.id,
    runtime,
    message: request?.message || '',
  });

  let currentSkill = initialSkill;
  let context = `[Forge] full intake 0/${PHASE_SEQUENCE.length - 1} ×spec ×design`;

  if (['design', 'plan', 'plans', 'develop', 'fix'].includes(currentSkill)) {
    const phaseOverride = currentSkill === 'plans' ? 'plan' : currentSkill;
    const gate = shouldRefreshAnalysis(state, runtime, { phaseOverride });
    if (gate.needed) {
      currentSkill = 'analyze';
      context = `${compactForgeContext(state, runtime)} → forge:analyze (${gate.reason}) [${recommendedAgents.join(', ')}]`;
    }
  }

  if (currentSkill === 'info') {
    const statusModel = buildStatusModel({ cwd, state, runtime });
    const rendered = renderStatusText(statusModel).trim();
    context = `${rendered}\n\n[Forge] Canonical status surface from scripts/forge-status.mjs`;
  }

  const compactOnly = compactForgeContext(state, runtime);
  if (!context.includes('→ forge:analyze') && currentSkill !== 'info') {
    if (currentSkill === 'analyze' && isDesignImprovementRequest(request?.message || '')) {
      context = `${compactOnly} → forge:analyze (design-improvement; then forge:design ux-opening) [${recommendedAgents.join(', ')}]`;
    } else if (currentSkill === 'design' && runtime?.analysis?.last_type === 'design-improvement') {
      context = `${compactOnly} → forge:design (ux-opening mode) [${recommendedAgents.join(', ')}]`;
    } else {
      context = `${compactOnly} → forge:${currentSkill} [${recommendedAgents.join(', ')}]`;
    }
  }

  const behavioralContext = formatBehavioralContext(
    runtime,
    runtime?.preferred_locale || runtime?.detected_locale || 'en',
  );
  if (behavioralContext) {
    context = `${context}\n\n${behavioralContext}`;
  }

  const resumeContext = `${compactOnly}${recommendedAgents.length ? ` [${recommendedAgents.join(', ')}]` : ''}`;

  return {
    currentSkill,
    context,
    compactOnly,
    resumeSurfaceRequested,
    buildDirective(updatedRuntime) {
      return buildContinueDirective({
        cwd,
        state,
        runtime: updatedRuntime,
        staleTier: 'fresh',
        context: resumeContext,
      });
    },
  };
}
