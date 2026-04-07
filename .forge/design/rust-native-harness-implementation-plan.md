# Implementation Plan: Native Forge Harness For `claw-code-main/rust`

> Date: 2026-04-06
> Depends on: `.forge/design/rust-native-harness-architecture.md`
> Target repo: `/Users/joe/2026/claw-code-main/rust`

---

## 1. Delivery Strategy

Build the native harness in four milestones.
Each milestone should leave the Rust CLI in a usable state and expose value on its own.

Principles:

- prefer read-only visibility before write-capable automation
- make durable state land before orchestration logic
- keep plugin lifecycle separate from harness lifecycle
- keep each patch set reviewable and reversible

---

## 2. Milestones

### M0. Scaffold And Schema

Goal:
- create the harness module boundary and durable file layout

Scope:
- `crates/runtime/src/harness/mod.rs`
- `crates/runtime/src/harness/state.rs`
- `crates/runtime/src/harness/phases.rs`
- `crates/runtime/src/lib.rs`

Deliverables:
- `.forge/harness/` path helpers
- `HarnessState` schema
- `HarnessRuntimeState` schema
- phase enums for build/repair/express
- read/write/normalize helpers

Acceptance:
- runtime can create and read `.forge/harness/state.json`
- missing harness files are treated as absent state, not as fatal errors
- schema round-trip tests exist

Verification:
- runtime unit tests for state parsing and defaulting
- path tests for `.forge/harness/*`

### M1. Read-Only Status Surface

Goal:
- expose current harness state and next action without mutating workflow

Scope:
- `crates/runtime/src/harness/next_action.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/rusty-claude-cli/src/main.rs`
- `crates/rusty-claude-cli/src/session.rs`

Deliverables:
- canonical `HarnessStatus` summary object
- CLI rendering path for current phase, blockers, and next action
- optional read-only slash or command surface for harness status

Acceptance:
- user can inspect harness status from the CLI
- phase and next action are shown from durable state, not inferred ad hoc
- no plugin dependency is required

Verification:
- CLI snapshot tests
- status rendering tests

### M2. Phase Gates

Goal:
- block or warn on invalid phase advancement based on artifacts and evidence

Scope:
- `crates/runtime/src/harness/gates.rs`
- `crates/runtime/src/harness/artifacts.rs`
- `crates/runtime/src/harness/phases.rs`
- status rendering updates in CLI

Deliverables:
- artifact discovery for `.forge/harness/spec.md`, `design/`, `contracts/`, `code-rules.md`, `evidence/`
- gate evaluator returning `allowed | warning | blocked`
- operator-facing reason strings

Acceptance:
- `design -> develop` fails when required artifacts are missing
- `repair` flow can require RCA/evidence before `fix`
- status output exposes gate failures explicitly

Verification:
- unit tests for gate matrix
- CLI/status tests for blocked and warning states

### M3. Handoff-Aware Resume

Goal:
- make resume/startup phase-aware rather than conversation-only

Scope:
- `crates/runtime/src/harness/status.rs`
- `crates/runtime/src/harness/next_action.rs`
- `crates/runtime/src/prompt.rs`
- `crates/runtime/src/session_control.rs`
- `crates/rusty-claude-cli/src/session.rs`

Deliverables:
- `.forge/harness/handoff.json` contract
- startup summary sourced from harness state
- prompt section containing phase summary and next action

Acceptance:
- resume reports current phase, next owner, blockers, and expected next step
- prompt context gets a bounded harness summary, not the whole artifact tree

Verification:
- prompt builder tests
- session resume tests

### M4. Native Harness Tools

Goal:
- expose stable read surfaces, then tightly scoped write surfaces

Scope:
- `crates/tools/src/harness_tools.rs`
- `crates/tools/src/lib.rs`
- `crates/rusty-claude-cli/src/session.rs`

Deliverables:
- `HarnessStatus`
- `HarnessPhaseGet`
- `HarnessArtifactList`
- optional later: `HarnessPhaseAdvance`

Acceptance:
- tools are registered as runtime tools, not plugin tools
- read-only surfaces work before any state mutation tool is enabled
- write-capable tool respects gate semantics

Verification:
- tool registry tests
- tool invocation tests

---

## 3. Lane Breakdown

### Lane A: `harness-state`

Goal:
- land schema, file paths, defaults, and migrations

Write scope:
- `crates/runtime/src/harness/mod.rs`
- `crates/runtime/src/harness/state.rs`
- `crates/runtime/src/harness/phases.rs`
- `crates/runtime/src/lib.rs`

Depends on:
- none

### Lane B: `harness-status`

Goal:
- render durable harness status in CLI and runtime summaries

Write scope:
- `crates/runtime/src/harness/next_action.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/rusty-claude-cli/src/main.rs`
- `crates/rusty-claude-cli/src/session.rs`

Depends on:
- `harness-state`

### Lane C: `harness-gates`

Goal:
- implement artifact discovery and gate evaluation

Write scope:
- `crates/runtime/src/harness/gates.rs`
- `crates/runtime/src/harness/artifacts.rs`
- `crates/runtime/src/harness/phases.rs`
- tests under `crates/runtime/`

Depends on:
- `harness-state`

### Lane D: `harness-resume`

Goal:
- feed bounded handoff context into resume and prompt assembly

Write scope:
- `crates/runtime/src/prompt.rs`
- `crates/runtime/src/session_control.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/rusty-claude-cli/src/session.rs`

Depends on:
- `harness-state`
- `harness-status`

### Lane E: `harness-tools`

Goal:
- register native harness tools in the runtime tool registry

Write scope:
- `crates/tools/src/harness_tools.rs`
- `crates/tools/src/lib.rs`
- `crates/rusty-claude-cli/src/session.rs`

Depends on:
- `harness-status`
- `harness-gates`

---

## 4. Recommended Execution Order

Use this order for the first implementation wave:

1. `harness-state`
2. `harness-status`
3. `harness-gates`
4. `harness-resume`
5. `harness-tools`

Why:

- state is the foundation
- status proves the model before mutators exist
- gates make the state operational
- resume consumes the new control plane
- tools come last so they wrap stable behavior instead of unstable internals

---

## 5. First Patch Set

The first patch should be intentionally small.

Goal:
- ship read-only harness state visibility

Files:
- `crates/runtime/src/harness/mod.rs`
- `crates/runtime/src/harness/state.rs`
- `crates/runtime/src/harness/phases.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/runtime/src/lib.rs`
- `crates/rusty-claude-cli/src/main.rs`

Contents:
- file path helpers for `.forge/harness/`
- minimal `HarnessState`
- phase enum and display helpers
- `read_harness_state()`
- read-only CLI status rendering

Do not include yet:
- phase advancement
- tool registration
- prompt injection
- write-capable status mutations

Success condition:
- a user can create or inspect harness state locally and see it reflected in CLI status

---

## 6. Test Plan

### Runtime tests

- state defaulting on missing files
- schema round-trip serialization
- phase normalization for build/repair/express
- artifact discovery on empty vs populated `.forge/harness/`
- gate matrix tests

### CLI tests

- status output with no harness state
- status output with active harness state
- status output with blocked phase gate
- resume output with handoff summary

### Tool tests

- runtime tool registry includes harness tools
- read-only harness tools work without plugins
- write-capable phase advance rejects invalid transitions

---

## 7. Risks To Watch During Implementation

### State duplication

Risk:
- runtime session state and harness workflow state drift apart

Mitigation:
- session remains conversation authority
- harness remains workflow authority
- status surfaces render both explicitly if needed

### Prompt bloat

Risk:
- loading spec/design/contracts into every prompt dilutes agent quality

Mitigation:
- inject only summary + phase-local context by default

### Registry mismatch

Risk:
- in-memory task/team/worker registries imply a workflow state that the durable harness does not know about

Mitigation:
- registries report live execution only
- phase transitions require durable harness updates

### Namespace confusion

Risk:
- `.forge` current config/session files become entangled with harness artifacts

Mitigation:
- no harness state outside `.forge/harness/`

---

## 8. Stop Conditions

Do not move to the next milestone if:

- status rendering is still inferring phase from ad hoc signals
- gate behavior is ambiguous between warning and block
- resume path requires loading the full design tree by default
- harness tools are using plugin registration instead of runtime registration

---

## 9. Definition Of Done

The implementation plan is complete when the target repo can:

- persist harness workflow state under `.forge/harness/`
- show canonical phase and next action in status
- enforce or warn on missing required artifacts before advancing phases
- resume with bounded handoff context
- expose these behaviors through native runtime surfaces

---

## 10. Recommended Next Action

Start with `M0 + M1` as one combined patch.

That yields the highest signal with the lowest risk:

- durable workflow state exists
- the CLI can display it
- reviewers can validate the control-plane shape before mutation logic lands
