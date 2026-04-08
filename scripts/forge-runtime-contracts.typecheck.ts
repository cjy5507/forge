import {
  DEFAULT_ANALYSIS,
  DEFAULT_HOST_CONTEXT,
  DEFAULT_NEXT_ACTION,
  DEFAULT_RUNTIME,
  DEFAULT_STATS,
} from './lib/forge-io.mjs';
import { normalizeRuntimeState, normalizeStateShape } from './lib/forge-session.mjs';
import type {
  ForgeAnalysisMeta,
  ForgeHostContext,
  ForgeNextAction,
  ForgeRuntime,
  ForgeState,
  ForgeStats,
} from '../types/forge-state';

const analysisContract: ForgeAnalysisMeta = DEFAULT_ANALYSIS;
const hostContextContract: ForgeHostContext = DEFAULT_HOST_CONTEXT;
const nextActionContract: ForgeNextAction = DEFAULT_NEXT_ACTION;
const statsContract: ForgeStats = DEFAULT_STATS;
const runtimeContract: ForgeRuntime = DEFAULT_RUNTIME;
const normalizedRuntimeContract: ForgeRuntime = normalizeRuntimeState({
  active_tier: 'full',
  company_mode: 'autonomous_company',
});

const stateContract: ForgeState = {
  version: '0.0.0',
  project: 'demo',
  phase: 'intake',
  phase_id: 'intake',
  phase_name: 'Intake',
  phase_index: 0,
  mode: 'build',
  status: 'pending',
  created_at: '',
  updated_at: '',
  client_name: '',
  agents_active: [],
  spec_approved: false,
  design_approved: false,
  artifact_versions: {},
  staleness: {},
  lessons_brief: [],
  analysis: analysisContract,
  tasks: [],
  holes: [],
  pr_queue: [],
  tier: 'light',
  stats: statsContract,
};
const normalizedStateContract: ForgeState = normalizeStateShape({
  project: 'demo',
  phase: 'develop',
  phase_id: 'develop',
  mode: 'build',
});

void analysisContract;
void hostContextContract;
void nextActionContract;
void runtimeContract;
void normalizedRuntimeContract;
void stateContract;
void normalizedStateContract;
