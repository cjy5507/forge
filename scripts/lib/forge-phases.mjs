import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { resolveForgeBaseDir } from './forge-io.mjs';

// Section markers use regex to match both numbered (## 4. Constraints) and plain (## Constraints) headings.
// This ensures compatibility with Forge's own templates which use numbered sections.
const REQUIRED_SECTIONS = {
  'spec.md': [/##\s+(?:\d+\.\s+)?(?:Scope|Overview)/i, /##\s+(?:\d+\.\s+)?Constraints/i],
  'code-rules.md': [/##\s+(?:\d+\.\s+)?(?:Rules|Naming Conventions)/i],
};

export const PHASE_SEQUENCE = [
  'intake',
  'discovery',
  'design',
  'develop',
  'qa',
  'security',
  'fix',
  'delivery',
  'complete',
];

export const REPAIR_PHASE_SEQUENCE = [
  'intake',
  'reproduce',
  'isolate',
  'fix',
  'regress',
  'verify',
  'delivery',
  'complete',
];

export const EXPRESS_PHASE_SEQUENCE = [
  'plan',
  'build',
  'ship',
  'complete',
];

/** Map repair phase IDs to required artifacts that must exist before advancing */
export const REPAIR_PHASE_GATES = {
  reproduce: { requires: [], produces: ['evidence'] },
  isolate:   { requires: ['evidence'], produces: ['evidence/rca'] },
  fix:       { requires: ['evidence/rca'], produces: [] },
  regress:   { requires: [], produces: ['holes'] },
  verify:    { requires: ['holes'], produces: [] },
  delivery:  { requires: [], produces: ['delivery-report'] },
};

/** Map build phase IDs to required artifacts that must exist before advancing */
export const BUILD_PHASE_GATES = {
  discovery: { requires: [], produces: ['spec.md'] },
  design:    { requires: ['spec.md'], produces: ['design', 'code-rules.md', 'contracts'] },
  develop:   { requires: ['design', 'code-rules.md', 'contracts'], produces: [] },
  qa:        { requires: [], produces: ['holes'] },
  security:  { requires: [], produces: [] },
  fix:       { requires: ['holes'], produces: [] },
  delivery:  { requires: [], produces: ['delivery-report'] },
};

/** Map express phase IDs to required artifacts that must exist before advancing.
 *  Express gates are lightweight but non-empty — "safety harness" positioning
 *  requires at least minimal sanity checks even in the fast path. */
export const EXPRESS_PHASE_GATES = {
  build: { requires: ['state.json'], produces: [] },
  ship:  { requires: ['state.json'], produces: ['delivery-report'] },
};

/** Resolve the phase gate map for a given mode */
export function getPhaseGates(mode = 'build') {
  if (mode === 'repair') return REPAIR_PHASE_GATES;
  if (mode === 'express') return EXPRESS_PHASE_GATES;
  return BUILD_PHASE_GATES;
}

const LEGACY_PHASE_MAP = new Map([
  [0, 'intake'],
  [1, 'discovery'],
  [2, 'design'],
  [3, 'develop'],
  [4, 'qa'],
  [4.5, 'security'],
  [5, 'fix'],
  [6, 'delivery'],
  [7, 'complete'],
]);

const ALL_KNOWN_PHASES = new Set([...PHASE_SEQUENCE, ...REPAIR_PHASE_SEQUENCE, ...EXPRESS_PHASE_SEQUENCE]);

export function normalizePhaseId(value) {
  if (typeof value === 'number') {
    return LEGACY_PHASE_MAP.get(value) || 'intake';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();

    if (ALL_KNOWN_PHASES.has(trimmed)) {
      return trimmed;
    }

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return LEGACY_PHASE_MAP.get(numeric) || 'intake';
    }
  }

  return 'intake';
}

export function resolvePhase(state = {}) {
  const phaseSource =
    state.phase_id ??
    (typeof state.phase === 'number' || typeof state.phase === 'string'
      ? state.phase
      : state.phase_name);
  const phaseId = normalizePhaseId(phaseSource);
  const isRepair = state.mode === 'repair';
  const isExpress = state.mode === 'express';
  const primarySeq = isExpress
    ? EXPRESS_PHASE_SEQUENCE
    : isRepair ? REPAIR_PHASE_SEQUENCE : PHASE_SEQUENCE;
  let phaseIndex = primarySeq.indexOf(phaseId);

  // If phase not in the mode's sequence, fall back to the others for backward compat
  let sequence = primarySeq;
  let mismatch = false;
  if (phaseIndex === -1) {
    for (const fallback of [PHASE_SEQUENCE, REPAIR_PHASE_SEQUENCE, EXPRESS_PHASE_SEQUENCE]) {
      if (fallback !== primarySeq) {
        const idx = fallback.indexOf(phaseId);
        if (idx !== -1) {
          sequence = fallback;
          phaseIndex = idx;
          mismatch = true;
          break;
        }
      }
    }
  }

  const mode = isExpress ? 'express' : isRepair ? 'repair' : 'build';
  return {
    id: phaseId,
    index: phaseIndex === -1 ? 0 : phaseIndex,
    label: phaseId,
    sequence,
    mode,
    mismatch, // true when phase doesn't belong to the declared mode's sequence
  };
}

/**
 * Check whether a repair phase's required artifacts exist.
 * Returns { canAdvance, missing[] } for the given repair phase.
 * @deprecated Use checkPhaseGate(cwd, phaseId, mode) instead.
 */
export function checkRepairGate(cwd, phaseId) {
  return checkPhaseGate(cwd, phaseId, 'repair');
}

/**
 * Check whether a phase's required artifacts exist for any mode.
 * Returns { canAdvance, missing[], phase, mode }.
 * This is the tier-independent phase integrity check.
 */
export function checkPhaseGate(cwd, phaseId, mode = 'build') {
  const gates = getPhaseGates(mode);
  const gate = gates[phaseId];
  if (!gate) {
    return { canAdvance: true, missing: [], phase: phaseId, mode };
  }
  const forgeDir = join(resolveForgeBaseDir(cwd), '.forge');
  const MIN_ARTIFACT_BYTES = 100;
  const missing = [];
  for (const req of gate.requires) {
    const artifactPath = join(forgeDir, req);
    if (!existsSync(artifactPath)) {
      missing.push(req);
    } else {
      // For file artifacts (not directories), verify minimum content size
      try {
        const stat = statSync(artifactPath);
        if (stat.isFile() && stat.size < MIN_ARTIFACT_BYTES) {
          missing.push(req);
        }
        // For artifacts with required sections, verify they exist (regex for numbered/plain headings)
        if (stat.isFile() && REQUIRED_SECTIONS[req]) {
          try {
            const content = readFileSync(artifactPath, 'utf8');
            for (const pattern of REQUIRED_SECTIONS[req]) {
              if (!pattern.test(content)) {
                missing.push(`${req} (missing section matching: ${pattern.source})`);
              }
            }
          } catch {}
        }
      } catch {}
    }
  }
  return { canAdvance: missing.length === 0, missing, phase: phaseId, mode };
}

/**
 * Get the phase sequence for a given mode.
 */
export function getPhaseSequence(mode = 'build') {
  if (mode === 'repair') return REPAIR_PHASE_SEQUENCE;
  if (mode === 'express') return EXPRESS_PHASE_SEQUENCE;
  return PHASE_SEQUENCE;
}

/**
 * Validate that a phase transition is allowed.
 * Forward transitions follow the sequence. Backward transitions are blocked
 * unless `allowRollback` is true.
 * Returns { valid, reason } — never throws.
 */
export function validatePhaseTransition(currentPhase, nextPhase, mode = 'build', { allowRollback = false } = {}) {
  if (currentPhase === nextPhase) {
    return { valid: true, reason: 'same phase' };
  }

  const sequence = getPhaseSequence(mode);
  const currentIndex = sequence.indexOf(currentPhase);
  const nextIndex = sequence.indexOf(nextPhase);

  // Unknown phases — allow but warn
  if (currentIndex === -1 || nextIndex === -1) {
    return { valid: true, reason: `unknown phase(s): ${currentIndex === -1 ? currentPhase : nextPhase}` };
  }

  // Forward transition — always allowed
  if (nextIndex > currentIndex) {
    return { valid: true, reason: 'forward' };
  }

  // Fix loop: phases that legitimately go backward (QA/security finds issues → fix)
  const FIX_LOOP_TARGETS = new Set(['fix', 'security', 'qa', 'regress']);
  if (FIX_LOOP_TARGETS.has(nextPhase)) {
    return { valid: true, reason: 'fix-loop' };
  }

  // Backward transition — only with rollback flag
  if (allowRollback) {
    return { valid: true, reason: 'rollback' };
  }

  return {
    valid: false,
    reason: `backward transition ${currentPhase} → ${nextPhase} not allowed without rollback`,
  };
}
