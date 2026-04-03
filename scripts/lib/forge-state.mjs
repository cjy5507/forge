import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';

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

export const TIER_SEQUENCE = ['off', 'light', 'medium', 'full'];
export const LANE_REVIEW_SEQUENCE = ['none', 'pending', 'changes_requested', 'approved'];
export const LANE_MERGE_SEQUENCE = ['none', 'queued', 'rebasing', 'ready', 'merged'];

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

const DEFAULT_STATS = {
  started_at: '',
  last_prompt_at: '',
  last_finished_at: '',
  session_count: 0,
  agent_calls: 0,
  rollback_count: 0,
  failure_count: 0,
  stop_block_count: 0,
  test_runs: 0,
  test_failures: 0,
};

const DEFAULT_RUNTIME = {
  version: 3,
  active_tier: 'light',
  last_task_type: 'general',
  task_graph_version: 1,
  company_mode: 'guided',
  company_gate_mode: 'auto',
  company_phase_anchor: '',
  active_gate: '',
  active_gate_owner: '',
  delivery_readiness: 'unknown',
  customer_blockers: [],
  internal_blockers: [],
  current_session_goal: '',
  session_exit_criteria: [],
  next_session_goal: '',
  next_session_owner: '',
  session_handoff_summary: '',
  session_brief_mode: 'auto',
  session_phase_anchor: '',
  session_gate_anchor: '',
  session_customer_blocker_count: 0,
  session_internal_blocker_count: 0,
  recommended_agents: [],
  lanes: {},
  active_worktrees: {},
  next_lane: '',
  active_agents: {},
  recent_agents: [],
  recent_failures: [],
  stop_guard: {
    block_count: 0,
    last_reason: '',
    last_message: '',
  },
  stats: { ...DEFAULT_STATS },
  last_event: null,
  updated_at: '',
};

/** Safely extract a trimmed string, returning fallback for non-string values. */
function requireString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function ensureForgeDir(cwd = '.') {
  const forgeDir = join(resolveForgeBaseDir(cwd), '.forge');
  if (!existsSync(forgeDir)) {
    mkdirSync(forgeDir, { recursive: true });
  }
  return forgeDir;
}

export function resolveForgeBaseDir(cwd = '.') {
  const start = resolve(cwd);
  let current = start;

  while (true) {
    if (existsSync(join(current, '.forge'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function readJsonFile(path, fallback = null) {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    process.stderr.write(`[Forge] warning: failed to parse ${path}: ${err.message}\n`);
    return fallback;
  }
}

export function writeJsonFile(path, value) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function getStatePath(cwd = '.') {
  return join(resolveForgeBaseDir(cwd), '.forge', 'state.json');
}

export function getRuntimePath(cwd = '.') {
  return join(resolveForgeBaseDir(cwd), '.forge', 'runtime.json');
}

export function normalizeTier(value) {
  if (typeof value !== 'string') {
    return 'light';
  }

  const lowered = value.trim().toLowerCase();
  return TIER_SEQUENCE.includes(lowered) ? lowered : 'light';
}

export function tierAtLeast(currentTier, requiredTier) {
  return TIER_SEQUENCE.indexOf(normalizeTier(currentTier)) >= TIER_SEQUENCE.indexOf(normalizeTier(requiredTier));
}

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
  if (phaseIndex === -1) {
    for (const fallback of [PHASE_SEQUENCE, REPAIR_PHASE_SEQUENCE, EXPRESS_PHASE_SEQUENCE]) {
      if (fallback !== primarySeq) {
        const idx = fallback.indexOf(phaseId);
        if (idx !== -1) {
          sequence = fallback;
          phaseIndex = idx;
          break;
        }
      }
    }
  }

  return {
    id: phaseId,
    index: phaseIndex === -1 ? 0 : phaseIndex,
    label: phaseId,
    sequence,
    mode: isExpress ? 'express' : isRepair ? 'repair' : 'build',
  };
}

function mergeStats(stats = {}) {
  const merged = { ...DEFAULT_STATS, ...(stats || {}) };
  for (const key of Object.keys(DEFAULT_STATS)) {
    if (typeof DEFAULT_STATS[key] === 'number' && typeof merged[key] !== 'number') {
      merged[key] = Number(merged[key]) || 0;
    }
  }
  return merged;
}

function normalizeCompanyMode(value) {
  if (typeof value !== 'string') {
    return 'guided';
  }

  const lowered = value.trim().toLowerCase();
  return lowered === 'autonomous_company' ? lowered : 'guided';
}

function normalizeDeliveryReadiness(value) {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const lowered = value.trim().toLowerCase();
  return ['unknown', 'blocked', 'in_progress', 'ready_for_review', 'delivered'].includes(lowered)
    ? lowered
    : 'unknown';
}

function normalizeBlockers(blockers = []) {
  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers
    .map((blocker) => {
      if (typeof blocker === 'string') {
        return {
          summary: blocker,
          owner: '',
          severity: 'blocker',
        };
      }

      if (!blocker || typeof blocker !== 'object') {
        return null;
      }

      return {
        ...blocker,
        summary: typeof blocker.summary === 'string' ? blocker.summary : '',
        owner: typeof blocker.owner === 'string' ? blocker.owner : '',
        severity: typeof blocker.severity === 'string' ? blocker.severity : 'blocker',
      };
    })
    .filter(Boolean)
    .filter(blocker => blocker.summary);
}

function normalizeStringList(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

export function resolveRuntimeLaneContext(runtime = DEFAULT_RUNTIME, rootCwd = '.', hookCwd = '.', fallbackLaneId = '') {
  const lanes = runtime?.lanes && typeof runtime.lanes === 'object' ? runtime.lanes : {};

  if (fallbackLaneId && lanes[fallbackLaneId]) {
    return {
      laneId: fallbackLaneId,
      lane: lanes[fallbackLaneId],
    };
  }

  const currentPath = resolve(hookCwd || rootCwd);

  for (const [laneId, lane] of Object.entries(lanes)) {
    const worktreePath = requireString(lane?.worktree_path);
    if (!worktreePath) {
      continue;
    }

    const lanePath = resolve(rootCwd, worktreePath);
    if (currentPath === lanePath || currentPath.startsWith(`${lanePath}${sep}`)) {
      return { laneId, lane };
    }
  }

  return { laneId: '', lane: null };
}

function deriveSessionOwner({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) return 'pm';
  if (activeGate === 'design_readiness') return 'cto';
  if (activeGate === 'implementation_readiness') return 'lead-dev';
  if (activeGate === 'qa') return 'qa';
  if (activeGate === 'security') return 'security-reviewer';
  if (activeGate === 'delivery_readiness' || activeGate === 'customer_review') return 'ceo';
  if (phaseId === 'discovery') return 'pm';
  if (phaseId === 'design') return 'cto';
  if (phaseId === 'develop' || phaseId === 'fix') return 'lead-dev';
  if (phaseId === 'qa') return 'qa';
  if (phaseId === 'security') return 'security-reviewer';
  if (phaseId === 'delivery') return 'ceo';
  return '';
}

function deriveCompanyGateFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const observedPhase = state ? resolvePhase(state).id : '';
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const manualGate = runtime?.company_gate_mode === 'manual';
  const phaseAnchor = typeof runtime?.company_phase_anchor === 'string' ? runtime.company_phase_anchor : '';

  if (manualGate && !observedPhase) {
    return {
      company_gate_mode: 'manual',
      company_phase_anchor: phaseAnchor,
      active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
      active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (manualGate && phaseAnchor === observedPhase) {
    return {
      company_gate_mode: 'manual',
      company_phase_anchor: observedPhase,
      active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
      active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'discovery') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'spec_readiness',
      active_gate_owner: 'pm',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'design') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'design_readiness',
      active_gate_owner: 'cto',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'develop' || observedPhase === 'fix') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'implementation_readiness',
      active_gate_owner: 'lead-dev',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'qa') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'qa',
      active_gate_owner: 'qa',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'security') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'security',
      active_gate_owner: 'security-reviewer',
      delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    };
  }

  if (observedPhase === 'delivery') {
    const readiness = customerBlockers.length > 0
      ? 'in_progress'
      : internalBlockers.length > 0
        ? 'blocked'
        : runtime?.delivery_readiness === 'delivered'
          ? 'delivered'
          : 'ready_for_review';

    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: customerBlockers.length > 0 ? 'customer_review' : 'delivery_readiness',
      active_gate_owner: 'ceo',
      delivery_readiness: readiness,
    };
  }

  if (observedPhase === 'complete') {
    return {
      company_gate_mode: 'auto',
      company_phase_anchor: observedPhase,
      active_gate: 'customer_review',
      active_gate_owner: 'ceo',
      delivery_readiness: 'delivered',
    };
  }

  return {
    company_gate_mode: manualGate ? 'manual' : 'auto',
    company_phase_anchor: observedPhase,
    active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
    active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
    delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
  };
}

function deriveSessionGoal({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const readiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const phaseId = state ? resolvePhase(state).id : '';

  if (customerBlockers.length > 0 && !['develop', 'qa', 'security', 'fix'].includes(phaseId)) {
    return `Resolve customer blocker: ${customerBlockers[0].summary}`;
  }
  if (activeGate === 'design_readiness') return 'Close design readiness gate';
  if (activeGate === 'implementation_readiness') return 'Prepare reviewable implementation lanes';
  if (activeGate === 'qa') return 'Clear QA blockers and re-verify';
  if (activeGate === 'security') return 'Clear security blockers and re-check delivery readiness';
  if (activeGate === 'delivery_readiness') {
    return readiness === 'blocked' ? 'Make delivery ready for customer review' : 'Prepare delivery review package';
  }
  if (activeGate === 'customer_review') return 'Present delivery for customer review';
  if (internalBlockers.length > 0) return `Clear internal blocker: ${internalBlockers[0].summary}`;
  if (phaseId === 'discovery') return 'Clarify V1 scope and prepare spec handoff';
  if (phaseId === 'design') return 'Close architecture and design decisions for implementation';
  if (phaseId === 'develop') return 'Advance the next implementation lane';
  if (phaseId === 'fix') return 'Resolve blockers and re-run verification';
  if (phaseId === 'delivery') return 'Prepare final delivery review';
  return '';
}

function deriveSessionExitCriteria({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const activeGate = requireString(runtime?.active_gate);
  const phaseId = state ? resolvePhase(state).id : '';

  if (activeGate === 'design_readiness') return ['architecture approved internally', 'design specs complete', 'technical claims verified'];
  if (activeGate === 'implementation_readiness') return ['lanes defined', 'owners assigned', 'session implementation brief written'];
  if (activeGate === 'qa') return ['QA blockers cleared', 'verification rerun complete'];
  if (activeGate === 'security') return ['security blockers cleared', 'delivery gate re-evaluated'];
  if (activeGate === 'delivery_readiness') return ['blocker count is zero', 'delivery report ready'];
  if (phaseId === 'discovery') return ['critical customer questions resolved', 'spec ready for internal review'];
  if (phaseId === 'develop') return ['current reviewable slice completed', 'next session handoff recorded'];
  return [];
}

function deriveSessionFields({ state = null, runtime = DEFAULT_RUNTIME } = {}) {
  const observedPhase = state ? resolvePhase(state).id : '';
  const observedGate = requireString(runtime?.active_gate);
  const observedCustomerBlockers = normalizeBlockers(runtime?.customer_blockers).length;
  const observedInternalBlockers = normalizeBlockers(runtime?.internal_blockers).length;
  const briefMode = runtime?.session_brief_mode === 'manual' ? 'manual' : 'auto';
  const phaseAnchor = typeof runtime?.session_phase_anchor === 'string' ? runtime.session_phase_anchor : '';
  const gateAnchor = typeof runtime?.session_gate_anchor === 'string' ? runtime.session_gate_anchor : '';
  const customerAnchor = Number(runtime?.session_customer_blocker_count || 0);
  const internalAnchor = Number(runtime?.session_internal_blocker_count || 0);
  const anchorsMatch =
    briefMode === 'manual' &&
    phaseAnchor === observedPhase &&
    gateAnchor === observedGate &&
    customerAnchor === observedCustomerBlockers &&
    internalAnchor === observedInternalBlockers;

  if (anchorsMatch) {
    return {
      current_session_goal: runtime?.current_session_goal || '',
      session_exit_criteria: normalizeStringList(runtime?.session_exit_criteria),
      next_session_goal: runtime?.next_session_goal || '',
      next_session_owner: runtime?.next_session_owner || '',
      session_handoff_summary: runtime?.session_handoff_summary || '',
      session_brief_mode: 'manual',
      session_phase_anchor: observedPhase,
      session_gate_anchor: observedGate,
      session_customer_blocker_count: observedCustomerBlockers,
      session_internal_blocker_count: observedInternalBlockers,
    };
  }

  const nextOwner = deriveSessionOwner({ state, runtime });
  const goal = deriveSessionGoal({ state, runtime });
  const exitCriteria = deriveSessionExitCriteria({ state, runtime });

  return {
    current_session_goal: goal,
    session_exit_criteria: exitCriteria,
    next_session_goal: goal,
    next_session_owner: nextOwner,
    session_handoff_summary: goal && nextOwner ? `${goal} -> ${nextOwner}` : '',
    session_brief_mode: 'auto',
    session_phase_anchor: observedPhase,
    session_gate_anchor: observedGate,
    session_customer_blocker_count: observedCustomerBlockers,
    session_internal_blocker_count: observedInternalBlockers,
  };
}

export const LANE_STATUS_SEQUENCE = ['pending', 'ready', 'in_progress', 'blocked', 'in_review', 'merged', 'done'];

export function normalizeLaneStatus(value) {
  if (typeof value !== 'string') {
    return 'pending';
  }

  const lowered = value.trim().toLowerCase();
  return LANE_STATUS_SEQUENCE.includes(lowered) ? lowered : 'pending';
}

export function normalizeLaneReviewState(value) {
  if (typeof value !== 'string') {
    return 'none';
  }

  const lowered = value.trim().toLowerCase();
  if (lowered === 'changes-requested') {
    return 'changes_requested';
  }

  return LANE_REVIEW_SEQUENCE.includes(lowered) ? lowered : 'none';
}

export function normalizeLaneMergeState(value) {
  if (typeof value !== 'string') {
    return 'none';
  }

  const lowered = value.trim().toLowerCase();
  if (lowered === 'rebase') {
    return 'rebasing';
  }

  return LANE_MERGE_SEQUENCE.includes(lowered) ? lowered : 'none';
}

function normalizeHandoffNotes(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      ...entry,
      at: typeof entry.at === 'string' ? entry.at : '',
      kind: typeof entry.kind === 'string' ? entry.kind : 'handoff',
      note: typeof entry.note === 'string' ? entry.note : '',
    }));
}

export function normalizeLane(lane = {}, fallbackId = '') {
  const source = lane && typeof lane === 'object' ? lane : {};
  const id = String(source.id || fallbackId || '').trim();
  return {
    ...source,
    id,
    title: String(source.title || id || 'unnamed lane'),
    owner_role: typeof source.owner_role === 'string' ? source.owner_role : 'developer',
    owner_agent_id: typeof source.owner_agent_id === 'string' ? source.owner_agent_id : '',
    owner_agent_type: typeof source.owner_agent_type === 'string' ? source.owner_agent_type : '',
    worktree_path: typeof source.worktree_path === 'string' ? source.worktree_path : '',
    dependencies: Array.isArray(source.dependencies) ? source.dependencies.map(String) : [],
    status: normalizeLaneStatus(source.status),
    session_handoff_notes: typeof source.session_handoff_notes === 'string' ? source.session_handoff_notes : '',
    review_state: normalizeLaneReviewState(source.review_state),
    merge_state: normalizeLaneMergeState(source.merge_state),
    scope: Array.isArray(source.scope) ? source.scope.map(String) : [],
    acceptance_criteria: Array.isArray(source.acceptance_criteria) ? source.acceptance_criteria.map(String) : [],
    last_event_at: typeof source.last_event_at === 'string' ? source.last_event_at : '',
    blocked_reason: typeof source.blocked_reason === 'string' ? source.blocked_reason : '',
    reviewer: typeof source.reviewer === 'string' ? source.reviewer : '',
    task_file: typeof source.task_file === 'string' ? source.task_file : '',
    handoff_notes: normalizeHandoffNotes(source.handoff_notes),
  };
}

export function normalizeRuntimeLanes(lanes = {}) {
  if (Array.isArray(lanes)) {
    return Object.fromEntries(lanes.map((lane, index) => {
      const normalized = normalizeLane(lane, lane?.id || `lane-${index + 1}`);
      return [normalized.id, normalized];
    }));
  }

  if (!lanes || typeof lanes !== 'object') {
    return {};
  }

  return Object.fromEntries(Object.entries(lanes).map(([id, lane]) => {
    const normalized = normalizeLane(lane, id);
    return [normalized.id, normalized];
  }));
}

export function summarizeLaneCounts(runtime = DEFAULT_RUNTIME) {
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  const counts = { total: lanes.length, pending: 0, ready: 0, in_progress: 0, blocked: 0, in_review: 0, merged: 0, done: 0 };
  for (const lane of lanes) {
    counts[lane.status] += 1;
  }
  return counts;
}

export function selectNextLane(runtime = DEFAULT_RUNTIME) {
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  if (!lanes.length) {
    return '';
  }
  if (typeof runtime?.next_lane === 'string' && runtime.next_lane && lanes.some(lane => lane.id === runtime.next_lane)) {
    return runtime.next_lane;
  }
  const priorityChecks = [
    lane => lane.merge_state === 'rebasing',
    lane => lane.review_state === 'changes_requested',
    lane => lane.status === 'in_progress',
    lane => lane.status === 'ready',
    lane => lane.status === 'in_review',
    lane => lane.status === 'blocked',
    lane => lane.status === 'pending',
    lane => lane.status === 'merged',
    lane => lane.status === 'done',
  ];

  for (const matches of priorityChecks) {
    const lane = lanes.find(matches);
    if (lane) {
      return lane.id;
    }
  }
  return '';
}

/**
 * Determines the best continuation target for `forge continue`.
 * Returns { kind, target, detail } where:
 *   kind: 'customer_blocker' | 'internal_blocker' | 'active_lane' | 'next_lane' | 'phase'
 *   target: lane ID or phase ID
 *   detail: human-readable reason
 */
export function selectContinuationTarget(state = {}, runtime = DEFAULT_RUNTIME) {
  const phase = resolvePhase(state);
  const customerBlockers = runtime?.customer_blockers;
  const internalBlockers = runtime?.internal_blockers;

  // Priority 1: Customer blocker — needs user input
  if (Array.isArray(customerBlockers) && customerBlockers.length > 0) {
    return {
      kind: 'customer_blocker',
      target: phase.id,
      detail: customerBlockers[0],
    };
  }

  // Priority 2: Internal blocker — route to owning team
  if (Array.isArray(internalBlockers) && internalBlockers.length > 0) {
    const gateOwner = runtime?.active_gate_owner || '';
    return {
      kind: 'internal_blocker',
      target: phase.id,
      detail: `${internalBlockers[0]}${gateOwner ? ` (owner: ${gateOwner})` : ''}`,
    };
  }

  // Priority 3: In-progress lane with handoff notes
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  const activeWithHandoff = lanes.find(
    lane => lane.status === 'in_progress' && lane.handoff_notes && lane.handoff_notes.length > 0
  );
  if (activeWithHandoff) {
    const lastNote = activeWithHandoff.handoff_notes[activeWithHandoff.handoff_notes.length - 1];
    return {
      kind: 'active_lane',
      target: activeWithHandoff.id,
      detail: typeof lastNote === 'string' ? lastNote : (lastNote?.note || lastNote?.text || ''),
    };
  }

  // Priority 4: Designated next lane
  const nextLane = selectNextLane(runtime);
  if (nextLane) {
    return {
      kind: 'next_lane',
      target: nextLane,
      detail: '',
    };
  }

  // Priority 5: Phase fallback
  return {
    kind: 'phase',
    target: phase.id,
    detail: '',
  };
}

export function summarizeLaneBriefs(runtime = DEFAULT_RUNTIME, limit = 3) {
  const lanes = Object.values(normalizeRuntimeLanes(runtime?.lanes || {}));
  return lanes
    .filter(lane => lane.status !== 'done' && lane.status !== 'merged')
    .slice(0, limit)
    .map((lane) => {
      if (lane.merge_state === 'rebasing') {
        return `${lane.id}:rebase`;
      }
      if (lane.review_state === 'changes_requested') {
        return `${lane.id}:changes`;
      }
      return `${lane.id}:${lane.status}`;
    });
}

export function detectTaskType(message = '') {
  const text = String(message).toLowerCase();

  if (!text.trim()) {
    return 'general';
  }

  if (/(\bbug\b|\bfix\b|\bregression\b|오류|버그|고쳐|\bdiagnos\w*\b|\btroubleshoot\b|\brca\b|\bwhy\b)/.test(text)) {
    return 'bugfix';
  }

  if (/(\brefactor\b|\bcleanup\b|정리|리팩토링|\bsimplify\b|\brename\b)/.test(text)) {
    return 'refactor';
  }

  if (/(\breview\b|리뷰|코드리뷰|\bpr review\b|\bcode review\b)/.test(text)) {
    return 'review';
  }

  if (/(\bquestion\b|\bexplain\b|\bwhat\b|어떻게|설명|질문|뭐야|왜)/.test(text)) {
    return 'question';
  }

  if (/(\bfull\b|\ball phases\b|\bpipeline\b|\bentire\b|\bwhole system\b|\bcompany\b|\bworkflow\b|하네스|전체|워크플로우|\bphase\b|팀)/.test(text)) {
    return 'pipeline';
  }

  if (/(\bfeature\b|\bimplement\b|\badd\b|\bbuild\b|\bcreate\b|\bpage\b|\bscreen\b|기능|추가|구현|만들)/.test(text)) {
    return 'feature';
  }

  return 'general';
}

export function classifyTierFromMessage(message = '', state = null) {
  const text = String(message).toLowerCase();
  const taskType = detectTaskType(text);

  if (/\bforge:ignite\b|\bset up forge\b|\bbuild a harness\b|전체|all phases|full pipeline|하네스/.test(text)) {
    return 'full';
  }

  if (taskType === 'pipeline') {
    return 'full';
  }

  if (taskType === 'question' || taskType === 'bugfix') {
    return 'light';
  }

  if (taskType === 'review') {
    const phaseTier = inferTierFromState(state);
    return phaseTier === 'full' ? 'medium' : 'light';
  }

  if (taskType === 'feature' || taskType === 'refactor') {
    return 'medium';
  }

  return inferTierFromState(state);
}

export function inferTierFromState(state = null) {
  if (!state || Object.keys(state).length === 0) {
    return 'light';
  }

  if (state.tier) {
    return normalizeTier(state.tier);
  }

  const phase = resolvePhase(state);
  const taskCount = state.tasks?.length || 0;
  const queueCount = state.pr_queue?.length || 0;
  const holeCount = state.holes?.length || 0;

  if (['intake', 'discovery', 'design', 'delivery'].includes(phase.id)) {
    return 'full';
  }

  if (phase.id === 'develop') {
    return taskCount >= 6 || queueCount >= 4 ? 'full' : 'medium';
  }

  if (phase.id === 'fix') {
    return holeCount <= 2 ? 'light' : 'medium';
  }

  if (['qa', 'security'].includes(phase.id)) {
    return 'medium';
  }

  return 'light';
}

function uniqueAgents(agents = []) {
  return [...new Set(agents.filter(Boolean))];
}

function recommendedAgentsForCompanyRuntime(runtime = {}, fallback = []) {
  const companyMode = normalizeCompanyMode(runtime?.company_mode);
  if (companyMode !== 'autonomous_company') {
    return fallback;
  }

  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const activeGate = requireString(runtime?.active_gate);
  const activeGateOwner = requireString(runtime?.active_gate_owner);
  const readiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const nextSessionOwner = requireString(runtime?.next_session_owner);

  if (nextSessionOwner) {
    return uniqueAgents([nextSessionOwner, activeGateOwner, ...fallback]);
  }

  if (customerBlockers.length > 0) {
    return uniqueAgents(['ceo', 'pm', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'design_readiness') {
    return uniqueAgents(['cto', 'designer', 'researcher', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'implementation_readiness') {
    return uniqueAgents(['lead-dev', 'developer', 'qa', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'qa') {
    return uniqueAgents(['qa', 'developer', 'lead-dev', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'security') {
    return uniqueAgents(['security-reviewer', 'developer', 'lead-dev', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'delivery_readiness') {
    if (readiness === 'blocked' || internalBlockers.length > 0) {
      return uniqueAgents(['qa', 'security-reviewer', 'ceo', activeGateOwner, ...fallback]);
    }
    return uniqueAgents(['ceo', 'tech-writer', 'qa', activeGateOwner, ...fallback]);
  }

  if (activeGate === 'customer_review') {
    return uniqueAgents(['ceo', 'tech-writer', activeGateOwner, ...fallback]);
  }

  return activeGateOwner ? uniqueAgents([activeGateOwner, ...fallback]) : fallback;
}

export function recommendedAgentsFor({ tier = 'light', taskType = 'general', phaseId = 'develop', runtime = null } = {}) {
  const normalizedTier = normalizeTier(tier);

  if (normalizedTier === 'off') {
    return [];
  }

  if (normalizedTier === 'light') {
    if (taskType === 'bugfix') {
      return ['developer', 'troubleshooter'];
    }
    if (taskType === 'refactor') {
      return ['developer', 'lead-dev'];
    }
    return recommendedAgentsForCompanyRuntime(runtime, ['developer']);
  }

  if (normalizedTier === 'medium') {
    if (taskType === 'feature') {
      return recommendedAgentsForCompanyRuntime(runtime, ['cto', 'developer', 'qa']);
    }
    if (taskType === 'refactor') {
      return recommendedAgentsForCompanyRuntime(runtime, ['developer', 'lead-dev', 'qa']);
    }
    return recommendedAgentsForCompanyRuntime(runtime, ['developer', 'qa']);
  }

  if (phaseId === 'discovery') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'pm', 'researcher']);
  }

  if (phaseId === 'design') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'cto', 'designer', 'researcher']);
  }

  if (phaseId === 'delivery') {
    return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'tech-writer', 'qa']);
  }

  return recommendedAgentsForCompanyRuntime(runtime, ['ceo', 'pm', 'cto', 'lead-dev', 'developer', 'qa', 'security-reviewer', 'tech-writer']);
}

export function compactForgeContext(state, runtime = DEFAULT_RUNTIME) {
  if (!state) {
    return '[Forge] light idle';
  }

  const phase = resolvePhase(state);
  const spec = state.spec_approved ? '✓spec' : '×spec';
  const design = state.design_approved ? '✓design' : '×design';
  const tier = normalizeTier(runtime?.active_tier || state.tier || inferTierFromState(state));
  const companyMode = normalizeCompanyMode(runtime?.company_mode);
  const activeGate = requireString(runtime?.active_gate);
  const deliveryReadiness = normalizeDeliveryReadiness(runtime?.delivery_readiness);
  const customerBlockers = normalizeBlockers(runtime?.customer_blockers);
  const internalBlockers = normalizeBlockers(runtime?.internal_blockers);
  const currentSessionGoal = requireString(runtime?.current_session_goal);
  const nextSessionOwner = requireString(runtime?.next_session_owner);
  const agentCount = Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents.length : 0;
  const laneCounts = summarizeLaneCounts(runtime);
  const nextLane = selectNextLane(runtime);
  const nextLaneRecord = nextLane ? normalizeLane(runtime?.lanes?.[nextLane], nextLane) : null;
  let focusHint = '';
  if (nextLaneRecord?.merge_state === 'rebasing') {
    focusHint = ' rebase';
  } else if (nextLaneRecord?.review_state === 'changes_requested') {
    focusHint = ' review!';
  } else if (nextLaneRecord?.status === 'in_review') {
    focusHint = ' review';
  }
  const companySuffix = [
    companyMode === 'autonomous_company' ? 'auto' : '',
    activeGate ? `gate:${activeGate}` : '',
    customerBlockers.length ? `c${customerBlockers.length}` : '',
    internalBlockers.length ? `i${internalBlockers.length}` : '',
    currentSessionGoal ? 'goal' : '',
    nextSessionOwner ? `next:${nextSessionOwner}` : '',
    deliveryReadiness === 'ready_for_review' ? 'deliver!' : '',
    deliveryReadiness === 'blocked' ? 'hold' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const laneSuffix = laneCounts.total ? ` ${laneCounts.total}l${laneCounts.blocked ? ` ${laneCounts.blocked}b` : ''}${nextLane ? ` ↺${nextLane}${focusHint}` : ''}` : '';
  const mode = state.mode === 'repair' ? 'repair' : 'build';
  const seq = phase.sequence || PHASE_SEQUENCE;
  const total = seq.length - 1; // exclude 'complete'

  // Actionable one-liner: most important thing first
  const truncate = (s, max = 50) => s.length > max ? s.slice(0, max - 1) + '…' : s;
  let action = '';
  if (customerBlockers.length) {
    action = ` → waiting on client: ${truncate(String(customerBlockers[0]?.summary || customerBlockers[0]))}`;
  } else if (internalBlockers.length) {
    action = ` → blocked: ${truncate(String(internalBlockers[0]?.summary || internalBlockers[0]))}`;
  } else if (deliveryReadiness === 'ready_for_review') {
    action = ' → ready for review';
  } else if (nextLane && focusHint) {
    action = ` → ${nextLane}${focusHint}`;
  }

  return `[Forge] ${mode} ${tier} ${phase.id} ${phase.index}/${total} ${spec} ${design}${companySuffix ? ` ${companySuffix}` : ''}${agentCount ? ` ${agentCount}a` : ''}${laneSuffix}${action}`;
}

export function summarizePendingWork(state, runtime = null) {
  if (!state) {
    return [];
  }

  const phase = resolvePhase(state);
  const pending = [];

  if (!state.spec_approved && phase.index >= PHASE_SEQUENCE.indexOf('design')) {
    pending.push('spec');
  }

  if (!state.design_approved && phase.index >= PHASE_SEQUENCE.indexOf('develop')) {
    pending.push('design');
  }

  if ((state.holes?.length || 0) > 0 && phase.id !== 'complete') {
    pending.push(`${state.holes.length} holes`);
  }

  if ((state.tasks?.length || 0) > 0 && phase.id === 'develop') {
    pending.push(`${state.tasks.length} tasks`);
  }

  if (runtime) {
    const laneCounts = summarizeLaneCounts(runtime);
    if (laneCounts.total > 0 && phase.id !== 'complete') {
      pending.push(`${laneCounts.total} lane${laneCounts.total === 1 ? '' : 's'}`);
      if (laneCounts.blocked > 0) {
        pending.push(`${laneCounts.blocked} blocked`);
      }
    }
  }

  if ((state.pr_queue?.length || 0) > 0) {
    pending.push(`${state.pr_queue.length} prs`);
  }

  if (phase.id !== 'complete' && pending.length === 0) {
    pending.push(phase.id);
  }

  return pending;
}

export function messageLooksInteractive(message = '') {
  const text = String(message).toLowerCase();
  const patterns = [
    /\bconfirm\b(?!ed|ing)/,
    /\bapproval\b/,
    /\bapprove\b(?!d)/,
    /\bchoose\b/,
    /\bwhich option\b/,
    /\bwaiting for\b/,
    /\bneed your input\b/,
    /\bdo you want\b/,
    /계속할까요/,
    /확인(?!.*완료)/,
    /선택/,
    /어느/,
    /입력이 필요/,
  ];

  return patterns.some(re => re.test(text));
}

export function normalizeStateShape(state = {}) {
  const phase = resolvePhase(state);
  const status = typeof state.status === 'string' ? state.status : 'pending';
  const tier = normalizeTier(state.tier ?? inferTierFromState(state));

  return {
    ...state,
    phase: phase.id,
    phase_id: phase.id,
    phase_index: phase.index,
    phase_name: phase.label,
    status,
    tier,
    mode: typeof state.mode === 'string' ? state.mode : 'build',
    agents_active: Array.isArray(state.agents_active) ? state.agents_active : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    holes: Array.isArray(state.holes) ? state.holes : [],
    pr_queue: Array.isArray(state.pr_queue) ? state.pr_queue : [],
    stats: mergeStats(state.stats),
  };
}

export function readForgeState(cwd = '.') {
  const raw = readJsonFile(getStatePath(cwd));
  if (!raw) {
    return null;
  }

  return normalizeStateShape(raw);
}

export function writeForgeState(cwd = '.', state) {
  ensureForgeDir(cwd);
  const normalized = normalizeStateShape(state);
  normalized.updated_at = new Date().toISOString();
  writeJsonFile(getStatePath(cwd), normalized);
  const existingRuntime = readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME);
  writeRuntimeState(cwd, existingRuntime);
  return normalized;
}

export function readRuntimeState(cwd = '.') {
  return normalizeRuntimeState(
    readJsonFile(getRuntimePath(cwd), DEFAULT_RUNTIME),
    { state: readForgeState(cwd) },
  );
}

function normalizeRuntimeState(runtime = DEFAULT_RUNTIME, { state = null } = {}) {
  const normalized = {
    ...DEFAULT_RUNTIME,
    ...(runtime || {}),
    active_tier: normalizeTier(runtime?.active_tier || 'light'),
    company_mode: normalizeCompanyMode(runtime?.company_mode),
    company_gate_mode: runtime?.company_gate_mode === 'manual' ? 'manual' : 'auto',
    company_phase_anchor: typeof runtime?.company_phase_anchor === 'string' ? runtime.company_phase_anchor : '',
    active_gate: typeof runtime?.active_gate === 'string' ? runtime.active_gate : '',
    active_gate_owner: typeof runtime?.active_gate_owner === 'string' ? runtime.active_gate_owner : '',
    delivery_readiness: normalizeDeliveryReadiness(runtime?.delivery_readiness),
    customer_blockers: normalizeBlockers(runtime?.customer_blockers),
    internal_blockers: normalizeBlockers(runtime?.internal_blockers),
    current_session_goal: typeof runtime?.current_session_goal === 'string' ? runtime.current_session_goal : '',
    session_exit_criteria: normalizeStringList(runtime?.session_exit_criteria),
    next_session_goal: typeof runtime?.next_session_goal === 'string' ? runtime.next_session_goal : '',
    next_session_owner: typeof runtime?.next_session_owner === 'string' ? runtime.next_session_owner : '',
    session_handoff_summary: typeof runtime?.session_handoff_summary === 'string' ? runtime.session_handoff_summary : '',
    session_brief_mode: runtime?.session_brief_mode === 'manual' ? 'manual' : 'auto',
    session_phase_anchor: typeof runtime?.session_phase_anchor === 'string' ? runtime.session_phase_anchor : '',
    session_gate_anchor: typeof runtime?.session_gate_anchor === 'string' ? runtime.session_gate_anchor : '',
    session_customer_blocker_count: Number(runtime?.session_customer_blocker_count || 0),
    session_internal_blocker_count: Number(runtime?.session_internal_blocker_count || 0),
    recommended_agents: Array.isArray(runtime?.recommended_agents) ? runtime.recommended_agents : [],
    active_agents: runtime?.active_agents && typeof runtime.active_agents === 'object' ? runtime.active_agents : {},
    recent_agents: Array.isArray(runtime?.recent_agents) ? runtime.recent_agents : [],
    recent_failures: Array.isArray(runtime?.recent_failures) ? runtime.recent_failures : [],
    lanes: normalizeRuntimeLanes(runtime?.lanes || {}),
    stop_guard: {
      ...DEFAULT_RUNTIME.stop_guard,
      ...(runtime?.stop_guard || {}),
    },
    stats: mergeStats(runtime?.stats),
  };

  Object.assign(normalized, deriveCompanyGateFields({ state, runtime: normalized }));
  Object.assign(normalized, deriveSessionFields({ state, runtime: normalized }));

  normalized.active_worktrees = syncActiveWorktreesFromLanes(normalized);
  normalized.next_lane = selectNextLane({
    ...normalized,
    active_worktrees: normalized.active_worktrees,
  });
  return normalized;
}

export function writeRuntimeState(cwd = '.', runtime) {
  ensureForgeDir(cwd);
  const next = {
    ...normalizeRuntimeState(runtime, { state: readForgeState(cwd) }),
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(getRuntimePath(cwd), next);
  return next;
}

function mutateLane(runtime = DEFAULT_RUNTIME, laneId, updater) {
  const normalizedRuntime = normalizeRuntimeState(runtime);
  const lane = normalizeLane(normalizedRuntime.lanes[laneId], laneId);
  const nextLane = normalizeLane(updater(lane), laneId);

  return normalizeRuntimeState({
    ...normalizedRuntime,
    lanes: {
      ...normalizedRuntime.lanes,
      [laneId]: nextLane,
    },
  });
}

function appendLaneNote(lane, kind, note, at) {
  if (!note) {
    return normalizeHandoffNotes(lane.handoff_notes);
  }

  return [
    ...normalizeHandoffNotes(lane.handoff_notes),
    {
      at,
      kind,
      note,
    },
  ];
}

const LANE_DONE_STATUSES = new Set(['done', 'merged']);

export function syncActiveWorktreesFromLanes(runtime = DEFAULT_RUNTIME) {
  const lanes = normalizeRuntimeLanes(runtime?.lanes || runtime);
  return Object.fromEntries(
    Object.values(lanes)
      .filter(lane => lane.worktree_path && !LANE_DONE_STATUSES.has(lane.status))
      .map(lane => [lane.id, lane.worktree_path]),
  );
}

export function initLaneRecord(runtime = DEFAULT_RUNTIME, {
  laneId,
  title = '',
  worktreePath = '',
  taskFile = '',
  reviewer = '',
  dependencies = [],
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    id: laneId,
    title: title || lane.title || laneId,
    worktree_path: worktreePath || lane.worktree_path,
    task_file: taskFile || lane.task_file,
    reviewer: reviewer || lane.reviewer,
    dependencies: dependencies.length ? dependencies.map(String) : lane.dependencies,
    status: lane.status === 'pending' && lane.title === 'unnamed lane' ? 'pending' : lane.status,
    last_event_at: now,
  }));
}

export function setLaneOwner(runtime = DEFAULT_RUNTIME, {
  laneId,
  ownerRole = 'developer',
  ownerAgentId = '',
  ownerAgentType = '',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    owner_role: ownerRole || lane.owner_role,
    owner_agent_id: ownerAgentId || lane.owner_agent_id,
    owner_agent_type: ownerAgentType || lane.owner_agent_type,
    last_event_at: now,
  }));
}

export function recordLaneHandoff(runtime = DEFAULT_RUNTIME, {
  laneId,
  note,
  kind = 'handoff',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, kind, note, now),
    last_event_at: now,
  }));
}

export function setLaneStatus(runtime = DEFAULT_RUNTIME, {
  laneId,
  status,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextStatus = normalizeLaneStatus(status);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    status: nextStatus,
    blocked_reason: nextStatus === 'blocked' ? (note || lane.blocked_reason) : '',
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'status', note, now),
    review_state: nextStatus === 'in_review' && lane.review_state === 'none' ? 'pending' : lane.review_state,
    merge_state: nextStatus === 'merged' ? 'merged' : lane.merge_state,
    last_event_at: now,
  }));
}

export function markLaneReviewState(runtime = DEFAULT_RUNTIME, {
  laneId,
  reviewState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextReviewState = normalizeLaneReviewState(reviewState);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    review_state: nextReviewState,
    status: nextReviewState === 'none' ? lane.status : 'in_review',
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'review', note, now),
    last_event_at: now,
  }));
}

export function markLaneMergeState(runtime = DEFAULT_RUNTIME, {
  laneId,
  mergeState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextMergeState = normalizeLaneMergeState(mergeState);
  return mutateLane(runtime, laneId, lane => ({
    ...lane,
    merge_state: nextMergeState,
    status: nextMergeState === 'merged' ? 'merged' : lane.status,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'merge', note, now),
    last_event_at: now,
  }));
}

/**
 * Check whether a repair phase's required artifacts exist.
 * Returns { canAdvance, missing[] } for the given repair phase.
 */
export function checkRepairGate(cwd, phaseId) {
  const gate = REPAIR_PHASE_GATES[phaseId];
  if (!gate) {
    return { canAdvance: true, missing: [] };
  }
  const forgeDir = join(resolveForgeBaseDir(cwd), '.forge');
  const missing = [];
  for (const req of gate.requires) {
    const artifactPath = join(forgeDir, req);
    if (!existsSync(artifactPath)) {
      missing.push(req);
    }
  }
  return { canAdvance: missing.length === 0, missing };
}

/**
 * Get the phase sequence for a given mode.
 */
export function getPhaseSequence(mode = 'build') {
  if (mode === 'repair') return REPAIR_PHASE_SEQUENCE;
  if (mode === 'express') return EXPRESS_PHASE_SEQUENCE;
  return PHASE_SEQUENCE;
}

export function setSessionBrief(runtime = DEFAULT_RUNTIME, {
  currentSessionGoal = '',
  sessionExitCriteria = [],
  nextSessionGoal = '',
  nextSessionOwner = '',
  sessionHandoffSummary = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    current_session_goal: currentSessionGoal || runtime?.current_session_goal || '',
    session_exit_criteria: sessionExitCriteria.length ? sessionExitCriteria : runtime?.session_exit_criteria || [],
    next_session_goal: nextSessionGoal || runtime?.next_session_goal || '',
    next_session_owner: nextSessionOwner || runtime?.next_session_owner || '',
    session_handoff_summary: sessionHandoffSummary || runtime?.session_handoff_summary || '',
    session_brief_mode: 'manual',
  });
}

export function writeSessionHandoff(runtime = DEFAULT_RUNTIME, {
  summary,
  nextSessionGoal = '',
  nextSessionOwner = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    session_handoff_summary: summary || runtime?.session_handoff_summary || '',
    next_session_goal: nextSessionGoal || runtime?.next_session_goal || '',
    next_session_owner: nextSessionOwner || runtime?.next_session_owner || '',
    session_brief_mode: 'manual',
  });
}

export function setCompanyGate(runtime = DEFAULT_RUNTIME, {
  activeGate = '',
  activeGateOwner = '',
  deliveryReadiness = '',
  customerBlockers = null,
  internalBlockers = null,
  phaseAnchor = '',
} = {}) {
  return normalizeRuntimeState({
    ...runtime,
    company_gate_mode: 'manual',
    company_phase_anchor: phaseAnchor || runtime?.company_phase_anchor || '',
    active_gate: activeGate || runtime?.active_gate || '',
    active_gate_owner: activeGateOwner || runtime?.active_gate_owner || '',
    delivery_readiness: deliveryReadiness || runtime?.delivery_readiness || 'unknown',
    customer_blockers: customerBlockers ?? runtime?.customer_blockers ?? [],
    internal_blockers: internalBlockers ?? runtime?.internal_blockers ?? [],
  });
}

export function updateRuntimeState(cwd = '.', updater) {
  const current = readRuntimeState(cwd);
  const next = updater(current);
  return writeRuntimeState(cwd, next);
}

export function appendRecent(list, entry, limit = 20) {
  return [entry, ...list].slice(0, limit);
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

export function readActiveTier(cwd = '.', state = null, input = {}) {
  const envTier = process.env.FORGE_TIER;
  if (envTier) {
    return normalizeTier(envTier);
  }

  const runtimePath = getRuntimePath(cwd);
  if (existsSync(runtimePath)) {
    const runtime = readRuntimeState(cwd);
    return normalizeTier(runtime.active_tier);
  }

  if (state?.tier) {
    return normalizeTier(state.tier);
  }

  return classifyTierFromMessage(input?.message || input?.content || '', state);
}

export function updateAdaptiveTier(cwd = '.', { state = null, message = '' } = {}) {
  const inferredTier = classifyTierFromMessage(message, state);
  const taskType = detectTaskType(message);
  const phaseId = state ? resolvePhase(state).id : 'develop';
  const currentRuntime = readRuntimeState(cwd);
  const recommendedAgents = recommendedAgentsFor({ tier: inferredTier, taskType, phaseId, runtime: currentRuntime });

  const runtime = updateRuntimeState(cwd, current => ({
    ...current,
    active_tier: inferredTier,
    last_task_type: taskType,
    recommended_agents: recommendedAgents,
    stats: {
      ...current.stats,
      started_at: current.stats.started_at || new Date().toISOString(),
      last_prompt_at: new Date().toISOString(),
    },
  }));

  return {
    tier: inferredTier,
    taskType,
    recommendedAgents,
    runtime,
  };
}

export function detectWriteRisk(input = {}) {
  const toolInput = input?.tool_input || input || {};
  const filePath = String(
    toolInput.file_path ||
      toolInput.path ||
      toolInput.target_file ||
      toolInput.file ||
      '',
  );
  const content = String(
    toolInput.content ||
      toolInput.new_string ||
      toolInput.old_string ||
      toolInput.insert_text ||
      '',
  ).toLowerCase();

  const combined = `${filePath.toLowerCase()}\n${content}`;

  if (!combined.trim()) {
    return { level: 'medium', reason: 'unknown write target' };
  }

  if (/(package\.json|package-lock\.json|pnpm-lock|yarn\.lock|bun\.lock|deno\.json|requirements\.txt|pyproject\.toml|cargo\.toml)/.test(combined)) {
    return { level: 'high', reason: 'dependency surface changed' };
  }

  if (/(\bfetch\s*\(|\baxios\b|\bgraphql\b|\bsupabase\b|\bstripe\b(?!pattern|element|style)|\bvercel\b|\bopenai\b|\banthropic\b|\bprocess\.env\b|\bauthorization\b|\bbearer\s)/.test(combined)) {
    return { level: 'high', reason: 'external api or secret-sensitive code' };
  }

  if (/(contracts|code-rules|schema|interface|types?\/)/.test(combined)) {
    return { level: 'medium', reason: 'shared boundary file' };
  }

  if (/(utils?\/|helpers?\/|format|parse|normaliz|refactor)/.test(combined)) {
    return { level: 'low', reason: 'internal utility or repeat pattern' };
  }

  return { level: 'medium', reason: 'feature-level code change' };
}

export function recordStateStats(cwd = '.', updater) {
  const state = readForgeState(cwd);
  if (!state) {
    return null;
  }

  const next = updater(state.stats || mergeStats());
  return writeForgeState(cwd, {
    ...state,
    stats: mergeStats(next),
  });
}

/**
 * Update the claude-hud custom status line with current Forge state.
 * Shows phase, active agents, lanes, and blockers dynamically.
 * Safe to call from any hook — silently no-ops if HUD is not installed.
 */
export function updateHudLine(state, runtime) {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) return;
  const hudConfigDir = join(homeDir, '.claude', 'plugins', 'claude-hud');
  const hudConfigPath = join(hudConfigDir, 'config.json');
  if (!existsSync(hudConfigPath) && !existsSync(hudConfigDir)) return;

  let config = {};
  try {
    config = JSON.parse(readFileSync(hudConfigPath, 'utf8'));
  } catch { /* no config yet */ }

  // Use resolvePhase for consistent numbering with compactForgeContext
  const resolved = resolvePhase(state || {});
  const phase = resolved.id;
  const phaseIdx = resolved.index;
  const maxPhase = resolved.sequence.length - 1; // exclude 'complete'

  // Active agents
  const activeAgents = runtime?.active_agents || {};
  const agentEntries = Object.values(activeAgents).filter(a => a.status === 'running');
  const agentInfo = agentEntries.length > 0
    ? agentEntries.map(a => (a.type || 'agent').replace(/^forge:/, '')).join(' ')
    : '';

  // Active lanes
  const lanes = runtime?.lanes || {};
  const activeLanes = Object.values(lanes).filter(l => l.status !== 'done' && l.status !== 'merged');
  const laneInfo = activeLanes.length > 0
    ? activeLanes.map(l => `${l.id}(${l.status})`).join(' ')
    : '';

  const blockers = (runtime?.customer_blockers?.length || 0) + (runtime?.internal_blockers?.length || 0);

  // Build dynamic line: phase | agents | lanes | blockers
  const parts = [`forge:${phase} ${phaseIdx}/${maxPhase}`];
  if (agentInfo) parts.push(agentInfo);
  if (laneInfo) parts.push(laneInfo);
  parts.push(`${blockers} blockers`);

  const nextLine = parts.join(' | ').slice(0, 80);

  // Only write when the line actually changed to avoid HUD flickering
  config.display = config.display || {};
  if (config.display.customLine === nextLine) return;
  config.display.customLine = nextLine;
  writeFileSync(hudConfigPath, JSON.stringify(config, null, 2) + '\n');
}
