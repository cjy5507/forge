# Lane: harness-gates

## Goal

Make phase advancement and status surfaces artifact-aware through explicit harness gate evaluation.

## Scope

- `crates/runtime/src/harness/gates.rs`
- `crates/runtime/src/harness/artifacts.rs`
- `crates/runtime/src/harness/phases.rs`
- harness gate tests under `crates/runtime/`
- status integration updates only where needed

## Dependencies

- `harness-state`

## Contracts

- `.forge/harness/spec.md`
- `.forge/harness/design/`
- `.forge/harness/contracts/`
- `.forge/harness/code-rules.md`
- `.forge/harness/evidence/`
- gate result: `allowed | warning | blocked`

## Required Outcomes

- build flow can block `design -> develop` on missing required artifacts
- repair flow can require evidence before `fix`
- gate evaluation returns explicit missing/stale reasons
- status surface exposes blocked/warning states clearly

## Tests

- gate matrix tests for build/repair/express
- artifact discovery tests for empty vs populated harness dirs
- CLI/runtime tests for blocked and warning rendering
