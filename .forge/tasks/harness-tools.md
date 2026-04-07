# Lane: harness-tools

## Goal

Register native harness read surfaces, then tightly scoped write surfaces, through the runtime tool registry.

## Scope

- `crates/tools/src/harness_tools.rs`
- `crates/tools/src/lib.rs`
- `crates/rusty-claude-cli/src/session.rs`
- tool registry and invocation tests

## Dependencies

- `harness-status`
- `harness-gates`

## Contracts

- runtime tool registration path
- `HarnessStatus`
- `HarnessPhaseGet`
- `HarnessArtifactList`
- optional later: `HarnessPhaseAdvance`

## Required Outcomes

- harness tools are runtime-native, not plugin-based
- read-only tool surfaces ship before mutating ones
- any phase-advancing write path respects gate semantics
- tool naming does not conflict with existing builtins or plugins

## Tests

- tool registry tests
- tool invocation tests for read-only surfaces
- gated mutation tests if `HarnessPhaseAdvance` lands
