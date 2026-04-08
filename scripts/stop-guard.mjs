#!/usr/bin/env node
// Forge Hook: Stop — blocks termination during critical phases (develop/fix/qa)
// at any tier; blocks all phases at full tier only
//
// Host compatibility: This script handles the Claude Code Stop event.  On
// hosts that do not fire Stop, readStdin() rejects and the catch block returns
// { continue: true } — execution is never blocked.
//
// Claude Code-specific input fields (all accessed with ?. / fallbacks):
//   input.last_assistant_message — used to detect interactive prompts so the
//                                  guard does not block when the agent is
//                                  waiting for user input
//   input.stop_hook_active       — set by the host to prevent recursive blocks

import { runHook } from './lib/hook-runner.mjs';
import { appendRecent } from './lib/forge-io.mjs';
import { readForgeState, readRuntimeState, recordDecisionTrace, recordVerificationState, selectResumeSkill, updateRuntimeState } from './lib/forge-session.mjs';
import { isProjectActive, messageLooksInteractive } from './lib/forge-interaction.mjs';
import { summarizePendingWork } from './lib/forge-compact-context.mjs';
import { readActiveTier } from './lib/forge-tiers.mjs';
import { resolvePhase } from './lib/forge-phases.mjs';
import { readEnvTier, tierAtLeast } from './lib/forge-tiers.mjs';
import { buildStopBatchCheckPlan, runStopBatchChecks, summarizeStopBatchResults } from './lib/forge-tooling.mjs';

const CRITICAL_PHASES = new Set(['develop', 'fix', 'qa']);

runHook(async (input) => {
  const envTier = readEnvTier();
  if (envTier === 'off') {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const cwd = input?.cwd || '.';
  const state = readForgeState(cwd);

  if (!state || !isProjectActive(state)) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const tier = readActiveTier(cwd, state, input);
  const phase = resolvePhase(state);
  const isCritical = CRITICAL_PHASES.has(phase.id);

  const lastMessage = String(input?.last_assistant_message || '');
  const interactive = messageLooksInteractive(lastMessage);

  const runtime = updateRuntimeState(cwd, current => ({
    ...current,
    recent_agents: appendRecent(current.recent_agents, {
      kind: 'main-stop-attempt',
      phase: phase.id,
      at: new Date().toISOString(),
    }),
    last_event: {
      name: 'Stop',
      at: new Date().toISOString(),
    },
  }));

  if (interactive || input?.stop_hook_active === true) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const batchChecksEnabled = process.env.FORGE_STOP_BATCH_CHECKS !== '0';
  if (batchChecksEnabled && tierAtLeast(tier, 'medium')) {
    const runtimeForBatchChecks = readRuntimeState(cwd, { state });
    const batchPlan = buildStopBatchCheckPlan({
      cwd,
      runtime: runtimeForBatchChecks,
      state,
      env: process.env,
    });

    if (batchPlan.checks.length > 0) {
      recordVerificationState(cwd, {
        updated_at: new Date().toISOString(),
        edited_files: batchPlan.editedFiles,
        lane_refs: batchPlan.laneRefs,
        selected_checks: batchPlan.checks.map(check => ({
          id: check.id,
          reason: check.reason,
          command: check.spec?.runner ? [check.spec.runner, ...(check.spec.args || [])].join(' ').trim() : '',
        })),
        status: 'planned',
        summary: `Planned ${batchPlan.checks.length} verification checks from ${batchPlan.source}.`,
      });

      const batchResults = runStopBatchChecks(batchPlan, { cwd });
      const batchSummary = summarizeStopBatchResults(batchResults);
      const batchCommands = batchResults.map(result => result.command).filter(Boolean);
      const failedCheck = batchResults.find(result => !result.ok);

      updateRuntimeState(cwd, current => ({
        ...current,
        tooling: {
          ...(current.tooling || {}),
          edited_files: failedCheck ? (current.tooling?.edited_files || []) : [],
          last_batch_check: {
            at: new Date().toISOString(),
            status: failedCheck ? 'failed' : 'passed',
            summary: batchSummary,
            commands: batchCommands,
          },
        },
      }));

      if (failedCheck) {
        const reason = `[Forge Batch Checks] ${failedCheck.id} failed while validating edited files.
Command: ${failedCheck.command}
Reason: ${failedCheck.reason}

${failedCheck.output || batchSummary}`;

        updateRuntimeState(cwd, current => ({
          ...current,
          stop_guard: {
            block_count: (current.stop_guard?.block_count || 0) + 1,
            last_reason: reason,
            last_message: lastMessage,
          },
          stats: {
            ...(current.stats || {}),
            stop_block_count: ((current.stats || {}).stop_block_count || 0) + 1,
          },
          last_event: {
            name: 'StopBlocked',
            at: new Date().toISOString(),
          },
        }));

        recordVerificationState(cwd, {
          updated_at: new Date().toISOString(),
          edited_files: batchPlan.editedFiles,
          lane_refs: batchPlan.laneRefs,
          selected_checks: batchResults.map(result => ({
            id: result.id,
            reason: result.reason,
            command: result.command,
          })),
          status: 'failed',
          summary: batchSummary,
        });

        recordDecisionTrace(cwd, {
          scope: 'stop_guard',
          kind: 'batch_check_block',
          target: failedCheck.id,
          summary: batchSummary,
          inputs: batchCommands,
        });

        console.log(JSON.stringify({
          continue: true,
          suppressOutput: true,
          decision: 'block',
          reason,
        }));
        return;
      }

      recordVerificationState(cwd, {
        updated_at: new Date().toISOString(),
        edited_files: batchPlan.editedFiles,
        lane_refs: batchPlan.laneRefs,
        selected_checks: batchResults.map(result => ({
          id: result.id,
          reason: result.reason,
          command: result.command,
        })),
        status: 'passed',
        summary: batchSummary,
      });
    }
  }

  // For non-critical phases, only full tier gets stop protection.
  // Batch checks above still run for medium/full tiers before we exit.
  if (!isCritical && !tierAtLeast(tier, 'full')) {
    recordDecisionTrace(cwd, {
      scope: 'stop_guard',
      kind: 'allow_noncritical',
      target: phase.id,
      summary: `Allowed stop during non-critical phase ${phase.id}`,
      inputs: [],
    });
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }

  const pending = summarizePendingWork(state);

  // Critical phases at light/medium tier get a softer warning instead of a hard block
  if (isCritical && !tierAtLeast(tier, 'full')) {
    const warning = `[Forge Stop Guard] Warning: stopping during critical phase "${phase.id}" may leave work incomplete. Pending: ${pending.join(', ')}.`;
    updateRuntimeState(cwd, current => ({
      ...current,
      stop_guard: {
        block_count: (current.stop_guard?.block_count || 0) + 1,
        last_reason: warning,
        last_message: lastMessage,
      },
      stats: {
        ...(current.stats || {}),
        stop_block_count: ((current.stats || {}).stop_block_count || 0) + 1,
      },
      last_event: {
        name: 'StopWarned',
        at: new Date().toISOString(),
      },
    }));
    recordDecisionTrace(cwd, {
      scope: 'stop_guard',
      kind: 'warn_critical',
      target: phase.id,
      summary: warning,
      inputs: pending,
    });
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      stopReason: warning,
    }));
    return;
  }

  const resume = selectResumeSkill(state, runtime);
  const currentSkill = resume.skill || 'continue';
  const extraReason = resume.reason ? `\nResume reason: ${resume.reason}` : '';
  const reason = `[Forge Stop Guard] The Forge pipeline for "${state.project || 'unnamed'}" is still in progress (phase: ${phase.id}). Pending: ${pending.join(', ')}.

[MAGIC KEYWORD: FORGE:${currentSkill.toUpperCase()}]

To continue, invoke the skill:
Skill: forge:${currentSkill}

To stop, the user can say "forge cancel".${extraReason}`;

  updateRuntimeState(cwd, current => ({
    ...current,
    stop_guard: {
      block_count: (current.stop_guard?.block_count || 0) + 1,
      last_reason: reason,
      last_message: lastMessage,
    },
    stats: {
      ...(current.stats || {}),
      stop_block_count: ((current.stats || {}).stop_block_count || 0) + 1,
    },
    last_event: {
      name: 'StopBlocked',
      at: new Date().toISOString(),
    },
  }));
  recordDecisionTrace(cwd, {
    scope: 'stop_guard',
    kind: 'block_in_progress',
    target: phase.id,
    summary: reason,
    inputs: pending,
  });

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    decision: 'block',
    reason,
  }));
}, { name: 'stop-guard', failClosed: true });
