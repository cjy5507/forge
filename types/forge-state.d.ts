export type ForgeTier = 'off' | 'light' | 'medium' | 'full';
export type ForgeCompanyMode = 'guided' | 'autonomous_company';
export type ForgeBriefMode = 'auto' | 'manual';
export type ForgeDeliveryReadiness =
  | 'unknown'
  | 'blocked'
  | 'in_progress'
  | 'ready_for_review'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface ForgeStats {
  started_at: string;
  last_finished_at: string;
  session_count: number;
  agent_calls: number;
  failure_count: number;
  stop_block_count: number;
  test_runs: number;
  test_failures: number;
}

export interface ForgeAnalysisMeta {
  last_type: string;
  last_target: string;
  artifact_path: string;
  locale: string;
  graph_health: string;
  confidence: string;
  risk_level: string;
  summary: string;
  updated_at: string;
  stale: boolean;
}

export interface ForgeBehavioralCounters {
  total_prompts: number;
  question_prompts: number;
  design_improvement_requests: number;
}

export interface ForgeNextAction {
  kind: string;
  skill: string;
  target: string;
  reason: string;
  summary: string;
  updated_at: string;
}

export interface ForgeHostContext {
  current_host: string;
  previous_host: string;
  last_event_host: string;
  last_event_name: string;
  last_resume_host: string;
  last_resume_at: string;
}

export interface ForgeBlocker {
  summary: string;
  owner: string;
  severity: string;
  [key: string]: unknown;
}

export interface ForgeLaneHandoffNote {
  at: string;
  kind: string;
  note: string;
}

export interface ForgeActiveAgentRecord {
  status?: string;
  type?: string;
  lane?: string;
  role?: string;
  started_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ForgeLaneRecord {
  id: string;
  title: string;
  owner_role: string;
  owner_agent_id: string;
  owner_agent_type: string;
  worktree_path: string;
  dependencies: string[];
  status: string;
  session_handoff_notes: string;
  review_state: string;
  merge_state: string;
  scope: string[];
  areas: string[];
  model_hint: string;
  requirement_refs: string[];
  acceptance_refs: string[];
  last_event_at: string;
  blocked_reason: string;
  reviewer: string;
  task_file: string;
  handoff_notes: ForgeLaneHandoffNote[];
}

export interface ForgeStopGuard {
  block_count: number;
}

export interface ForgeDetectedCommands {
  lint: string;
  typecheck: string;
  test: string;
  build: string;
  format: string;
}

export interface ForgeLastBatchCheck {
  at: string;
  status: string;
  summary: string;
  commands: string[];
}

export interface ForgeToolingState {
  package_manager: string;
  package_manager_source: string;
  detected_commands: ForgeDetectedCommands;
  edited_files: string[];
  last_batch_check: ForgeLastBatchCheck;
}

export interface ForgeHarnessPolicy {
  strictness_mode: string;
  verification_mode: string;
  host_posture: string;
  override_policy: string;
  decision_trace_enabled: boolean;
}

export interface ForgeDecisionTraceEntry {
  at: string;
  scope: string;
  kind: string;
  target: string;
  summary: string;
  inputs: string[];
  policy_snapshot: string;
}

export interface ForgeDecisionTrace {
  latest: ForgeDecisionTraceEntry | null;
  recent: ForgeDecisionTraceEntry[];
}

export interface ForgeVerificationCheck {
  id: string;
  reason: string;
  command: string;
}

export interface ForgeVerificationState {
  updated_at: string;
  edited_files: string[];
  lane_refs: string[];
  selected_checks: ForgeVerificationCheck[];
  status: string;
  summary: string;
}

export interface ForgeRecoveryItem {
  id: string;
  at: string;
  category: string;
  lane_id: string;
  phase_id: string;
  command: string;
  guidance: string;
  suggested_command: string;
  retry_count: number;
  max_retry_count: number;
  status: string;
  summary: string;
  escalation_reason: string;
}

export interface ForgeRecoveryState {
  latest: ForgeRecoveryItem | null;
  active: ForgeRecoveryItem[];
}

export interface ForgeRuntimeEvent {
  name: string;
  lane: string;
  at: string;
}

export interface ForgeRuntime {
  version: number;
  active_tier: ForgeTier;
  detected_locale: string;
  preferred_locale: string;
  last_task_type: string;
  behavioral_profile: string;
  active_prescriptions: string[];
  behavioral_counters: ForgeBehavioralCounters;
  company_mode: ForgeCompanyMode;
  company_gate_mode: 'auto' | 'manual';
  company_phase_anchor: string;
  active_gate: string;
  active_gate_owner: string;
  delivery_readiness: ForgeDeliveryReadiness;
  customer_blockers: ForgeBlocker[];
  internal_blockers: ForgeBlocker[];
  current_session_goal: string;
  session_exit_criteria: string[];
  next_session_goal: string;
  next_session_owner: string;
  session_handoff_summary: string;
  session_brief_mode: ForgeBriefMode;
  session_phase_anchor: string;
  session_gate_anchor: string;
  session_customer_blocker_count: number;
  session_internal_blocker_count: number;
  recommended_agents: string[];
  lanes: Record<string, ForgeLaneRecord>;
  active_worktrees: Record<string, string>;
  next_lane: string;
  active_agents: Record<string, ForgeActiveAgentRecord>;
  recent_agents: string[];
  recent_failures: string[];
  analysis: ForgeAnalysisMeta;
  next_action: ForgeNextAction;
  host_context: ForgeHostContext;
  harness_policy?: ForgeHarnessPolicy;
  decision_trace?: ForgeDecisionTrace;
  verification?: ForgeVerificationState;
  recovery?: ForgeRecoveryState;
  tooling?: ForgeToolingState;
  stop_guard: ForgeStopGuard;
  stats: ForgeStats;
  last_event: ForgeRuntimeEvent | null;
  updated_at: string;
}

export interface ForgeState {
  version: string;
  project: string;
  phase: string;
  phase_id: string;
  phase_name: string;
  mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  agents_active: string[];
  spec_approved: boolean;
  design_approved: boolean;
  analysis: ForgeAnalysisMeta;
  harness_policy?: ForgeHarnessPolicy;
  tasks: string[];
  holes: string[];
  pr_queue: string[];
  tier: ForgeTier;
  stats: ForgeStats;
  phase_index: number;
  _phase_gate_warning?: string;
  _phase_mismatch_warning?: string;
}
