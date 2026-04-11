// Forge analyst report schema validator.
//
// Mechanical post-validator for AnalystReport v1. Consumers in
// skills/analyze, skills/design, skills/fix call validateAnalystReport()
// before writing or reading any analyst artifact. Validation failure MUST
// throw — there is no legacy free-form fallback (see R3 in code-rules.md).
//
// The contract lives in .forge/contracts/analyst-report.ts. The
// REQUIRED_BODY_FIELDS table below mirrors that TypeScript source in plain
// JS so this file has zero runtime dependencies. Keep the two in sync: if
// you add/rename a kind or a required field, update BOTH files in the same
// commit.

// MUST mirror REQUIRED_BODY_FIELDS in .forge/contracts/analyst-report.ts —
// update both or neither.
const REQUIRED_BODY_FIELDS = {
  architecture: ['modules', 'coupling_hotspots', 'patterns'],
  impact: ['change', 'direct_impact', 'transitive_impact', 'test_coverage'],
  dependency: ['root', 'callers', 'callees', 'depth', 'cycles'],
  quality: ['dead_code', 'complexity_hotspots', 'refactor_candidates'],
  'first-principles': [
    'problem',
    'assumptions',
    'essence',
    'inverted_design',
    'action_plan',
    'verification',
  ],
  'design-improvement': [
    'current_friction',
    'assumptions',
    'openings',
    'handoff_brief',
  ],
  'behavioral-audit': ['profile', 'signals', 'prescriptions'],
};

const ALLOWED_KINDS = Object.keys(REQUIRED_BODY_FIELDS);

const SCHEMA_ERROR_SUFFIX =
  'Analyst must emit a single JSON block conforming to .forge/contracts/analyst-report.ts.';

function fail(reason, kind) {
  const kindSuffix = kind ? ` (kind=${kind})` : '';
  throw new Error(
    `AnalystReport v1 validation failed: ${reason}${kindSuffix}. ${SCHEMA_ERROR_SUFFIX}`
  );
}

// Extract a JSON payload from raw text. Prefer a fenced ```json ... ``` block
// since that matches what LLMs usually emit; fall back to raw parse. Any
// generic ``` ``` code fence is also accepted for tolerance.
function extractJson(text) {
  if (typeof text !== 'object') {
    const str = String(text ?? '');
    const fencedJson = str.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedJson) {
      return JSON.parse(fencedJson[1]);
    }
    const fencedPlain = str.match(/```\s*([\s\S]*?)\s*```/);
    if (fencedPlain) {
      // Only try to parse the fenced content if it looks like JSON.
      const trimmed = fencedPlain[1].trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
      }
    }
    return JSON.parse(str);
  }
  return text;
}

export function validateAnalystReport(input) {
  let report;
  try {
    report = extractJson(input);
  } catch (error) {
    fail(`unable to parse JSON payload (${error?.message || error})`);
  }

  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    fail('payload is not a JSON object');
  }

  // 1. envelope version
  if (report.version !== '1') {
    fail(`version must be '1' (got ${JSON.stringify(report.version)})`);
  }

  // 2. kind membership
  const kind = report.kind;
  if (!ALLOWED_KINDS.includes(kind)) {
    fail(
      `kind must be one of ${ALLOWED_KINDS.join(', ')} (got ${JSON.stringify(kind)})`
    );
  }

  // 3. body required fields for this kind
  const body = report.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('body must be an object', kind);
  }
  for (const field of REQUIRED_BODY_FIELDS[kind]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      fail(`body.${field} is missing`, kind);
    }
    // Reject explicit null/undefined — a present-but-null field is still a
    // missing field for consumer purposes.
    if (body[field] === null || body[field] === undefined) {
      fail(`body.${field} is null/undefined`, kind);
    }
  }

  // 4. recommendations array
  if (!Array.isArray(report.recommendations)) {
    fail('recommendations must be an array', kind);
  }

  return report;
}

// Exported for tests and consumers that need to inspect the allowed set
// without re-deriving it from the contract file.
export const ANALYST_REPORT_KINDS = ALLOWED_KINDS;
export const ANALYST_REPORT_REQUIRED_BODY_FIELDS = REQUIRED_BODY_FIELDS;
