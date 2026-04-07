import { describe, expect, it } from 'vitest';

import {
  deriveForgeRequest,
  resolveTargetSkill,
} from './lib/forge-phase-routing.mjs';

describe('forge phase routing helpers', () => {
  it('does not treat bare continue as a forge request', () => {
    expect(deriveForgeRequest('continue').isForgeRequest).toBe(false);
    expect(deriveForgeRequest('continue').explicitSkill).toBe(null);
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
