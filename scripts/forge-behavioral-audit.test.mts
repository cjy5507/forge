import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { detectLocale } from './lib/forge-locale.mjs';
import {
  buildBehavioralAuditReport,
  formatBehavioralContext,
  prescriptionsForProfile,
  renderActivePrescriptions,
  updateBehavioralCounters,
} from './lib/forge-behavioral-audit.mjs';
import { updateAdaptiveTier, writeForgeState, writeRuntimeState, readRuntimeState } from './lib/forge-session.mjs';

const WORKSPACES: string[] = [];

function makeWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), 'forge-behavior-'));
  WORKSPACES.push(cwd);
  mkdirSync(join(cwd, '.forge'), { recursive: true });
  return cwd;
}

afterEach(() => {
  while (WORKSPACES.length > 0) {
    rmSync(WORKSPACES.pop()!, { recursive: true, force: true });
  }
});

describe('forge locale helpers', () => {
  it('detects supported locales from multilingual messages', () => {
    expect(detectLocale('디자인 개선해줘')).toBe('ko');
    expect(detectLocale('improve the UX')).toBe('en');
    expect(detectLocale('デザイン改善して')).toBe('ja');
    expect(detectLocale('设计改进一下')).toBe('zh');
  });
});

describe('forge behavioral audit helpers', () => {
  it('builds localized prescriptions for active profiles', () => {
    const rendered = renderActivePrescriptions(prescriptionsForProfile('premature-handoff'), 'ko');
    expect(rendered[0]?.text).toContain('checkpoint');
  });

  it('detects a premature-handoff profile from incomplete implementation with handoff state', () => {
    const report = buildBehavioralAuditReport({
      state: {
        phase: 'develop',
        phase_id: 'develop',
        tasks: ['api', 'ui'],
      },
      runtime: {
        session_brief_mode: 'manual',
        session_handoff_summary: 'Continue later',
        next_session_owner: 'lead-dev',
        lanes: {
          api: { id: 'api', status: 'in_progress' },
          ui: { id: 'ui', status: 'ready' },
        },
      },
    });

    expect(report.profile).toBe('premature-handoff');
    expect(report.prescriptions).toContain('move_to_qa_when_implementation_complete');
  });

  it('updates adaptive runtime with locale, profile, and prescriptions', () => {
    const cwd = makeWorkspace();
    const state = writeForgeState(cwd, {
      project: 'behavior-app',
      phase: 'develop',
      phase_id: 'develop',
      spec_approved: true,
      design_approved: true,
      tasks: ['api', 'ui'],
    });
    writeRuntimeState(cwd, {
      company_phase_anchor: 'develop',
      active_gate: 'implementation_readiness',
      session_brief_mode: 'manual',
      session_phase_anchor: 'develop',
      session_gate_anchor: 'implementation_readiness',
      session_customer_blocker_count: 0,
      session_internal_blocker_count: 0,
      lanes: {
        api: { id: 'api', status: 'in_progress' },
      },
      session_handoff_summary: 'Need to continue later',
      next_session_owner: 'lead-dev',
    }, { state });

    updateAdaptiveTier(cwd, {
      state,
      message: '디자인 개선해줘',
      hostId: 'codex',
      eventName: 'prompt.submit',
    });

    const runtime = readRuntimeState(cwd, { state });
    expect(runtime.detected_locale).toBe('ko');
    expect(runtime.preferred_locale).toBe('ko');
    expect(runtime.behavioral_profile).toBe('premature-handoff');
    expect(runtime.active_prescriptions).toContain('finish_current_scope_before_checkpoint');
    expect(runtime.last_task_type).toBe('design');
  });

  it('formats behavioral context in the preferred locale', () => {
    const context = formatBehavioralContext({
      behavioral_profile: 'question-heavy',
      active_prescriptions: prescriptionsForProfile('question-heavy'),
    }, 'ko');

    expect(context).toContain('운영 프로필');
    expect(context).toContain('활성 처방');
  });

  it('tracks question prompts in behavioral counters', () => {
    const counters = updateBehavioralCounters({}, { taskType: 'question', isDesignImprovement: false });
    expect(counters.total_prompts).toBe(1);
    expect(counters.question_prompts).toBe(1);
  });
});
