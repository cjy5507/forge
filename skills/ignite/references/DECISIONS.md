# Forge Protocol Decisions

This document records why each prompt-only protocol is (or is not) enforced in
code. When a meta-audit flags a protocol as "declared but unconsumed", check
this file first — intentional prompt-only status is recorded here.

## Enforcement status

| Protocol | Status | Enforcement |
|---|---|---|
| `harness-learning.md` | **Code-enforced** | Reader auto-populates `lessons_brief` at state init; delivery phase gate blocks advance when holes exist but no lessons recorded |
| `handoff-interview.md` | **Code-enforced (full tier)** | Phase gate requires `.forge/handoff-interviews/{phase}.md` artifact at full tier for phases flagged `handoff_required` |
| `context-budget.md` | **Prompt-only (intentional)** | See rationale below |

## context-budget.md — why prompt-only

The context-budget protocol defines which files each agent role should receive
when dispatched (T0 mandatory, T1 relevant, T2 on-demand, T3 excluded). It is
guidance about LLM behavior during agent dispatch, not a runtime invariant.

**Why enforcement is not attempted:**

1. **Fragile static analysis.** The "context" an agent receives is whatever
   text appears in its dispatch prompt. Detecting which files have been
   "loaded" would require parsing the free-form prompt string and mapping
   mentions back to the filesystem. Paraphrased content, inlined snippets,
   and indirect references would all bypass such a check.

2. **Soft failure mode.** Violating the budget causes gradual degradation
   (agent attention spread thin), not a hard failure. The harness cannot
   observe this degradation without LLM-in-the-loop evaluation.

3. **Guidance, not invariant.** Unlike phase gates or artifact contracts,
   context budgets are advice the LLM applies while constructing a dispatch.
   The right place for this advice is the dispatcher's own context — i.e.,
   the skill markdown that constructs the Agent call — not a runtime hook.

4. **High false-positive risk.** A naive check (e.g., "developer role must
   not receive files outside `tasks/` and `contracts/`") would fail whenever
   an agent needs legitimate T2 escalation, creating noise without signal.

**What happens if an agent ignores the budget:** output quality degrades
subtly. Detection is by QA / rework rate, not by a hook. If this ever shows
measurable impact, escalate to tier-gated static analysis of Agent prompts.

## harness-learning.md — what is enforced

**Read side** (implemented):

- `scripts/lib/forge-lessons-loader.mjs` — parses lesson files from
  `.forge/lessons/` (local) and `~/.claude/forge-lessons/` (global) or
  `FORGE_LESSONS_GLOBAL_DIR` env override.
- On initial `writeForgeState` (when `previousState` is null), the loader
  runs and populates `state.lessons_brief: ForgeLessonBrief[]`. This
  closes the "LLM reads markdown" loop — data is now in state.json for
  downstream agents.

**Write side** (enforced via phase gate + helper):

- `scripts/lib/forge-lessons-writer.mjs` exposes `createLesson({cwd, type,
  title, sections, ...})` and `validateLessonContent(content)`. The helper
  validates against the protocol (Type, "Applies when", prevention/process/
  calibration section) before writing `.forge/lessons/{id}.md`. Agents
  should call the helper rather than write markdown directly so format
  errors surface at write time, not at later read time.
- `checkPhaseGate(cwd, 'delivery', 'build'|'repair', { tier })` blocks
  advance when `.forge/holes/` has any file but `.forge/lessons/` contains
  no `.md`. Both modes are subject to this gate for harness-learning
  symmetry across projects.
- Format validation at the phase gate is intentionally loose — it checks
  existence, not per-file format. Strict format checks happen at write
  time via the helper; the gate is a soft "issues found, lessons must
  exist" invariant, not a format linter.

## handoff-interview.md — what is enforced

**Enforced at full tier:**

- Phases marked `handoff_required: true` in `BUILD_PHASE_GATES` (design,
  plan, develop, qa) require `.forge/handoff-interviews/{phase}.md` to
  exist with ≥40 bytes before `checkPhaseGate` returns `canAdvance: true`.
- `REPAIR_PHASE_GATES.fix` also carries `handoff_required: true` — the
  isolate→fix transition is the only ownership change in the repair
  sequence (troubleshooter → developer). Same-agent repair transitions
  (intake→reproduce, regress→verify) remain prompt-only.
- State-store's `applyPhaseGateCheck` passes the active tier to the gate
  check and reverts advances when the handoff artifact is missing.

**Not enforced below full tier:**

- At light/medium tiers, the handoff is prompt-only. This matches the
  scale-appropriate-decisions principle: small projects do not need the
  full interview ritual; large/full-tier projects do.

**Not enforced in write-gate:**

- `scripts/write-gate.mjs` deliberately omits the tier parameter when
  calling `checkPhaseGate`, so handoff artifacts are checked once at the
  phase transition, not on every tool write. See write-gate.mjs comment.

**Content quality is not enforced.** Only artifact existence and a minimum
byte threshold. The interview's substance is LLM-driven and unchecked by
code. Rationale: the three-step protocol (read → questions → confirm) is
behavioral, not structural.
