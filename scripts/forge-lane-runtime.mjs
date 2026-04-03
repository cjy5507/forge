#!/usr/bin/env node

import {
  LANE_STATUS_SEQUENCE,
  normalizeRuntimeLanes,
  readRuntimeState,
  selectResumeLane,
  summarizeLaneBriefs,
  summarizeLaneCounts,
  writeRuntimeState,
} from './lib/forge-state.mjs';

function printUsage() {
  console.log(`Forge lane runtime helper

Usage:
  node scripts/forge-lane-runtime.mjs init-lane --lane <lane> --title <title> [--task-file <path>] [--worktree <path>] [--reviewer <name>] [--depends-on <lane1,lane2>]
  node scripts/forge-lane-runtime.mjs update-lane-status --lane <lane> --status <status> [--note <text>]
  node scripts/forge-lane-runtime.mjs assign-owner --lane <lane> --owner <name>
  node scripts/forge-lane-runtime.mjs write-handoff --lane <lane> --note <text>
  node scripts/forge-lane-runtime.mjs summarize-lanes [--json]
  node scripts/forge-lane-runtime.mjs --help

Options:
  --lane        lane identifier
  --title       lane title for init
  --task-file   task markdown file backing the lane
  --worktree    worktree path for the lane
  --reviewer    designated reviewer for the lane
  --depends-on  comma-separated upstream lane ids
  --status      ${LANE_STATUS_SEQUENCE.join(' | ')}
  --owner       current lane owner role or label
  --note        handoff or status note
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

    if ([
      '--lane',
      '--title',
      '--task-file',
      '--worktree',
      '--reviewer',
      '--depends-on',
      '--status',
      '--owner',
      '--note',
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
      } else if (arg === '--status') {
        options.status = value.trim();
      } else if (arg === '--owner') {
        options.owner = value.trim();
      } else if (arg === '--note') {
        options.note = value.trim();
      }
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

function buildRuntime(runtime, lanes, eventName, laneId) {
  const nextRuntime = {
    ...runtime,
    lanes,
    task_graph_version: Number(runtime.task_graph_version) > 0 ? Number(runtime.task_graph_version) : 1,
    active_worktrees: Object.fromEntries(
      Object.values(lanes)
        .filter(lane => lane.worktree_path)
        .map(lane => [lane.id, lane.worktree_path]),
    ),
    last_event: {
      name: eventName,
      lane: laneId,
      at: new Date().toISOString(),
    },
  };

  nextRuntime.resume_lane = selectResumeLane(nextRuntime);
  return writeRuntimeState(process.cwd(), nextRuntime);
}

function initLane(options) {
  if (!options.lane || !options.title) {
    fail('Expected --lane and --title for init-lane');
  }

  const { runtime, lanes } = readLaneState();
  if (lanes[options.lane]) {
    fail(`Lane already exists: ${options.lane}`);
  }

  const now = new Date().toISOString();
  const nextLanes = {
    ...lanes,
    [options.lane]: {
      id: options.lane,
      title: options.title,
      owner_role: '',
      owner_agent_id: '',
      worktree_path: options.worktree || '',
      dependencies: options.dependsOn || [],
      status: 'pending',
      session_handoff_notes: '',
      review_state: 'pending',
      scope: [],
      acceptance_criteria: [],
      last_event_at: now,
      blocked_reason: '',
      reviewer: options.reviewer || '',
      task_file: options.taskFile || '',
      handoff_notes: [],
    },
  };

  const nextRuntime = buildRuntime(runtime, nextLanes, 'init-lane', options.lane);
  console.log(`initialized: ${options.lane}`);
  console.log(`title: ${nextLanes[options.lane].title}`);
  console.log(`status: ${nextLanes[options.lane].status}`);
  console.log(`resume_lane: ${nextRuntime.resume_lane || '(none)'}`);
}

function updateLaneStatus(options) {
  if (!options.lane || !options.status) {
    fail('Expected --lane and --status for update-lane-status');
  }

  assertStatus(options.status);
  const { runtime, lanes } = readLaneState();
  const lane = getLane(lanes, options.lane);
  const now = new Date().toISOString();
  const handoffNotes = [...lane.handoff_notes];

  if (options.note) {
    handoffNotes.push({
      at: now,
      kind: 'status',
      note: options.note,
    });
  }

  const nextLanes = {
    ...lanes,
    [options.lane]: {
      ...lane,
      status: options.status,
      blocked_reason: options.status === 'blocked' ? (options.note || lane.blocked_reason) : '',
      review_state: options.status === 'in_review' ? 'pending' : lane.review_state,
      session_handoff_notes: options.note || lane.session_handoff_notes,
      handoff_notes: handoffNotes,
      last_event_at: now,
    },
  };

  buildRuntime(runtime, nextLanes, 'update-lane-status', options.lane);
  console.log(`lane: ${options.lane}`);
  console.log(`status: ${options.status}`);
  if (options.note) {
    console.log(`note: ${options.note}`);
  }
}

function assignOwner(options) {
  if (!options.lane || !options.owner) {
    fail('Expected --lane and --owner for assign-owner');
  }

  const { runtime, lanes } = readLaneState();
  const lane = getLane(lanes, options.lane);
  const nextLanes = {
    ...lanes,
    [options.lane]: {
      ...lane,
      owner_role: options.owner,
      last_event_at: new Date().toISOString(),
    },
  };

  buildRuntime(runtime, nextLanes, 'assign-owner', options.lane);
  console.log(`lane: ${options.lane}`);
  console.log(`owner: ${options.owner}`);
}

function writeHandoff(options) {
  if (!options.lane || !options.note) {
    fail('Expected --lane and --note for write-handoff');
  }

  const { runtime, lanes } = readLaneState();
  const lane = getLane(lanes, options.lane);
  const now = new Date().toISOString();
  const nextLanes = {
    ...lanes,
    [options.lane]: {
      ...lane,
      session_handoff_notes: options.note,
      handoff_notes: [
        ...lane.handoff_notes,
        {
          at: now,
          kind: 'handoff',
          note: options.note,
        },
      ],
      last_event_at: now,
    },
  };

  buildRuntime(runtime, nextLanes, 'write-handoff', options.lane);
  console.log(`lane: ${options.lane}`);
  console.log('handoff: recorded');
}

function summarizeLanes(options) {
  const { runtime, lanes } = readLaneState();
  const nextRuntime = {
    ...runtime,
    lanes,
  };
  const counts = summarizeLaneCounts(nextRuntime);
  const briefs = summarizeLaneBriefs(nextRuntime, 5);
  const resumeLane = selectResumeLane(nextRuntime);
  const ordered = Object.values(lanes).sort((left, right) => left.id.localeCompare(right.id));

  if (options.json) {
    console.log(JSON.stringify({
      counts,
      resume_lane: resumeLane,
      briefs,
      lanes: ordered,
    }, null, 2));
    return;
  }

  if (ordered.length === 0) {
    console.log('No lanes tracked in .forge/runtime.json.');
    return;
  }

  console.log(`Lanes: ${counts.total}`);
  console.log(`Resume lane: ${resumeLane || '(none)'}`);
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

  if (command === 'summarize-lanes') {
    summarizeLanes(options);
    return;
  }

  fail(`Unknown command: ${command}`);
}

main();
