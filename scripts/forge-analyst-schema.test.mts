import { describe, expect, it } from 'vitest';
import {
  ANALYST_REPORT_KINDS,
  validateAnalystReport,
} from './lib/forge-analyst-schema.mjs';

// Fixture helpers ────────────────────────────────────────────────────────
// Each helper returns a minimal-but-valid report for the given kind. Tests
// mutate the returned object to craft invalid variants without rebuilding
// the whole envelope by hand.

function baseEnvelope<K extends string>(kind: K) {
  return {
    version: '1',
    kind,
    generated_at: '2026-04-12T00:00:00Z',
    target: 'test',
    graph_health: 'strong',
    confidence: 'high',
    risk_level: 'local',
    locale: 'en',
    summary: 'test summary',
    recommendations: [],
  } as const;
}

function architectureReport() {
  return {
    ...baseEnvelope('architecture'),
    body: {
      modules: [{ name: 'm', inbound: 0, outbound: 0, role: 'core' }],
      coupling_hotspots: [],
      patterns: ['layered'],
    },
  };
}

function impactReport() {
  return {
    ...baseEnvelope('impact'),
    body: {
      change: 'update auth',
      direct_impact: ['src/auth.ts'],
      transitive_impact: ['src/session.ts'],
      test_coverage: { covered: 2, total: 5 },
    },
  };
}

function dependencyReport() {
  return {
    ...baseEnvelope('dependency'),
    body: {
      root: 'src/index.ts',
      callers: [],
      callees: ['src/util.ts'],
      depth: 1,
      cycles: [],
    },
  };
}

function qualityReport() {
  return {
    ...baseEnvelope('quality'),
    body: {
      dead_code: [],
      complexity_hotspots: [],
      refactor_candidates: [],
    },
  };
}

function firstPrinciplesReport() {
  return {
    ...baseEnvelope('first-principles'),
    body: {
      problem: 'p',
      assumptions: [],
      essence: 'e',
      inverted_design: 'i',
      action_plan: [],
      verification: [],
    },
  };
}

function designImprovementReport() {
  return {
    ...baseEnvelope('design-improvement'),
    body: {
      current_friction: 'slow',
      assumptions: [],
      openings: [],
      handoff_brief: {
        target_users: 'devs',
        desired_feeling: 'calm',
        critical_flows: [],
        safe_to_change_areas: [],
      },
    },
  };
}

function behavioralAuditReport() {
  return {
    ...baseEnvelope('behavioral-audit'),
    body: {
      profile: 'none',
      signals: [],
      prescriptions: [],
    },
  };
}

// ── Valid paths ──────────────────────────────────────────────────────────

describe('validateAnalystReport - valid payloads', () => {
  it('accepts a minimal valid architecture report (raw object)', () => {
    const report = architectureReport();
    expect(() => validateAnalystReport(report)).not.toThrow();
  });

  it('accepts JSON inside a ```json fenced block', () => {
    const text = '```json\n' + JSON.stringify(architectureReport()) + '\n```';
    expect(() => validateAnalystReport(text)).not.toThrow();
  });

  it('accepts raw JSON string without any fence', () => {
    const text = JSON.stringify(impactReport());
    expect(() => validateAnalystReport(text)).not.toThrow();
  });
});

// ── Envelope rejections ─────────────────────────────────────────────────

describe('validateAnalystReport - envelope rejects', () => {
  it('rejects when version is not "1"', () => {
    const report = architectureReport();
    (report as any).version = '2';
    expect(() => validateAnalystReport(report)).toThrow(/version must be '1'/);
  });

  it('rejects when kind is not in the allowed list', () => {
    const report = architectureReport();
    (report as any).kind = 'bogus';
    expect(() => validateAnalystReport(report)).toThrow(/kind must be one of/);
  });

  it('rejects when recommendations is not an array', () => {
    const report = architectureReport();
    (report as any).recommendations = 'not-an-array';
    expect(() => validateAnalystReport(report)).toThrow(
      /recommendations must be an array/
    );
  });
});

// ── Per-kind missing-field rejections (R3: 7 kind variants) ─────────────

describe('validateAnalystReport - per-kind missing-field rejects', () => {
  it('rejects when missing body.modules for kind=architecture', () => {
    const report = architectureReport();
    delete (report.body as any).modules;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.modules is missing.*kind=architecture/
    );
  });

  it('rejects when missing body.test_coverage for kind=impact', () => {
    const report = impactReport();
    delete (report.body as any).test_coverage;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.test_coverage is missing.*kind=impact/
    );
  });

  it('rejects when missing body.cycles for kind=dependency', () => {
    const report = dependencyReport();
    delete (report.body as any).cycles;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.cycles is missing.*kind=dependency/
    );
  });

  it('rejects when missing body.dead_code for kind=quality', () => {
    const report = qualityReport();
    delete (report.body as any).dead_code;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.dead_code is missing.*kind=quality/
    );
  });

  it('rejects when missing body.assumptions for kind=first-principles', () => {
    const report = firstPrinciplesReport();
    delete (report.body as any).assumptions;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.assumptions is missing.*kind=first-principles/
    );
  });

  it('rejects when missing body.handoff_brief for kind=design-improvement', () => {
    const report = designImprovementReport();
    delete (report.body as any).handoff_brief;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.handoff_brief is missing.*kind=design-improvement/
    );
  });

  it('rejects when missing body.profile for kind=behavioral-audit', () => {
    const report = behavioralAuditReport();
    delete (report.body as any).profile;
    expect(() => validateAnalystReport(report)).toThrow(
      /body\.profile is missing.*kind=behavioral-audit/
    );
  });
});

// ── Legacy free-form reject ─────────────────────────────────────────────

describe('validateAnalystReport - legacy reject', () => {
  it('rejects a free-form markdown report with no JSON block', () => {
    const legacy = [
      '## Module Map',
      '- core: entry point, 0 inbound, 3 outbound',
      '## Coupling Hotspots',
      '- core ↔ util: shared logger',
    ].join('\n');
    expect(() => validateAnalystReport(legacy)).toThrow(
      /AnalystReport v1 validation failed/
    );
  });
});

// ── Coverage sanity: the 7 kinds are present in the allowed set ─────────

describe('validateAnalystReport - schema coverage', () => {
  it('exposes exactly the 7 kinds declared in the contract', () => {
    expect(ANALYST_REPORT_KINDS.sort()).toEqual(
      [
        'architecture',
        'behavioral-audit',
        'dependency',
        'design-improvement',
        'first-principles',
        'impact',
        'quality',
      ].sort()
    );
  });
});
