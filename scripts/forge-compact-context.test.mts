import { describe, expect, it } from 'vitest';
import { compactForgeContext, summarizePendingWork } from './lib/forge-session.mjs';

describe('forge compact context', () => {
  it('returns an idle marker when no state exists', () => {
    expect(compactForgeContext(null as any)).toBe('[Forge] light idle');
  });

  it('shows merge-focused lane hints and company context directly', () => {
    const context = compactForgeContext(
      {
        mode: 'build',
        phase: 'develop',
        phase_id: 'develop',
        spec_approved: true,
        design_approved: true,
      },
      {
        active_tier: 'full',
        company_mode: 'autonomous_company',
        active_gate: 'delivery_readiness',
        delivery_readiness: 'ready_for_review',
        customer_blockers: [],
        internal_blockers: [],
        current_session_goal: 'Land merge-ready lane',
        next_session_owner: 'lead-dev',
        recommended_agents: ['developer', 'qa'],
        lanes: {
          api: {
            id: 'api',
            status: 'in_review',
            review_state: 'approved',
            model_hint: 'executor',
          },
          docs: {
            id: 'docs',
            status: 'blocked',
          },
        },
      } as any,
    );

    expect(context).toContain('auto');
    expect(context).toContain('gate:delivery_readiness');
    expect(context).toContain('goal');
    expect(context).toContain('next:lead-dev');
    expect(context).toContain('↺api merge[executor]');
    expect(context).toContain('deliver!');
  });

  it('summarizes pending work from tasks, lanes, holes, and prs', () => {
    const pending = summarizePendingWork(
      {
        mode: 'build',
        phase: 'develop',
        phase_id: 'develop',
        spec_approved: true,
        design_approved: true,
        tasks: ['api', 'ui'],
        holes: ['HOLE-1'],
        pr_queue: ['PR-1'],
      },
      {
        lanes: {
          api: { id: 'api', status: 'in_progress' },
          docs: { id: 'docs', status: 'blocked' },
        },
      } as any,
    );

    expect(pending).toContain('2 tasks');
    expect(pending).toContain('1 holes');
    expect(pending).toContain('2 lanes');
    expect(pending).toContain('1 blocked');
    expect(pending).toContain('1 prs');
  });
});
