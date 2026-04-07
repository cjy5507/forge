# Lane: harness-resume

## Goal

Inject bounded harness handoff context into prompt assembly and session resume.

## Scope

- `crates/runtime/src/prompt.rs`
- `crates/runtime/src/session_control.rs`
- `crates/runtime/src/harness/status.rs`
- `crates/rusty-claude-cli/src/session.rs`
- prompt/resume tests

## Dependencies

- `harness-state`
- `harness-status`

## Contracts

- `.forge/harness/handoff.json`
- bounded phase summary for prompt context
- resume/status rendering contract

## Required Outcomes

- resume reports current phase, next owner, blockers, and next step
- prompt context includes summary-level harness context only
- full design/spec/contracts are not auto-injected by default
- handoff context remains useful when optional files are missing

## Tests

- prompt builder tests for bounded harness context
- resume tests for handoff-aware summaries
- regression tests for legacy session flows
