#!/usr/bin/env node

import {
  compareEvalRuns,
  deriveHarnessRun,
  getEvalScenario,
  listEvalScenarios,
  loadRunSummary,
  renderEvalMarkdown,
  writeEvalArtifacts,
} from './lib/forge-eval.mjs';

function printUsage() {
  console.log(`Forge evaluation helper

Usage:
  node scripts/forge-eval.mjs --task <name> [--baseline <summary.json>] [--harness <summary.json>] [--slug <slug>] [--write]
  node scripts/forge-eval.mjs --scenario <id> [--baseline <summary.json>] [--write]
  node scripts/forge-eval.mjs --task <name> [--baseline <summary.json>] [--harness <summary.json>] --json
  node scripts/forge-eval.mjs --task <name> [--baseline <summary.json>] [--harness <summary.json>] --markdown
  node scripts/forge-eval.mjs --list-scenarios [--json]

Options:
  --task       task or experiment name
  --scenario   built-in proof scenario id
  --baseline   path to without-Forge summary JSON
  --harness    path to with-Forge summary JSON; defaults to current repo-derived Forge summary
  --slug       output slug for .forge/eval/*.json and *.md
  --write      persist .forge/eval artifacts and append .forge/events/eval.jsonl
  --list-scenarios print available built-in scenarios
  --json       print the machine-readable comparison to stdout
  --markdown   print the markdown report to stdout
  --help       show this message
`);
}

function fail(message) {
  process.stderr.write(`[forge eval] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    write: false,
    json: false,
    markdown: false,
    listScenarios: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--write') {
      options.write = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--markdown') {
      options.markdown = true;
      continue;
    }
    if (arg === '--list-scenarios') {
      options.listScenarios = true;
      continue;
    }
    if (['--task', '--scenario', '--baseline', '--harness', '--slug'].includes(arg)) {
      const value = argv[index + 1];
      if (!value) {
        fail(`Missing value for ${arg}`);
      }
      index += 1;
      if (arg === '--task') options.task = value.trim();
      if (arg === '--scenario') options.scenario = value.trim();
      if (arg === '--baseline') options.baseline = value.trim();
      if (arg === '--harness') options.harness = value.trim();
      if (arg === '--slug') options.slug = value.trim();
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (options.listScenarios) {
    const scenarios = listEvalScenarios();
    if (options.json) {
      process.stdout.write(`${JSON.stringify(scenarios, null, 2)}\n`);
    } else {
      for (const scenario of scenarios) {
        process.stdout.write(`${scenario.id}: ${scenario.title}\n`);
      }
    }
    process.exit(0);
  }

  if (options.scenario && !getEvalScenario(options.scenario)) {
    fail(`Unknown scenario: ${options.scenario}`);
  }

  const baseline = options.baseline ? loadRunSummary(options.baseline, 'without_forge') : null;
  const harness = options.harness
    ? loadRunSummary(options.harness, 'with_forge')
    : deriveHarnessRun(process.cwd(), {
        task: options.task || getEvalScenario(options.scenario)?.title || '',
        scenario: options.scenario || '',
      });
  const report = compareEvalRuns({
    task: options.task || getEvalScenario(options.scenario)?.title || harness.task || baseline?.task || '',
    baseline,
    harness,
  });

  const shouldWrite = options.write || (!options.json && !options.markdown);
  const outputs = shouldWrite ? writeEvalArtifacts(process.cwd(), report, { slug: options.slug }) : null;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (options.markdown) {
    process.stdout.write(renderEvalMarkdown(report));
  } else if (outputs) {
    process.stdout.write(`${outputs.jsonPath}\n${outputs.markdownPath}\n`);
  }
} catch (error) {
  fail(error.message);
}
