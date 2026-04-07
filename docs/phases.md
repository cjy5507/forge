# Forge Phase Structure

Forge runs projects through a sequence of phases. Each phase has a defined input, output, and gate
that must be satisfied before advancing. State is persisted in `.forge/` so work survives session breaks.

## Build mode

For new projects. Full pipeline from idea to delivery.

```
Phase 0  INTAKE        CEO evaluates request, routes to build mode
Phase 1  DISCOVERY     PM gathers requirements → spec.md
Phase 2  DESIGN        CTO + Designer produce architecture, contracts, code rules
Phase 3  PLAN          Lead turns approved design into lane graph + task briefs
Phase 4  DEVELOP       Devs execute the approved plan in isolated worktrees
Phase 5  QA            Functional, visual, contract, regression, edge-case testing
Phase 6  SECURITY      OWASP Top 10, secrets scan, auth/authz review
Phase 7  FIX           Blocker resolution loop (max 3 attempts per issue)
Phase 8  DELIVERY      Docs, delivery report, client review
```

### Phase gates

| Phase | Advances when                                          | Output written to          |
|-------|--------------------------------------------------------|----------------------------|
| 0     | CEO confirms scope is reasonable                       | `.forge/state.json`        |
| 1     | Spec has no critical ambiguity                         | `.forge/spec.md`           |
| 2     | CTO + Designer + Fact Checker confirm design           | `.forge/design/`, `.forge/contracts/`, `.forge/code-rules.md` |
| 3     | Lead confirms the execution plan is reviewable         | `.forge/plan.md`, `.forge/tasks/`, `.forge/runtime.json` |
| 4     | All required lanes merged, internally verified         | merged code                |
| 5     | Testing complete, issues logged                        | `.forge/holes/`            |
| 6     | Security audit complete                                | `.forge/holes/`            |
| 7     | All blockers resolved (or escalated after 3 attempts)  | fixes merged               |
| 8     | CEO + QA + Security confirm delivery readiness         | `.forge/delivery-report/`  |

### Git tags

Each phase completion creates a tag: `forge/v1-{phase_name}` (e.g., `forge/v1-design`, `forge/v1-plan`).
These enable rollback: "go back to design" → restore `forge/v1-design` → continue from Phase 2.

---

## Repair mode

For existing codebases that need diagnosis and fixing. Skips discovery and design.

```
Phase 0  INTAKE       CEO evaluates, generates baseline artifacts from existing code
Phase 1  REPRODUCE    Confirm the bug, capture reproduction steps and evidence
Phase 2  ISOLATE      Troubleshooter performs root cause analysis, narrows to module
Phase 3  FIX          Developer implements targeted fix in isolated worktree
Phase 4  REGRESS      Verify fix doesn't break adjacent functionality
Phase 5  VERIFY       Full QA pass on the fix
Phase 6  DELIVERY     Docs update, delivery report
```

### Repair is not "just fix it"

The repair pipeline enforces a discipline that prevents blind patches:

| Phase     | Gate                                                    | Output                    |
|-----------|---------------------------------------------------------|---------------------------|
| Intake    | Existing codebase readable, baseline artifacts created  | `spec.md`, `code-rules.md`, `contracts/` |
| Reproduce | Bug confirmed with steps, not just described            | `.forge/evidence/`        |
| Isolate   | Root cause identified, not just symptoms                | `.forge/evidence/rca-*.md` |
| Fix       | Fix scoped to root cause, not shotgun patch             | Fix branch in worktree    |
| Regress   | Adjacent features still work                            | `.forge/holes/`           |
| Verify    | Full QA confirmation                                    | `.forge/holes/`           |
| Delivery  | Docs updated, report compiled                           | `.forge/delivery-report/` |

### Repair intake generates

- Minimal `spec.md` — scope, constraints, known architecture (from reading existing code)
- `code-rules.md` — extracted from existing conventions
- Contract stubs in `.forge/contracts/` — from existing interfaces/types

These are lighter than build-mode artifacts but give the repair loop enough structure to work consistently.

---

## Express mode

A collapsed pipeline for medium-complexity tasks. Three phases instead of seven:

```
plan   → compressed discovery + design
build  → development with inline QA
ship   → compressed fix + delivery
```

Express mode uses the same `.forge/` state structure but fewer artifacts.

---

## Phase ownership

| Phase    | Primary role     | Supporting roles              |
|----------|------------------|-------------------------------|
| Intake   | CEO              | —                             |
| Discovery| PM               | Researcher (on demand)        |
| Design   | CTO + Designer   | Fact Checker                  |
| Plan     | Lead Dev         | CTO, Analyst                  |
| Develop  | Lead Dev         | Developers, Publisher         |
| QA       | QA Engineer      | —                             |
| Security | Security Reviewer| —                             |
| Fix      | Lead Dev         | Troubleshooter, Developers    |
| Delivery | CEO + Tech Writer| QA, Security (sign-off)       |

Roles are assigned per phase, not all active at once. Only the current phase's roles are loaded.
