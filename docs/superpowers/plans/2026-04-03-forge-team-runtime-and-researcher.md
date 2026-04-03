# Forge Team Runtime and Researcher Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Forge's documented parallel team model into a real session-aware execution runtime by integrating the new Researcher role into discovery/design, promoting `.forge/tasks/` into executable lane state, adding worktree orchestration support, and making status/resume aware of parallel work.

**Architecture:** Build this in layers. First, add the minimum shared data model for lane-aware tasks and runtime state. Next, integrate Researcher into discovery/design so evidence gathering becomes a first-class phase input. Then add worktree/task orchestration primitives and make status/resume surface lane state clearly. Keep the first pass state-driven and file-backed; do not attempt to build a fully autonomous merge bot in the same change.

**Tech Stack:** Markdown skill/agent prompts, Node.js hook/runtime scripts, JSON state files under `.forge/`, Vitest, git worktree orchestration

---

## File Structure Map

### Files to modify
- `agents/researcher.md` — already added role prompt; may need refinement after wiring decisions
- `skills/discovery/SKILL.md` — connect Researcher as a supported discovery role
- `skills/design/SKILL.md` — connect Researcher as a parallel evidence-gathering lane before/during design decisions
- `skills/develop/SKILL.md` — upgrade from prose-only parallelism to runtime-backed orchestration expectations
- `agents/lead-dev.md` — clarify leader responsibilities for lane graph, worktree coordination, and resume handoff
- `scripts/lib/forge-state.mjs` — extend runtime/state shape for lanes, task ownership, worktrees, and resume metadata
- `scripts/state-restore.mjs` — inject lane-aware compact context on session start
- `scripts/phase-detector.mjs` — keep recommended agents and phase hints aware of researcher/discovery/design behavior
- `skills/status/SKILL.md` — surface lane/task/worktree state in status output
- `skills/continue/SKILL.md` — resume lane-aware execution, not just phase-level continuation
- `skills/intake/SKILL.md` — ensure `.forge/` structure includes lane/task runtime artifacts needed by the new engine
- `README.md` — mention session-aware team runtime once implementation is in place
- `MARKETPLACE.md` — optional minimal wording update only if implementation materially changes the product claim
- `assets/marketplace-preview.html` — optional copy refresh only if the claim changes materially
- `scripts/harness-hooks.test.mts` — extend/adjust tests for lane/runtime state behavior

### New files to create
- `templates/task.md` — canonical task/lane template for `.forge/tasks/*.md`
- `scripts/forge-worktree.mjs` — shared helper CLI for creating/listing/cleaning Forge worktrees
- `scripts/forge-lane-runtime.mjs` — helper for lane-state creation/update/reporting
- `skills/develop/references/lane-runtime.md` — focused reference for leader/worker lane coordination rules
- `skills/discovery/references/research-handoff.md` — compact reference for when PM should bring in Researcher
- `skills/design/references/research-integration.md` — compact reference for how Researcher hands evidence into CTO/Designer

### Files to read closely before editing
- `skills/discovery/SKILL.md`
- `skills/design/SKILL.md`
- `skills/develop/SKILL.md`
- `skills/continue/SKILL.md`
- `skills/status/SKILL.md`
- `skills/intake/SKILL.md`
- `agents/lead-dev.md`
- `agents/researcher.md`
- `scripts/lib/forge-state.mjs`
- `scripts/state-restore.mjs`
- `scripts/phase-detector.mjs`
- `scripts/harness-hooks.test.mts`

---

## Implementation Strategy

### Product decisions locked by this plan
- Researcher becomes a first-class role in discovery/design, but not yet a separate top-level phase.
- `.forge/tasks/*.md` becomes the human-readable mirror of runtime lane state, not an optional note.
- `.forge/runtime.json` becomes the source of truth for active lanes, worktree paths, owners, dependencies, and resume hints.
- Status and resume must become lane-aware in the first pass.
- Worktree creation/cleanup becomes scriptable and standardized, even if final merge automation remains partly manual.
- We intentionally stop before fully autonomous multi-PR merging; the first pass is orchestration and continuity, not complete self-driving integration.

---

### Task 1: Define the lane/task runtime data model

**Files:**
- Modify: `scripts/lib/forge-state.mjs`
- Create: `templates/task.md`
- Test: `scripts/harness-hooks.test.mts`

- [ ] **Step 1: Write the failing model checklist in notes**

The new data model must support:
- lane id
- task title
- owner role
- owner agent id (optional)
- worktree path
- dependency ids
- status (`pending`, `ready`, `in_progress`, `blocked`, `in_review`, `merged`, `done`)
- session handoff notes
- last event timestamp
- review state

- [ ] **Step 2: Extend `scripts/lib/forge-state.mjs` defaults and normalization**

Add normalized runtime/state support for:
- `lanes` array or object
- `active_worktrees`
- `task_graph_version`
- `resume_lane`
- lane summaries for compact context generation

Keep backward compatibility with older `.forge/state.json` and `.forge/runtime.json` files.

- [ ] **Step 3: Add a canonical `templates/task.md`**

Template sections must include:
- task id/title
- role owner
- worktree
- scope
- dependencies
- acceptance criteria
- review checklist
- session handoff notes

- [ ] **Step 4: Add/adjust tests for normalization and pending-work summaries**

Test examples should verify:
- older states still normalize safely
- new lane fields survive round-trip persistence
- pending work can include lane/task counts cleanly

- [ ] **Step 5: Run targeted tests**

Run:
```bash
npm test -- --run scripts/harness-hooks.test.mts
```
Expected: test suite passes with new state-model assertions

---

### Task 2: Integrate Researcher into discovery and design

**Files:**
- Modify: `skills/discovery/SKILL.md`
- Modify: `skills/design/SKILL.md`
- Create: `skills/discovery/references/research-handoff.md`
- Create: `skills/design/references/research-integration.md`
- Read: `agents/researcher.md`

- [ ] **Step 1: Update discovery to call Researcher deliberately, not always**

Discovery should bring in Researcher when:
- user asks for comparisons
- external references matter
- tool/vendor/stack options must be compared
- PM cannot responsibly close ambiguity without outside information

- [ ] **Step 2: Add a compact `research-handoff.md` reference**

Include:
- when PM escalates to Researcher
- what question format to pass
- expected research brief output
- how PM converts research into clarified requirements

- [ ] **Step 3: Update design to incorporate Researcher evidence before/alongside CTO decisions**

Design should state clearly:
- CTO still owns final architecture
- Researcher can produce option comparisons and evidence briefs
- Researcher supports CTO/Designer before hard technical choices are locked

- [ ] **Step 4: Add a compact `research-integration.md` reference**

Include:
- Researcher → CTO handoff
- Researcher → Fact Checker distinction
- evidence expectations before architecture lock-in

- [ ] **Step 5: Run a manual review of both skills**

Run:
```bash
sed -n '1,220p' skills/discovery/SKILL.md
sed -n '1,240p' skills/design/SKILL.md
```
Expected: Researcher is clearly integrated without replacing PM/CTO responsibilities

---

### Task 3: Add worktree/lane orchestration helpers

**Files:**
- Create: `scripts/forge-worktree.mjs`
- Create: `scripts/forge-lane-runtime.mjs`
- Modify: `skills/develop/SKILL.md`
- Modify: `agents/lead-dev.md`
- Create: `skills/develop/references/lane-runtime.md`

- [ ] **Step 1: Add a small CLI for Forge worktree operations**

`forge-worktree.mjs` should support at minimum:
- create
- list
- remove
- prune

Arguments should be explicit and narrow. Avoid turning it into a generic git wrapper.

- [ ] **Step 2: Add a lane-runtime helper**

`forge-lane-runtime.mjs` should support at minimum:
- init-lane
- update-lane-status
- assign-owner
- write-handoff
- summarize-lanes

Persist to `.forge/runtime.json` in a stable shape.

- [ ] **Step 3: Update `skills/develop/SKILL.md` to use these helpers conceptually**

Replace pure prose-only orchestration with concrete runtime-backed expectations:
- lead creates lane/task entries
- worktrees are provisioned via helper or equivalent standardized path
- every worker lane writes handoff state
- review/merge steps update lane status explicitly

- [ ] **Step 4: Update `agents/lead-dev.md` for session-aware leadership**

Clarify that Lead must:
- maintain lane graph
- track dependencies
- update merged/rebased state
- provide explicit resume guidance when a session ends mid-stream

- [ ] **Step 5: Add `lane-runtime.md` reference**

Cover:
- lane statuses
- dependency handling
- rebase policy
- handoff note expectations
- merge/review state transitions

- [ ] **Step 6: Run script smoke checks**

Run:
```bash
node scripts/forge-worktree.mjs --help
node scripts/forge-lane-runtime.mjs --help
```
Expected: both commands print concise usage and exit cleanly

---

### Task 4: Make status and resume lane-aware

**Files:**
- Modify: `skills/status/SKILL.md`
- Modify: `skills/continue/SKILL.md`
- Modify: `scripts/state-restore.mjs`
- Modify: `scripts/phase-detector.mjs`
- Modify: `scripts/lib/forge-state.mjs`
- Test: `scripts/harness-hooks.test.mts`

- [ ] **Step 1: Extend compact context and status summaries**

Status should show:
- active lanes count
- blocked lanes count
- ready lanes count
- active worktrees count
- suggested resume target if one lane is clearly next

- [ ] **Step 2: Update continue/resume skill to restore lane context**

Resume should not only say “phase 3/develop.” It should be able to say:
- which lane is in progress
- which lane is blocked and why
- which lane is waiting review
- which lane should be resumed first

- [ ] **Step 3: Update session-start restoration to include lane summaries**

Keep it compact. The goal is continuity, not flooding the prompt.

- [ ] **Step 4: Add tests for lane-aware compact context / resume hints**

Verify that:
- runtime with lanes produces a compact lane summary
- no-lane projects still behave exactly as before
- resume hint selection is deterministic

- [ ] **Step 5: Run targeted tests**

Run:
```bash
npm test -- --run scripts/harness-hooks.test.mts
```
Expected: all tests pass, including new lane-aware assertions

---

### Task 5: Update intake/develop docs and product messaging minimally

**Files:**
- Modify: `skills/intake/SKILL.md`
- Modify: `README.md`
- Modify: `MARKETPLACE.md`
- Modify: `assets/marketplace-preview.html` (only if wording materially changes)

- [ ] **Step 1: Update intake `.forge/` structure description**

Make sure `.forge/` description explicitly covers the new runtime/lane/task orchestration meaning.

- [ ] **Step 2: Update README with one concise line about session-aware team runtime**

Do not bloat the README. One strong line is enough.

- [ ] **Step 3: Update marketplace copy only if the implementation materially strengthens the claim**

If updated, emphasize:
- session-aware team runtime
- lane/task continuity
- worktree-backed parallel execution

- [ ] **Step 4: Review preview copy for consistency**

Only edit if needed to keep claims aligned.

---

### Task 6: Final verification and integration

**Files:**
- Verify all changed files

- [ ] **Step 1: Run full test suite**

Run:
```bash
npm test
```
Expected: all tests pass

- [ ] **Step 2: Validate Claude plugin manifests if they changed incidentally**

Run:
```bash
claude plugin validate .claude-plugin/marketplace.json
claude plugin validate .claude-plugin/plugin.json
```
Expected: passes (warnings acceptable only if pre-existing and understood)

- [ ] **Step 3: Smoke test helper CLIs**

Run:
```bash
node scripts/forge-worktree.mjs --help
node scripts/forge-lane-runtime.mjs --help
```
Expected: clean usage output

- [ ] **Step 4: Review final diff**

Run:
```bash
git status --short
git diff --stat
```
Expected: changes stay focused on researcher wiring + team runtime

- [ ] **Step 5: Create final Lore-format integration commit**

Commit should mention:
- Researcher integration
- session-aware lane runtime
- worktree orchestration support
- what remains intentionally manual (e.g. full autonomous merge bot)

