#!/usr/bin/env node

import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';
import { LANE_STATUS_SEQUENCE, normalizeRuntimeLanes, selectNextLane, summarizeLaneBriefs, summarizeLaneCounts } from './lib/forge-lanes.mjs';
import { initLaneRecord, markLaneMergeState, markLaneReviewState, recordAnalysisMetadata, recordLaneHandoff, readForgeState, readRuntimeState, setCompanyGate, setLaneOwner, setSessionBrief, setLaneStatus, writeSessionHandoff, writeRuntimeState } from './lib/forge-session.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';
import { decomposeTask } from './lib/task-decomposer.mjs';
import { inferRequirementRefsForComponents } from './lib/forge-requirement-mapper.mjs';
import { syncTraceabilitySnapshot } from './lib/forge-traceability-sync.mjs';

function printUsage() {
  console.log(`Forge lane runtime helper

Usage:
  node scripts/forge-lane-runtime.mjs init-lane --lane <lane> --title <title> [--task-file <path>] [--worktree <path>] [--reviewer <name>] [--depends-on <lane1,lane2>]
  node scripts/forge-lane-runtime.mjs update-lane-status --lane <lane> --status <status> [--note <text>]
  node scripts/forge-lane-runtime.mjs assign-owner --lane <lane> --owner <name>
  node scripts/forge-lane-runtime.mjs write-handoff --lane <lane> --note <text>
  node scripts/forge-lane-runtime.mjs mark-review-state --lane <lane> --state <state> [--note <text>]
  node scripts/forge-lane-runtime.mjs mark-merge-state --lane <lane> --state <state> [--note <text>]
  node scripts/forge-lane-runtime.mjs set-session-brief --goal <text> [--exit-criteria <item1,item2>] [--next-goal <text>] [--next-owner <owner>] [--handoff <text>]
  node scripts/forge-lane-runtime.mjs write-session-handoff --summary <text> [--next-goal <text>] [--next-owner <owner>]
  node scripts/forge-lane-runtime.mjs set-company-gate --gate <gate> [--gate-owner <owner>] [--delivery-state <state>] [--customer-blockers <a,b>] [--internal-blockers <a,b>]
  node scripts/forge-lane-runtime.mjs auto-decompose --description <text> [--dry-run] [--json]
  node scripts/forge-lane-runtime.mjs record-analysis --type <kind> [--target <target>] [--artifact <path>] [--graph-health <health>] [--confidence <level>] [--risk <level>] [--summary <text>] [--stale]
  node scripts/forge-lane-runtime.mjs analysis-status [--json]
  node scripts/forge-lane-runtime.mjs summarize-lanes [--json]
  node scripts/forge-lane-runtime.mjs --help

Options:
  --lane        lane identifier
  --title       lane title for init
  --task-file   task markdown file backing the lane
  --worktree    worktree path for the lane
  --reviewer    designated reviewer for the lane
  --depends-on  comma-separated upstream lane ids
  --requirement-refs comma-separated requirement ids
  --acceptance-refs comma-separated acceptance ids
  --evidence-refs comma-separated evidence refs
  --status      ${LANE_STATUS_SEQUENCE.join(' | ')}
  --state       explicit review/merge state
  --goal        current session goal
  --exit-criteria comma-separated session exit criteria
  --next-goal   next session goal
  --next-owner  next session owner
  --handoff     session handoff summary
  --summary     session handoff summary
  --gate        active company gate
  --gate-owner  active company gate owner
  --delivery-state delivery readiness state
  --customer-blockers comma-separated customer blockers
  --internal-blockers comma-separated internal blockers
  --owner       current lane owner role or label
  --note        handoff or status note
  --type        analysis type (architecture | impact | dependency | quality)
  --target      analysis target symbol, file, module, or lane
  --artifact    analysis artifact path
  --graph-health graph fidelity / health descriptor
  --confidence  confidence level for analysis result
  --risk        risk level from analysis result
  --stale       mark saved analysis as stale
  --json        emit machine-readable summary
  --help        show this message
`);
}

function fail(message) {
  process.stderr.write(`[forge lane runtime] ${message}\n`);
  process.exit(1);
}

function sanitizeLane(value) {
  const lane = String(value || '').trim();
  if (!lane) {
    return '';
  }

  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(lane) || lane.includes('..')) {
    fail(`Invalid lane id: ${value}`);
  }

  return lane;
}

function parseDepends(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map(item => sanitizeLane(item))
    .filter(Boolean);
}

function parseList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    json: false,
  };

  if (argv.length === 0 || argv.includes('--help')) {
    return { command: 'help', options };
  }

  const [command, ...rest] = argv;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--dry-run') {
      options['dry-run'] = true;
      continue;
    }

    if ([
      '--lane',
      '--title',
      '--task-file',
      '--worktree',
      '--reviewer',
      '--depends-on',
      '--requirement-refs',
      '--acceptance-refs',
      '--evidence-refs',
      '--status',
      '--state',
      '--goal',
      '--exit-criteria',
      '--next-goal',
      '--next-owner',
      '--handoff',
      '--summary',
      '--gate',
      '--gate-owner',
      '--delivery-state',
      '--customer-blockers',
      '--internal-blockers',
      '--owner',
      '--note',
      '--description',
      '--type',
      '--target',
      '--artifact',
      '--graph-health',
      '--confidence',
      '--risk',
    ].includes(arg)) {
      const value = rest[index + 1];
      if (!value) {
        fail(`Missing value for ${arg}`);
      }
      index += 1;

      if (arg === '--lane') {
        options.lane = sanitizeLane(value);
      } else if (arg === '--title') {
        options.title = value.trim();
      } else if (arg === '--task-file') {
        options.taskFile = value.trim();
      } else if (arg === '--worktree') {
        options.worktree = value.trim();
      } else if (arg === '--reviewer') {
        options.reviewer = value.trim();
      } else if (arg === '--depends-on') {
        options.dependsOn = parseDepends(value);
      } else if (arg === '--requirement-refs') {
        options.requirementRefs = parseList(value);
      } else if (arg === '--acceptance-refs') {
        options.acceptanceRefs = parseList(value);
      } else if (arg === '--evidence-refs') {
        options.evidenceRefs = parseList(value);
      } else if (arg === '--status') {
        options.status = value.trim();
      } else if (arg === '--state') {
        options.state = value.trim();
      } else if (arg === '--goal') {
        options.goal = value.trim();
      } else if (arg === '--exit-criteria') {
        options.exitCriteria = parseList(value);
      } else if (arg === '--next-goal') {
        options.nextGoal = value.trim();
      } else if (arg === '--next-owner') {
        options.nextOwner = value.trim();
      } else if (arg === '--handoff') {
        options.handoff = value.trim();
      } else if (arg === '--summary') {
        options.summary = value.trim();
      } else if (arg === '--gate') {
        options.gate = value.trim();
      } else if (arg === '--gate-owner') {
        options.gateOwner = value.trim();
      } else if (arg === '--delivery-state') {
        options.deliveryState = value.trim();
      } else if (arg === '--customer-blockers') {
        options.customerBlockers = parseList(value);
      } else if (arg === '--internal-blockers') {
        options.internalBlockers = parseList(value);
      } else if (arg === '--owner') {
        options.owner = value.trim();
      } else if (arg === '--note') {
        options.note = value.trim();
      } else if (arg === '--description') {
        options.description = value.trim();
      } else if (arg === '--type') {
        options.type = value.trim();
      } else if (arg === '--target') {
        options.target = value.trim();
      } else if (arg === '--artifact') {
        options.artifact = value.trim();
      } else if (arg === '--graph-health') {
        options.graphHealth = value.trim();
      } else if (arg === '--confidence') {
        options.confidence = value.trim();
      } else if (arg === '--risk') {
        options.risk = value.trim();
      }
      continue;
    }

    if (arg === '--stale') {
      options.stale = true;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  return { command, options };
}

function normalizeLaneRecords(lanes) {
  const base = normalizeRuntimeLanes(lanes);
  const raw = lanes && typeof lanes === 'object' ? lanes : {};

  return Object.fromEntries(Object.entries(base).map(([id, lane]) => {
    const source = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
    const handoffNotes = Array.isArray(source.handoff_notes)
      ? source.handoff_notes
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
          at: typeof entry.at === 'string' ? entry.at : '',
          kind: typeof entry.kind === 'string' ? entry.kind : 'handoff',
          note: typeof entry.note === 'string' ? entry.note : '',
        }))
      : [];

    return [id, {
      ...lane,
      reviewer: typeof source.reviewer === 'string' ? source.reviewer : '',
      task_file: typeof source.task_file === 'string' ? source.task_file : '',
      handoff_notes: handoffNotes,
    }];
  }));
}

function readLaneState() {
  const runtime = readRuntimeState(process.cwd());
  const lanes = normalizeLaneRecords(runtime.lanes);
  return { runtime, lanes };
}

function getLane(lanes, laneId) {
  const lane = lanes[laneId];
  if (!lane) {
    fail(`Unknown lane: ${laneId}`);
  }
  return lane;
}

function assertStatus(status) {
  if (!LANE_STATUS_SEQUENCE.includes(status)) {
    fail(`Invalid status: ${status}`);
  }
}

function buildRuntime(runtime, eventName, laneId) {
  return writeRuntimeState(process.cwd(), {
    ...runtime,
    lanes: normalizeLaneRecords(runtime.lanes),
    task_graph_version: Number(runtime.task_graph_version) > 0 ? Number(runtime.task_graph_version) : 1,
    last_event: {
      name: eventName,
      lane: laneId,
      at: new Date().toISOString(),
    },
  });
}

function hasHandoffNote(lane, fallbackNote = '') {
  if (String(fallbackNote || '').trim()) {
    return true;
  }

  if (String(lane.session_handoff_notes || '').trim()) {
    return true;
  }

  return Array.isArray(lane.handoff_notes)
    && lane.handoff_notes.some(entry => entry?.kind === 'handoff' && String(entry.note || '').trim());
}

function initLane(options) {
  if (!options.lane || !options.title) {
    fail('Expected --lane and --title for init-lane');
  }

  const { runtime, lanes } = readLaneState();
  if (lanes[options.lane]) {
    fail(`Lane already exists: ${options.lane}`);
  }

  const nextRuntime = buildRuntime(
    initLaneRecord(runtime, {
      laneId: options.lane,
      title: options.title,
      worktreePath: options.worktree || '',
      taskFile: options.taskFile || '',
      reviewer: options.reviewer || '',
      dependencies: options.dependsOn || [],
      requirementRefs: options.requirementRefs || [],
      acceptanceRefs: options.acceptanceRefs || [],
      evidenceRefs: options.evidenceRefs || [],
    }),
    'init-lane',
    options.lane,
  );
  syncTraceabilitySnapshot(process.cwd());
  console.log(`initialized: ${options.lane}`);
  console.log(`title: ${nextRuntime.lanes[options.lane].title}`);
  console.log(`status: ${nextRuntime.lanes[options.lane].status}`);
  console.log(`next_lane: ${nextRuntime.next_lane || '(none)'}`);
}

function tryDeleteBranch(branch) {
  if (!branch || branch === 'main' || branch === 'master') return '';
  const result = spawnSync('git', ['branch', '-d', branch], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return result.status === 0 ? branch : '';
}

function findWorktreeBranch(worktreePath) {
  const fullPath = resolve(worktreePath);
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) return '';
  const lines = String(result.stdout).split('\n');
  let currentPath = '';
  for (const line of lines) {
    if (line.startsWith('worktree ')) currentPath = resolve(line.slice(9));
    if (line.startsWith('branch ') && currentPath === fullPath) {
      return line.slice(7).replace(/^refs\/heads\//, '');
    }
  }
  return '';
}

function tryRemoveWorktree(worktreePath) {
  if (!worktreePath) return { removed: false, branch: '' };
  const fullPath = resolve(worktreePath);
  if (!existsSync(fullPath)) return { removed: false, branch: '' };
  const branch = findWorktreeBranch(fullPath);
  const result = spawnSync('git', ['worktree', 'remove', fullPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const removed = result.status === 0;
  const deletedBranch = removed ? tryDeleteBranch(branch) : '';
  return { removed, branch: deletedBranch };
}

function updateLaneStatus(options) {
  if (!options.lane || !options.status) {
    fail('Expected --lane and --status for update-lane-status');
  }

  assertStatus(options.status);
  const { runtime, lanes } = readLaneState();
  const lane = getLane(lanes, options.lane);
  if (options.status === 'in_review' && !hasHandoffNote(lane, options.note)) {
    fail('Lane requires a handoff note before entering review.');
  }

  const isDone = options.status === 'done' || options.status === 'merged';
  let cleanup = { removed: false, branch: '' };
  if (isDone && lane.worktree_path) {
    cleanup = tryRemoveWorktree(lane.worktree_path);
  }

  buildRuntime(
    setLaneStatus(runtime, {
      laneId: options.lane,
      status: options.status,
      note: options.note || '',
    }),
    'update-lane-status',
    options.lane,
  );
  syncTraceabilitySnapshot(process.cwd());
  console.log(`lane: ${options.lane}`);
  console.log(`status: ${options.status}`);
  if (cleanup.removed) {
    console.log(`worktree removed: ${lane.worktree_path}`);
  }
  if (cleanup.branch) {
    console.log(`branch deleted: ${cleanup.branch}`);
  }
  if (options.note) {
    console.log(`note: ${options.note}`);
  }
}

function assignOwner(options) {
  if (!options.lane || !options.owner) {
    fail('Expected --lane and --owner for assign-owner');
  }

  const { runtime, lanes } = readLaneState();
  getLane(lanes, options.lane);

  buildRuntime(
    setLaneOwner(runtime, {
      laneId: options.lane,
      ownerRole: options.owner,
    }),
    'assign-owner',
    options.lane,
  );
  console.log(`lane: ${options.lane}`);
  console.log(`owner: ${options.owner}`);
}

function writeHandoff(options) {
  if (!options.lane || !options.note) {
    fail('Expected --lane and --note for write-handoff');
  }

  const { runtime, lanes } = readLaneState();
  getLane(lanes, options.lane);

  buildRuntime(
    recordLaneHandoff(runtime, {
      laneId: options.lane,
      note: options.note,
    }),
    'write-handoff',
    options.lane,
  );
  console.log(`lane: ${options.lane}`);
  console.log('handoff: recorded');
}

function markReview(options) {
  if (!options.lane || !options.state) {
    fail('Expected --lane and --state for mark-review-state');
  }

  const { runtime, lanes } = readLaneState();
  getLane(lanes, options.lane);

  buildRuntime(
    markLaneReviewState(runtime, {
      laneId: options.lane,
      reviewState: options.state,
      note: options.note || '',
    }),
    'mark-review-state',
    options.lane,
  );
  syncTraceabilitySnapshot(process.cwd());
  console.log(`lane: ${options.lane}`);
  console.log(`review_state: ${options.state}`);
}

function markMerge(options) {
  if (!options.lane || !options.state) {
    fail('Expected --lane and --state for mark-merge-state');
  }

  const { runtime, lanes } = readLaneState();
  getLane(lanes, options.lane);

  buildRuntime(
    markLaneMergeState(runtime, {
      laneId: options.lane,
      mergeState: options.state,
      note: options.note || '',
    }),
    'mark-merge-state',
    options.lane,
  );
  syncTraceabilitySnapshot(process.cwd());
  console.log(`lane: ${options.lane}`);
  console.log(`merge_state: ${options.state}`);
}

function setSession(options) {
  if (!options.goal) {
    fail('Expected --goal for set-session-brief');
  }

  const { runtime } = readLaneState();
  const nextRuntime = buildRuntime(
    setSessionBrief(runtime, {
      currentSessionGoal: options.goal,
      sessionExitCriteria: options.exitCriteria || [],
      nextSessionGoal: options.nextGoal || '',
      nextSessionOwner: options.nextOwner || '',
      sessionHandoffSummary: options.handoff || '',
    }),
    'set-session-brief',
    '',
  );

  console.log(`goal: ${nextRuntime.current_session_goal}`);
  if (nextRuntime.next_session_owner) {
    console.log(`next_owner: ${nextRuntime.next_session_owner}`);
  }
}

function handoffSession(options) {
  if (!options.summary) {
    fail('Expected --summary for write-session-handoff');
  }

  const { runtime } = readLaneState();
  const nextRuntime = buildRuntime(
    writeSessionHandoff(runtime, {
      summary: options.summary,
      nextSessionGoal: options.nextGoal || '',
      nextSessionOwner: options.nextOwner || '',
    }),
    'write-session-handoff',
    '',
  );

  console.log(`handoff: ${nextRuntime.session_handoff_summary}`);
  if (nextRuntime.next_session_owner) {
    console.log(`next_owner: ${nextRuntime.next_session_owner}`);
  }
}

function setGate(options) {
  if (!options.gate) {
    fail('Expected --gate for set-company-gate');
  }

  const { runtime } = readLaneState();
  const state = readForgeState(process.cwd());
  const nextRuntime = buildRuntime(
    setCompanyGate(runtime, {
      activeGate: options.gate,
      activeGateOwner: options.gateOwner || '',
      deliveryReadiness: options.deliveryState || '',
      customerBlockers: options.customerBlockers,
      internalBlockers: options.internalBlockers,
      phaseAnchor: state ? resolvePhase(state).id : '',
    }),
    'set-company-gate',
    '',
  );

  console.log(`gate: ${nextRuntime.active_gate}`);
  if (nextRuntime.active_gate_owner) {
    console.log(`gate_owner: ${nextRuntime.active_gate_owner}`);
  }
  console.log(`delivery: ${nextRuntime.delivery_readiness}`);
}

function summarizeLanes(options) {
  const { runtime, lanes } = readLaneState();
  const nextRuntime = {
    ...runtime,
    lanes,
  };
  const counts = summarizeLaneCounts(nextRuntime);
  const briefs = summarizeLaneBriefs(nextRuntime, 5);
  const nextLane = selectNextLane(nextRuntime);
  const ordered = Object.values(lanes).sort((left, right) => left.id.localeCompare(right.id));

  if (options.json) {
    console.log(JSON.stringify({
      counts,
      next_lane: nextLane,
      next_action: nextRuntime.next_action || {},
      briefs,
      active_gate: nextRuntime.active_gate || '',
      active_gate_owner: nextRuntime.active_gate_owner || '',
      delivery_readiness: nextRuntime.delivery_readiness || 'unknown',
      current_session_goal: nextRuntime.current_session_goal || '',
      next_session_goal: nextRuntime.next_session_goal || '',
      next_session_owner: nextRuntime.next_session_owner || '',
      session_handoff_summary: nextRuntime.session_handoff_summary || '',
      customer_blockers: nextRuntime.customer_blockers || [],
      internal_blockers: nextRuntime.internal_blockers || [],
      lanes: ordered,
    }, null, 2));
    return;
  }

  if (ordered.length === 0) {
    console.log('No lanes tracked in .forge/runtime.json.');
    return;
  }

  console.log(`Lanes: ${counts.total}`);
  console.log(`Next lane: ${nextLane || '(none)'}`);
  if (nextRuntime.next_action?.summary) {
    console.log(`Next action: ${nextRuntime.next_action.summary}`);
  }
  console.log(`Gate: ${nextRuntime.active_gate || '(none)'}`);
  console.log(`Delivery: ${nextRuntime.delivery_readiness || 'unknown'}`);
  if (nextRuntime.current_session_goal) {
    console.log(`Session goal: ${nextRuntime.current_session_goal}`);
  }
  if (nextRuntime.next_session_owner || nextRuntime.next_session_goal) {
    console.log(`Next session: ${nextRuntime.next_session_owner || '(unassigned)'}${nextRuntime.next_session_goal ? ` -> ${nextRuntime.next_session_goal}` : ''}`);
  }
  console.log(`Briefs: ${briefs.join(', ') || '(none)'}`);
  for (const lane of ordered) {
    console.log(`${lane.id} [${lane.status}]`);
    console.log(`  title: ${lane.title}`);
    console.log(`  owner: ${lane.owner_role || '(unassigned)'}`);
    console.log(`  reviewer: ${lane.reviewer || '(unassigned)'}`);
    console.log(`  worktree: ${lane.worktree_path || '(none)'}`);
    console.log(`  deps: ${lane.dependencies.length ? lane.dependencies.join(', ') : '(none)'}`);
    console.log(`  task: ${lane.task_file || '(none)'}`);
    if (lane.session_handoff_notes) {
      console.log(`  handoff: ${lane.session_handoff_notes}`);
    }
  }
}

function autoDecompose(options) {
  const description = options.description || options.task;
  if (!description) fail('auto-decompose requires --description <text>');

  const cwd = options.cwd || '.';
  const result = decomposeTask(description, { cwd });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Print summary
  console.log(result.summary);

  if (!options['dry-run'] && result.analysis.parallelizable) {
    const inferredRefs = inferRequirementRefsForComponents(cwd, description, result.components);
    // Auto-create lanes from components
    console.log('\nCreating lanes...');
    for (const comp of result.components) {
      const refs = inferredRefs.find(entry => entry.laneId === comp.id) || { requirementRefs: [], acceptanceRefs: [] };
      const runtime = readRuntimeState(cwd);
      const updated = initLaneRecord(runtime, {
        laneId: comp.id,
        title: comp.title,
        dependencies: comp.dependencies,
        requirementRefs: refs.requirementRefs,
        acceptanceRefs: refs.acceptanceRefs,
      });
      writeRuntimeState(cwd, updated);
      console.log(`  Lane: ${comp.id} (${comp.title}) deps=[${comp.dependencies.join(',')}] model=${comp.modelHint}${refs.requirementRefs.length ? ` reqs=[${refs.requirementRefs.join(',')}]` : ''}`);
    }

    // Store decomposition metadata in runtime for subagent-start to read
    const runtime = readRuntimeState(cwd);
    const lanesWithMeta = { ...runtime };
    for (const comp of result.components) {
      const lane = lanesWithMeta.lanes?.[comp.id];
      if (lane) {
        lane.scope = comp.filePatterns;
        lane.model_hint = comp.modelHint;
        lane.areas = comp.areas;
      }
    }
    writeRuntimeState(cwd, lanesWithMeta);
    syncTraceabilitySnapshot(cwd);

    console.log(`\n${result.components.length} lanes created. Execution order:`);
    for (let i = 0; i < result.executionOrder.length; i++) {
      console.log(`  Batch ${i + 1}: ${result.executionOrder[i].join(' | ')}`);
    }
  }
}

function recordAnalysis(options) {
  if (!options.type) {
    fail('Expected --type for record-analysis');
  }

  const artifactPath = options.artifact || '.forge/design/codebase-analysis.md';
  const artifactExists = existsSync(resolve(process.cwd(), artifactPath));
  const saved = recordAnalysisMetadata(process.cwd(), {
    last_type: options.type,
    last_target: options.target || '',
    artifact_path: artifactPath,
    graph_health: options.graphHealth || 'unknown',
    confidence: options.confidence || 'unknown',
    risk_level: options.risk || 'unknown',
    summary: options.summary || '',
    stale: Boolean(options.stale) || !artifactExists,
  });

  console.log(`type: ${saved.analysis.last_type}`);
  console.log(`target: ${saved.analysis.last_target || '(none)'}`);
  console.log(`artifact: ${saved.analysis.artifact_path}`);
  console.log(`artifact_exists: ${artifactExists ? 'yes' : 'no'}`);
  console.log(`graph_health: ${saved.analysis.graph_health}`);
  console.log(`confidence: ${saved.analysis.confidence}`);
  console.log(`risk: ${saved.analysis.risk_level}`);
  console.log(`stale: ${saved.analysis.stale ? 'yes' : 'no'}`);
}

function analysisStatus(options) {
  const state = readForgeState(process.cwd());
  const runtime = readRuntimeState(process.cwd(), { state });
  const analysis = runtime.analysis || state?.analysis || {};
  const artifactPath = analysis.artifact_path || '.forge/design/codebase-analysis.md';
  const artifactExists = existsSync(resolve(process.cwd(), artifactPath));

  if (options.json) {
    console.log(JSON.stringify({
      analysis_type: analysis.last_type || '',
      target: analysis.last_target || '',
      artifact_path: artifactPath,
      artifact_exists: artifactExists,
      graph_health: analysis.graph_health || 'unknown',
      confidence: analysis.confidence || 'unknown',
      risk_level: analysis.risk_level || 'unknown',
      summary: analysis.summary || '',
      updated_at: analysis.updated_at || '',
      stale: Boolean(analysis.stale) || !artifactExists,
    }, null, 2));
    return;
  }

  console.log(`type: ${analysis.last_type || '(none)'}`);
  console.log(`target: ${analysis.last_target || '(none)'}`);
  console.log(`artifact: ${artifactPath}`);
  console.log(`artifact_exists: ${artifactExists ? 'yes' : 'no'}`);
  console.log(`graph_health: ${analysis.graph_health || 'unknown'}`);
  console.log(`confidence: ${analysis.confidence || 'unknown'}`);
  console.log(`risk: ${analysis.risk_level || 'unknown'}`);
  console.log(`updated_at: ${analysis.updated_at || '(none)'}`);
  console.log(`stale: ${(Boolean(analysis.stale) || !artifactExists) ? 'yes' : 'no'}`);
  if (analysis.summary) {
    console.log(`summary: ${analysis.summary}`);
  }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === 'help') {
    printUsage();
    return;
  }

  if (command === 'init-lane') {
    initLane(options);
    return;
  }

  if (command === 'update-lane-status') {
    updateLaneStatus(options);
    return;
  }

  if (command === 'assign-owner') {
    assignOwner(options);
    return;
  }

  if (command === 'write-handoff') {
    writeHandoff(options);
    return;
  }

  if (command === 'mark-review-state') {
    markReview(options);
    return;
  }

  if (command === 'mark-merge-state') {
    markMerge(options);
    return;
  }

  if (command === 'set-session-brief') {
    setSession(options);
    return;
  }

  if (command === 'write-session-handoff') {
    handoffSession(options);
    return;
  }

  if (command === 'set-company-gate') {
    setGate(options);
    return;
  }

  if (command === 'summarize-lanes') {
    summarizeLanes(options);
    return;
  }

  if (command === 'auto-decompose') {
    autoDecompose(options);
    return;
  }

  if (command === 'record-analysis') {
    recordAnalysis(options);
    return;
  }

  if (command === 'analysis-status') {
    analysisStatus(options);
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
