# Lane: harness-status

## Goal

Expose a read-only native harness status surface in the Rust CLI backed by durable harness state.

## Scope

- `crates/runtime/src/harness/next_action.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/rusty-claude-cli/src/main.rs`
- `crates/rusty-claude-cli/src/session.rs`
- CLI/status snapshot tests

## Dependencies

- `harness-state`

## Contracts

- `HarnessState`
- canonical `next_action` summary
- CLI status rendering contract

## Required Outcomes

- CLI can show current harness mode, phase, blockers, and next action
- status is derived from durable harness state, not ad hoc inference
- no plugin registration is involved
- output is useful even when no harness state exists yet

## Tests

- CLI snapshot tests for empty and active harness state
- runtime tests for next-action summary derivation
- regression tests for non-harness sessions remaining stable
