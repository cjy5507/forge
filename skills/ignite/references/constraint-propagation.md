# Constraint Propagation Protocol

When an upstream artifact changes, all downstream artifacts that depend on it become
**stale** and must be reviewed or regenerated before work continues.

## Artifact Dependency Graph

```
spec.md
├── architecture.md
├── components.md
├── contracts/*.ts
├── code-rules.md
└── tokens.json

architecture.md
├── contracts/*.ts
├── code-rules.md
├── tasks/*.md
└── runtime.json (lane graph)

contracts/*.ts
├── tasks/*.md (scope references contracts)
└── implementation code (must match contract)

components.md
├── tokens.json
└── implementation code (UI modules)

code-rules.md
└── implementation code (all modules)
```

## Staleness Detection

### When artifacts change
Every time a Forge artifact is written or edited, record a version bump in `state.json`:

```json
{
  "artifact_versions": {
    "spec": { "version": 3, "updated_at": "2026-04-04T10:30:00Z", "changed_by": "pm" },
    "architecture": { "version": 2, "updated_at": "2026-04-04T11:00:00Z", "changed_by": "cto" },
    "contracts": { "version": 2, "updated_at": "2026-04-04T11:00:00Z", "changed_by": "cto" },
    "components": { "version": 1, "updated_at": "2026-04-04T11:00:00Z", "changed_by": "designer" },
    "code_rules": { "version": 1, "updated_at": "2026-04-04T11:00:00Z", "changed_by": "cto" },
    "tokens": { "version": 1, "updated_at": "2026-04-04T11:00:00Z", "changed_by": "designer" }
  },
  "staleness": {}
}
```

### Propagation rules
When artifact X is updated, mark all downstream artifacts as stale:

| Changed Artifact | Stale Downstream |
|------------------|------------------|
| spec.md | architecture, components, contracts, code_rules, tokens |
| architecture.md | contracts, code_rules, tasks, runtime |
| contracts/*.ts | tasks, active implementation lanes |
| components.md | tokens, active UI implementation lanes |
| code-rules.md | active implementation lanes |
| tokens.json | active UI implementation lanes |

Record staleness in `state.json`:

```json
{
  "staleness": {
    "contracts": {
      "stale_since": "2026-04-04T12:00:00Z",
      "cause": "spec.md updated (v2→v3): added payment feature",
      "impact": "New API types needed for payment flow",
      "resolution": "CTO must update contracts to include payment types"
    }
  }
}
```

## Phase Entry Staleness Check

Every phase skill MUST check for staleness on entry:

```
On phase entry:
1. Read state.json.staleness
2. If any artifact relevant to THIS phase is stale:
   a. BLOCK — do not proceed with stale inputs
   b. Route to the team that owns the stale artifact
   c. That team updates the artifact and clears staleness
   d. Resume the blocked phase
```

### Which phases check which artifacts

| Phase | Checks staleness of |
|-------|---------------------|
| Design (2) | spec |
| Develop (3) | architecture, contracts, code_rules, components, tokens |
| QA (4) | spec, contracts (to verify against) |
| Fix (6) | contracts, code_rules (to fix against) |

## Mid-Phase Changes

Sometimes a change happens DURING a phase (e.g., client clarifies spec during design):

1. The changing team updates the artifact AND bumps its version
2. Staleness propagation fires immediately
3. CEO evaluates impact:
   - **Minor** (additive, non-breaking): note it, affected teams absorb on next review
   - **Major** (breaking, removes/changes existing): HALT affected work, update downstream first
4. For active implementation lanes (Phase 3):
   - Check if the stale artifact affects any in-progress lane
   - If yes: mark lane as `blocked` in runtime with reason "upstream artifact changed"
   - Lead Dev coordinates: absorb change vs. restart lane

## Clearing Staleness

An artifact's staleness is cleared when:
1. The owning team reviews the upstream change
2. The owning team updates their artifact to reflect the change
3. The owning team bumps the artifact version
4. The staleness entry is removed from state.json

## Rollback Interaction

When the client requests a rollback (e.g., to forge/v1-design):
1. All artifacts downstream of the rollback point are marked stale
2. Their versions are reset to the tagged versions
3. Work resumes from the rollback phase with clean staleness state

## Express Mode

Express mode uses a simplified version:
- Only tracks spec and code_rules staleness
- Mid-phase changes are absorbed inline (no formal halt)
- Staleness is noted but doesn't block — it generates a warning
