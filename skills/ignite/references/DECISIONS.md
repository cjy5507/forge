# Forge Protocol Decisions

This document records why each prompt-only protocol is (or is not) enforced in
code. When a meta-audit flags a protocol as "declared but unconsumed", check
this file first — intentional prompt-only status is recorded here.

## Enforcement status

| Protocol | Status | Enforcement |
|---|---|---|
| `harness-learning.md` | **Code-enforced** | Reader auto-populates `lessons_brief` at state init; delivery phase gate blocks advance when holes exist but no lessons recorded |
| `handoff-interview.md` | **Code-enforced (full tier) / prompt-only (lower tiers, simplified)** | Phase gate requires `.forge/handoff-interviews/{phase}.md` artifact at full tier. At off/light/medium the protocol is a single inline step: blockers + assumptions recorded on the receiving team's own working artifact, direct-owner ping for blockers, no CEO triage hop, no separate understanding statement. See rationale below. |
| `context-budget.md` | **Prompt-only (intentional)** | See rationale below |
| `repair-baseline` | **Prompt-only (intentional)** | See rationale below |

## repair-baseline — why prompt-only

In build mode, `.forge/code-rules.md` and `.forge/contracts/*` are produced by
the design phase (CTO + Designer). Write-gate (`scripts/write-gate.mjs:319-325`)
requires both to exist for medium+ tier high-risk writes. In repair mode there
is no design phase, so these artifacts must be bootstrapped at intake or the
write-gate will self-deadlock the first time a developer attempts a fix.

**Why enforcement is prompt-only:**

1. **Target codebase diversity.** A baseline generator would need to understand
   every language's convention extraction (ESLint → JS naming, ruff → Python,
   rustfmt → Rust, gofmt → Go, etc.) plus every public API surface shape
   (`.d.ts`, OpenAPI, protobuf, GraphQL SDL). Shipping a robust code-level
   generator is larger than the rest of Forge combined.

2. **LLM inspection is cheap and correct.** The CEO at intake can read the
   existing config and sample files, then write a minimal `code-rules.md`
   and copy 1-2 type files into `contracts/` in seconds. This is exactly
   the kind of "judgment + filesystem read" task LLMs excel at.

3. **Placeholder is acceptable.** Unlike build mode (where code-rules.md
   reflects team agreements), repair code-rules.md only needs to unblock
   the write-gate. A file saying "Repair scope: follow existing conventions
   in files touched by this fix" satisfies the gate and matches reality.

**Where the protocol is declared:** `skills/intake/SKILL.md` Step 6
("REPAIR baseline bootstrap") — CEO runs this before transitioning to
forge:troubleshoot. If the bootstrap is skipped, the first developer Edit
under medium tier will be denied with a missing-artifact error — which is
a self-correcting signal rather than a silent-failure risk.

**Escalation path:** If repair self-deadlock is reported in the wild despite
this protocol, the correct fix is to extend `shouldSkipApprovalChecks` in
write-gate.mjs to also skip `.forge/code-rules.md` and `contracts/` checks
in repair mode, NOT to add a code-level baseline generator.

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
code. Rationale: the protocol is behavioral, not structural.

## handoff-interview — why lower tiers are a single inline step (v0.9.2+)

**Benchmark evidence (2026-04-21 behavioral audit, n=1 full pipeline):**
wall-clock 62.2min, agent work 34.5min (55%), **gap time 27.8min (44.7%)**.
The gap time is dominated by orchestration between agents — the prior
four-step protocol (read → structured Q template → CEO triage → two-party
understanding confirmation) accounts for most of it. The structured
`Q:/Domain:/Blocker:/Default:` format, the CEO middle-hop, and the separate
understanding statement were all declared-but-no-consumer artifacts: none
were written to state or referenced by downstream code. Memory-rule
violation ("declared but no producer-consumer pair = structural
anti-pattern").

**Simplified lower-tier protocol:**

1. Receiving team reads artifacts.
2. Records blockers + consequential assumptions as free-form bullets at the
   top of its own working artifact (architecture.md, plan.md, tasks/{lane}.md,
   QA test plan).
3. Pings the direct owner via SendMessage for each blocker (PM / CTO /
   Designer by domain). No CEO triage hop unless ownership is ambiguous.
4. Starts work once blockers are resolved. No separate understanding
   statement — the working artifact is the record.

**Full tier unchanged:** the `.forge/handoff-interviews/{phase}.md` artifact
gate still runs in `checkPhaseGate`; the artifact format is simplified to
`Blockers` + `Assumptions recorded` sections, with implicit sign-off.

**Expected savings:** ~14 min per full-pipeline run (from 27.8min gap → ~14min),
per audit projection. Safety property preserved: blockers are still recorded
and resolved before receiving team starts substantive work.
