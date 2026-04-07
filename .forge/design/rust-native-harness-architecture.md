# Architecture: Native Forge Harness For `claw-code-main/rust`

> CTO Design Document | Date: 2026-04-06 | Status: Proposed
> Target repo: `/Users/joe/2026/claw-code-main/rust`
> Goal: embed the minimum useful Forge control plane as a native harness, not as a plugin

---

## 1. Intent

This design proposes a native Forge harness layer inside the Rust codebase at
`/Users/joe/2026/claw-code-main/rust`.

The purpose is not to port all of Forge into the binary.
The purpose is to add the minimum control-plane features that make long-running
agent work safer, more resumable, and more phase-aware:

1. durable phase and state tracking
2. artifact-aware handoff and resume
3. verify-before-advance gating

The key decision is:
**embed Forge as a runtime orchestration layer inside `runtime` and `tools`, while leaving plugin lifecycle, marketplace concerns, and full skill distribution outside the v1 core.**

---

## 2. Product Boundary

### 2.1 What this harness is

The native harness is a local control plane for structured work:

- phase progression
- state persistence
- artifact discovery
- handoff guidance
- verification gates
- operator-visible next actions

### 2.2 What this harness is not

The native harness is not:

- a replacement for the existing plugin system
- a bundled copy of all Forge skills
- a full virtual software company workflow engine in v1
- a host-agnostic marketplace feature

---

## 3. Design Summary

Embed three first-class capabilities:

### 3.1 Phase/state machine

Add a Forge-specific state model under `runtime` that tracks:

- active mode
- current phase
- phase readiness
- artifact freshness
- blocker counts
- next recommended action

### 3.2 Artifact-aware prompt and resume

Extend prompt/session loading so the runtime can discover and surface:

- `.forge/spec.md`
- `.forge/design/*`
- `.forge/contracts/*`
- `.forge/code-rules.md`
- harness runtime state

This lets the CLI resume with phase context instead of only conversation history.

### 3.3 Verification gate

Before phase advancement, or before starting a gated command path, the runtime
checks whether required artifacts and evidence exist.

This should be visible and deterministic, not a best-effort hint.

---

## 4. Why Native, Not Plugin

The target repo already has the right seams for native embedding:

- runtime config and `.forge` discovery already exist
- prompt assembly already reads project-local instruction surfaces
- runtime tools can be injected separately from plugin tools
- task, worker, team, and policy primitives already exist

Relevant seams:

- [session.rs](/Users/joe/2026/claw-code-main/rust/crates/rusty-claude-cli/src/session.rs:1777)
- [lib.rs](/Users/joe/2026/claw-code-main/rust/crates/tools/src/lib.rs:138)
- [config.rs](/Users/joe/2026/claw-code-main/rust/crates/runtime/src/config.rs:220)
- [prompt.rs](/Users/joe/2026/claw-code-main/rust/crates/runtime/src/prompt.rs:200)
- [prompt.rs](/Users/joe/2026/claw-code-main/rust/crates/runtime/src/prompt.rs:409)
- [task_registry.rs](/Users/joe/2026/claw-code-main/rust/crates/runtime/src/task_registry.rs:1)
- [worker_boot.rs](/Users/joe/2026/claw-code-main/rust/crates/runtime/src/worker_boot.rs:1)
- [team_tools.rs](/Users/joe/2026/claw-code-main/rust/crates/tools/src/team_tools.rs:1)

Because these seams are already in core runtime flow, embedding the harness there
is lower-risk and more coherent than forcing Forge through the plugin lifecycle.

---

## 5. Namespace Strategy

The Rust repo already uses `.forge`.
To avoid collisions between existing config/session files and the new harness
artifacts, the native harness should live under a dedicated subtree:

```text
.forge/
  settings.json
  settings.local.json
  sessions/
  harness/
    state.json
    runtime.json
    events.jsonl
    spec.md
    code-rules.md
    design/
    contracts/
    evidence/
    holes/
```

Rule:

- existing `.forge/settings*` and `.forge/sessions/*` stay where they are
- harness-owned workflow artifacts live under `.forge/harness/`

This prevents control-plane state from colliding with user config or session files.

---

## 6. Package And Module Plan

## 6.1 New runtime modules

Add a bounded harness subsystem under `crates/runtime/src/`:

```text
crates/runtime/src/
  harness/
    mod.rs
    state.rs
    phases.rs
    gates.rs
    artifacts.rs
    next_action.rs
    status.rs
```

Responsibilities:

- `state.rs`: state schema, read/write, normalization, migrations
- `phases.rs`: build/repair/express phase graph and transition validation
- `gates.rs`: artifact/evidence gate evaluation
- `artifacts.rs`: discover harness files and freshness
- `next_action.rs`: derive operator-facing next step
- `status.rs`: summarized harness status for CLI and tool surfaces

## 6.2 Runtime integration points

Integrate harness state into:

- `ConfigLoader` path discovery only if harness-level local config is later needed
- `ProjectContext::discover*` so harness artifacts can be selectively included
- status/report rendering
- session resume and startup bootstrapping

## 6.3 Tools integration

Add native runtime tools, not plugin tools, for harness control:

- `HarnessStatus`
- `HarnessPhaseGet`
- `HarnessPhaseAdvance`
- `HarnessArtifactList`
- `HarnessHoleReport`

These should be registered through the existing runtime tool path, not the plugin registry.

## 6.4 CLI integration

Add lightweight slash commands or command aliases only after the runtime layer exists:

- `/harness`
- `/phase`
- `/handoff`

V1 can ship with status-only read surfaces before write-capable mutators.

---

## 7. State Model

Suggested v1 state file:

Path:
- `.forge/harness/state.json`

Schema:

```json
{
  "version": "0.1.0",
  "mode": "build",
  "phase": "design",
  "phase_index": 2,
  "status": "active",
  "design_approved": false,
  "artifact_versions": {
    "spec": 1,
    "architecture": 0,
    "code_rules": 0,
    "contracts": 0
  },
  "staleness": {
    "spec": false,
    "design": false,
    "contracts": false
  },
  "blockers": {
    "customer": 0,
    "internal": 0
  },
  "next_action": {
    "kind": "phase_gate",
    "summary": "Create architecture and contracts before develop",
    "target": "design"
  }
}
```

Suggested runtime sidecar:

Path:
- `.forge/harness/runtime.json`

Purpose:

- transient lane summaries
- active workers/tasks
- degraded-mode reporting
- most recent verification results

Append-only log:

Path:
- `.forge/harness/events.jsonl`

Purpose:

- phase changes
- gate failures
- handoff notes
- verification outcomes

---

## 8. Phase Graph

V1 should support the same logical phase families Forge already uses, but with
reduced operational scope:

### Build

- `intake`
- `discovery`
- `design`
- `develop`
- `qa`
- `delivery`

### Repair

- `intake`
- `reproduce`
- `isolate`
- `fix`
- `verify`
- `delivery`

### Express

- `plan`
- `build`
- `ship`

V1 reduction:

- security and lessons promotion can remain external or manual
- the runtime only needs to understand phase identity, order, and gates

---

## 9. Gate Model

V1 gates should be artifact-first.

Examples:

- `design` cannot advance to `develop` without architecture, code rules, and contracts
- `repair/isolate` cannot advance to `fix` without RCA or equivalent evidence
- `delivery` should require at least one verification record

Gate result contract:

```text
allowed | warning | blocked
```

Every gate evaluation should return:

- evaluated phase
- missing artifacts
- stale artifacts
- evidence summary
- operator-facing reason

This feeds both CLI rendering and future automation.

---

## 10. Handoff Model

The harness should support lightweight handoff packets rather than trying to
replicate the whole multi-agent company workflow in v1.

Suggested file:

- `.forge/harness/handoff.json`

Contents:

- current phase
- current objective
- required artifacts
- unresolved blockers
- recommended next owner
- implementation questions

This lets the runtime generate:

- better resume summaries
- clearer next-step status
- bounded worker startup briefs

---

## 11. Prompt Integration

Prompt loading should remain conservative.

Do not inject the entire harness directory into every prompt.

Instead:

- always include current harness state summary
- include only phase-relevant artifacts
- keep full design/contracts/spec as on-demand or gated context

Recommended rule:

- T0: state summary, next action, current phase
- T1: current phase artifact set
- T2: neighboring artifacts on demand
- T3: everything else excluded

This matches the existing Forge context-budget principle and avoids prompt dilution.

---

## 12. Verification Integration

The existing Rust repo already has task, worker, and policy primitives.
The harness should consume their outputs rather than replacing them.

Mapping:

- `TaskRegistry` remains execution tracking
- `WorkerRegistry` remains worker boot/lifecycle tracking
- `PolicyEngine` remains lane policy evaluator
- native harness becomes the durable workflow authority above them

In other words:

```text
worker/task/team primitives = execution plane
harness state/gates/artifacts = control plane
```

This keeps responsibilities clean.

---

## 13. Recommended V1 Scope

Ship only the following in v1:

1. `.forge/harness/` state and runtime persistence
2. phase normalization and gate evaluation
3. harness-backed status rendering
4. phase-aware resume and handoff summary
5. runtime-native read tools for status and artifacts

That is enough to make the binary meaningfully more Forge-like without overcommitting.

---

## 14. Explicit Non-Goals

Do not include these in v1:

- plugin marketplace integration
- bundled SKILL markdown execution engine inside the binary
- full automatic team-company orchestration
- full lesson lifecycle promotion
- cross-host parity matrix generation
- replacing plugin lifecycle state with harness state

These are valid later phases, but they are not the shortest path to a useful core harness.

---

## 15. Migration Plan

### Phase A: durable state

- add `.forge/harness/` paths
- implement state/runtime/event schemas
- expose read-only harness status

### Phase B: phase and gates

- add phase graph
- add gate evaluator
- surface blocked/warned states in CLI status

### Phase C: handoff-aware resume

- add handoff packet
- feed phase and next-action summaries into resume/startup

### Phase D: runtime tools

- add read tools first
- add controlled write tools only after gate semantics stabilize

---

## 16. Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `.forge` namespace collision | High | isolate under `.forge/harness/` |
| Prompt overload from large artifacts | Medium | inject summaries first, phase-local artifacts only |
| Confusion between plugin state and harness state | Medium | keep separate modules and status surfaces |
| Overbuilding into full Forge company workflow | High | freeze v1 to state, gates, handoff, status |
| Memory-only registries disagree with durable harness state | High | make harness state authoritative for workflow, registries authoritative for live execution |

---

## 17. Acceptance Criteria

This design is successful if the Rust repo can do all of the following natively:

- persist a structured harness state across sessions
- show the current phase and next action in a canonical status surface
- refuse or warn on invalid phase advancement based on missing artifacts
- resume work with a handoff summary instead of raw session context only
- expose these capabilities without routing through the plugin system

---

## 18. Implementation Handoff

Recommended first write scope in the target repo:

1. `crates/runtime/src/harness/*`
2. `crates/runtime/src/lib.rs`
3. `crates/runtime/src/prompt.rs`
4. `crates/rusty-claude-cli/src/session.rs`
5. `crates/rusty-claude-cli/src/main.rs`
6. `crates/tools/src/lib.rs`
7. new harness tool module under `crates/tools/src/`

Recommended first milestone:

`read-only harness status + phase gate evaluator`

That milestone gives immediate product value with the lowest architectural risk.
