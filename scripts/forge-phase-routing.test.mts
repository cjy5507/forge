import { describe, expect, it } from 'vitest';

import {
  detectNaturalProjectSkill,
  deriveForgeRequest,
  resolveTargetSkill,
} from './lib/forge-phase-routing.mjs';

describe('forge phase routing helpers', () => {
  it('does not treat bare continue as a forge request', () => {
    expect(deriveForgeRequest('continue').isForgeRequest).toBe(false);
    expect(deriveForgeRequest('continue').explicitSkill).toBe(null);
  });

  it('treats bare continue as a natural resume request when a Forge project is active', () => {
    const request = deriveForgeRequest('continue', { projectActive: true });
    expect(request.isForgeRequest).toBe(true);
    expect(request.naturalSkill).toBe('continue');
  });

  it('detects natural active-project status and analyze intents', () => {
    expect(detectNaturalProjectSkill('where are we?')).toBe('info');
    expect(detectNaturalProjectSkill('impact analysis')).toBe('analyze');
  });

  it('maps complete projects to info through shared routing', () => {
    const resolved = resolveTargetSkill({
      explicitSkill: 'continue',
      projectActive: true,
      phaseId: 'complete',
      runtime: {
        active_gate: 'customer_review',
        delivery_readiness: 'delivered',
      },
      message: 'forge continue',
    });

    expect(resolved.currentSkill).toBe('continue');
    expect(resolved.resumeSurfaceRequested).toBe(true);
  });

  it('routes natural active-project status requests to info', () => {
    const resolved = resolveTargetSkill({
      naturalSkill: 'info',
      projectActive: true,
      phaseId: 'develop',
      runtime: {},
      message: 'where are we?',
    });

    expect(resolved.currentSkill).toBe('info');
    expect(resolved.resumeSurfaceRequested).toBe(false);
  });

  it('routes generic forge requests with PM-owned customer blockers through continue', () => {
    const resolved = resolveTargetSkill({
      explicitSkill: null,
      projectActive: true,
      phaseId: 'discovery',
      runtime: {
        customer_blockers: [{ summary: 'Need clarification' }],
        next_session_owner: 'pm',
      },
      message: 'forge status',
    });

    expect(resolved.currentSkill).toBe('continue');
    expect(resolved.resumeSurfaceRequested).toBe(true);
  });
});
