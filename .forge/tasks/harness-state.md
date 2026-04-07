# Lane: harness-state

## Goal

Introduce the native harness state boundary and durable `.forge/harness/` schema in the Rust runtime.

## Scope

- `crates/runtime/src/harness/mod.rs`
- `crates/runtime/src/harness/state.rs`
- `crates/runtime/src/harness/phases.rs`
- `crates/runtime/src/lib.rs`
- runtime tests for schema/path/default behavior

## Dependencies

- none

## Contracts

- `.forge/design/rust-native-harness-architecture.md`
- `.forge/design/rust-native-harness-implementation-plan.md`
- `.forge/harness/state.json`
- `.forge/harness/runtime.json`

## Required Outcomes

- `.forge/harness/` path helpers exist in runtime
- `HarnessState` and `HarnessRuntimeState` round-trip cleanly
- missing harness files are non-fatal and normalize to safe defaults
- build/repair/express phase identities are modeled in Rust

## Tests

- runtime unit tests for read/write/default state
- runtime tests for phase normalization
- runtime tests for missing-file behavior
