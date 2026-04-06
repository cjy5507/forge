export type ForgeHarnessMode = 'build' | 'repair' | 'express';

export type ForgeHarnessBuildPhase =
  | 'intake'
  | 'discovery'
  | 'design'
  | 'develop'
  | 'qa'
  | 'delivery';

export type ForgeHarnessRepairPhase =
  | 'intake'
  | 'reproduce'
  | 'isolate'
  | 'fix'
  | 'verify'
  | 'delivery';

export type ForgeHarnessExpressPhase =
  | 'plan'
  | 'build'
  | 'ship';

export type ForgeHarnessPhase =
  | ForgeHarnessBuildPhase
  | ForgeHarnessRepairPhase
  | ForgeHarnessExpressPhase;

export type ForgeHarnessStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'warning'
  | 'completed'
  | 'cancelled';

export type ForgeHarnessArtifactKey =
  | 'spec'
  | 'architecture'
  | 'code_rules'
  | 'contracts'
  | 'evidence'
  | 'handoff';

export type ForgeHarnessNextActionKind =
  | 'phase_gate'
  | 'artifact_missing'
  | 'verification_required'
  | 'resume_work'
  | 'handoff_review'
  | 'complete';

export interface ForgeHarnessNextAction {
  kind: ForgeHarnessNextActionKind;
  summary: string;
  target: string;
}

export interface ForgeHarnessBlockers {
  customer: number;
  internal: number;
}

export interface ForgeHarnessState {
  version: string;
  mode: ForgeHarnessMode;
  phase: ForgeHarnessPhase;
  phaseIndex: number;
  status: ForgeHarnessStatus;
  designApproved?: boolean;
  artifactVersions: Partial<Record<ForgeHarnessArtifactKey, number>>;
  staleness: Partial<Record<ForgeHarnessArtifactKey, boolean>>;
  blockers: ForgeHarnessBlockers;
  nextAction: ForgeHarnessNextAction;
}

export interface ForgeHarnessRuntimeState {
  updatedAt: string;
  activeLaneIds: string[];
  activeTaskIds: string[];
  degradedModes: string[];
  verificationSummary?: string;
  recentFailures: string[];
}

export type ForgeHarnessGateDecision = 'allowed' | 'warning' | 'blocked';

export interface ForgeHarnessGateResult {
  mode: ForgeHarnessMode;
  phase: ForgeHarnessPhase;
  decision: ForgeHarnessGateDecision;
  missingArtifacts: ForgeHarnessArtifactKey[];
  staleArtifacts: ForgeHarnessArtifactKey[];
  reason: string;
}

export interface ForgeHarnessHandoff {
  phase: ForgeHarnessPhase;
  objective: string;
  nextOwner: string;
  blockers: string[];
  requiredArtifacts: ForgeHarnessArtifactKey[];
  implementationQuestions: string[];
  summary: string;
}
