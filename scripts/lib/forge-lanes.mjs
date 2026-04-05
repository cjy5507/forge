import { resolve, sep } from 'path';
import { DEFAULT_RUNTIME, requireString } from './forge-io.mjs';

export const LANE_REVIEW_SEQUENCE = ['none', 'pending', 'changes_requested', 'approved'];
export const LANE_MERGE_SEQUENCE = ['none', 'queued', 'rebasing', 'ready', 'merged'];
export const LANE_STATUS_SEQUENCE = ['pending', 'ready', 'in_progress', 'blocked', 'in_review', 'merged', 'done'];
export const MAX_RUNTIME_LANES = 50;
export const MAX_HANDOFF_NOTES = 100;

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

export function normalizeHandoffNotes(entries) {
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
    }))
    .slice(-MAX_HANDOFF_NOTES);
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
    areas: Array.isArray(source.areas) ? source.areas.map(String) : [],
    model_hint: typeof source.model_hint === 'string' ? source.model_hint : '',
    acceptance_criteria: Array.isArray(source.acceptance_criteria) ? source.acceptance_criteria.map(String) : [],
    requirement_refs: Array.isArray(source.requirement_refs) ? source.requirement_refs.map(String) : [],
    acceptance_refs: Array.isArray(source.acceptance_refs) ? source.acceptance_refs.map(String) : [],
    evidence_refs: Array.isArray(source.evidence_refs) ? source.evidence_refs.map(String) : [],
    last_event_at: typeof source.last_event_at === 'string' ? source.last_event_at : '',
    blocked_reason: typeof source.blocked_reason === 'string' ? source.blocked_reason : '',
    reviewer: typeof source.reviewer === 'string' ? source.reviewer : '',
    task_file: typeof source.task_file === 'string' ? source.task_file : '',
    handoff_notes: normalizeHandoffNotes(source.handoff_notes),
  };
}

const TERMINAL_STATUSES = new Set(['done', 'merged']);

/** Evict lanes when count exceeds MAX_RUNTIME_LANES.
 *  Terminal (done/merged) lanes are evicted first (oldest first).
 *  If still over cap, oldest active lanes are evicted as a hard safety limit. */
function evictExcessLanes(entries) {
  if (entries.length <= MAX_RUNTIME_LANES) return entries;

  // Partition into active and terminal
  const active = [];
  const terminal = [];
  for (const entry of entries) {
    const status = String(entry[1]?.status || '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) {
      terminal.push(entry);
    } else {
      active.push(entry);
    }
  }

  // Phase 1: evict terminal lanes first (oldest first)
  const terminalBudget = Math.max(0, MAX_RUNTIME_LANES - active.length);
  const kept = [...active, ...terminal.slice(-terminalBudget)];

  // Phase 2: if active lanes alone exceed cap, hard-trim oldest active
  if (kept.length > MAX_RUNTIME_LANES) {
    return kept.slice(-MAX_RUNTIME_LANES);
  }
  return kept;
}

export function normalizeRuntimeLanes(lanes = {}) {
  if (Array.isArray(lanes)) {
    const entries = lanes.map((lane, index) => {
      const normalized = normalizeLane(lane, lane?.id || `lane-${index + 1}`);
      return [normalized.id, normalized];
    });
    return Object.fromEntries(evictExcessLanes(entries));
  }

  if (!lanes || typeof lanes !== 'object') {
    return {};
  }

  const entries = Object.entries(lanes).map(([id, lane]) => {
    const normalized = normalizeLane(lane, id);
    return [normalized.id, normalized];
  });
  return Object.fromEntries(evictExcessLanes(entries));
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
  ];

  // Deprioritize done/merged — only select if no actionable lanes exist
  const terminalFallbacks = [
    lane => lane.status === 'merged',
    lane => lane.status === 'done',
  ];

  for (const matches of priorityChecks) {
    const lane = lanes.find(matches);
    if (lane) {
      return lane.id;
    }
  }
  for (const matches of terminalFallbacks) {
    const lane = lanes.find(matches);
    if (lane) {
      return lane.id;
    }
  }
  return '';
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

const LANE_DONE_STATUSES = new Set(['done', 'merged']);

export function syncActiveWorktreesFromLanes(runtime = DEFAULT_RUNTIME) {
  const lanes = normalizeRuntimeLanes(runtime?.lanes || runtime);
  return Object.fromEntries(
    Object.values(lanes)
      .filter(lane => lane.worktree_path && !LANE_DONE_STATUSES.has(lane.status))
      .map(lane => [lane.id, lane.worktree_path]),
  );
}

export function appendLaneNote(lane, kind, note, at) {
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
