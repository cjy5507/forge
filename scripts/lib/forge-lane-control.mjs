import { DEFAULT_RUNTIME } from './forge-io.mjs';
import {
  normalizeLane,
  normalizeLaneStatus,
  normalizeLaneReviewState,
  normalizeLaneMergeState,
  appendLaneNote,
} from './forge-lanes.mjs';

function mutateLane(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, laneId, updater) {
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

export function initLaneRecordWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  title = '',
  worktreePath = '',
  taskFile = '',
  reviewer = '',
  dependencies = [],
  requirementRefs = [],
  acceptanceRefs = [],
  evidenceRefs = [],
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
    ...lane,
    id: laneId,
    title: title || lane.title || laneId,
    worktree_path: worktreePath || lane.worktree_path,
    task_file: taskFile || lane.task_file,
    reviewer: reviewer || lane.reviewer,
    dependencies: dependencies.length ? dependencies.map(String) : lane.dependencies,
    requirement_refs: requirementRefs.length ? requirementRefs.map(String) : lane.requirement_refs,
    acceptance_refs: acceptanceRefs.length ? acceptanceRefs.map(String) : lane.acceptance_refs,
    evidence_refs: evidenceRefs.length ? evidenceRefs.map(String) : lane.evidence_refs,
    status: lane.status === 'pending' && lane.title === 'unnamed lane' ? 'pending' : lane.status,
    last_event_at: now,
  }));
}

export function setLaneOwnerWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  ownerRole = 'developer',
  ownerAgentId = '',
  ownerAgentType = '',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
    ...lane,
    owner_role: ownerRole || lane.owner_role,
    owner_agent_id: ownerAgentId || lane.owner_agent_id,
    owner_agent_type: ownerAgentType || lane.owner_agent_type,
    last_event_at: now,
  }));
}

export function recordLaneHandoffWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  note,
  kind = 'handoff',
} = {}) {
  const now = new Date().toISOString();
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
    ...lane,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, kind, note, now),
    last_event_at: now,
  }));
}

export function setLaneStatusWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  status,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextStatus = normalizeLaneStatus(status);
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
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

export function markLaneReviewStateWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  reviewState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextReviewState = normalizeLaneReviewState(reviewState);
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
    ...lane,
    review_state: nextReviewState,
    status: nextReviewState === 'none' ? lane.status : 'in_review',
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'review', note, now),
    last_event_at: now,
  }));
}

export function markLaneMergeStateWith(normalizeRuntimeState, runtime = DEFAULT_RUNTIME, {
  laneId,
  mergeState,
  note = '',
} = {}) {
  const now = new Date().toISOString();
  const nextMergeState = normalizeLaneMergeState(mergeState);
  return mutateLane(normalizeRuntimeState, runtime, laneId, lane => ({
    ...lane,
    merge_state: nextMergeState,
    status: nextMergeState === 'merged' ? 'merged' : lane.status,
    session_handoff_notes: note || lane.session_handoff_notes,
    handoff_notes: appendLaneNote(lane, 'merge', note, now),
    last_event_at: now,
  }));
}
