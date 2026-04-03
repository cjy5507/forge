# Forge Phase Structure

Forge runs projects through a sequence of phases. Each phase has a defined input, output, and gate
that must be satisfied before advancing. State is persisted in `.forge/` so work survives session breaks.

## Build mode

For new projects. Full pipeline from idea to delivery.

```
Phase 0  INTAKE        CEO evaluates request, routes to build mode
Phase 1  DISCOVERY     PM gathers requirements → spec.md
Phase 2  DESIGN        CTO + Designer produce architecture, contracts, code rules
Phase 3  DEVELOP       Lead splits work into lanes, devs work in isolated worktrees
Phase 4  QA            Functional, visual, contract, regression, edge-case testing
Phase 4.5 SECURITY     OWASP Top 10, secrets scan, auth/authz review
Phase 5  FIX           Blocker resolution loop (max 3 attempts per issue)
Phase 6  DELIVERY      Docs, delivery report, client review
```

### Phase gates

| Phase | Advances when                                          | Output written to          |
|-------|--------------------------------------------------------|----------------------------|
| 0     | CEO confirms scope is reasonable                       | `.forge/state.json`        |
| 1     | Spec has no critical ambiguity                         | `.forge/spec.md`           |
| 2     | CTO + Designer + Fact Checker confirm design           | `.forge/design/`, `.forge/contracts/`, `.forge/code-rules.md` |
| 3     | All required lanes merged, internally verified         | merged code, `.forge/runtime.json` |
| 4     | Testing complete, issues logged                        | `.forge/holes/`            |
| 4.5   | Security audit complete                                | `.forge/holes/`            |
| 5     | All blockers resolved (or escalated after 3 attempts)  | fixes merged               |
| 6     | CEO + QA + Security confirm delivery readiness         | `.forge/delivery-report/`  |

### Git tags

Each phase completion creates a tag: `forge/v1-{phase_name}` (e.g., `forge/v1-design`).
These enable rollback: "go back to design" → restore `forge/v1-design` → resume from Phase 2.

---

## Repair mode

For existing codebases that need diagnosis and fixing. Skips discovery and design.

```
Phase 0  INTAKE        CEO evaluates, generates minimal baseline artifacts from existing code
Phase 3* DIAGNOSE      Troubleshooter performs root cause analysis
Phase 5  FIX           Developer implements fix based on RCA
Phase 4  QA            Verify fix, check for regressions
Phase 6  DELIVERY      Docs update, delivery report
```

*Phase 3 in repair mode is diagnosis, not development.

### Repair intake generates

- Minimal `spec.md` — scope, constraints, known architecture (from reading existing code)
- `code-rules.md` — extracted from existing conventions
- Contract stubs in `.forge/contracts/` — from existing interfaces/types

These are lighter than build-mode artifacts but give the fix loop enough structure to work consistently.

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
| Develop  | Lead Dev         | Developers, Publisher         |
| QA       | QA Engineer      | —                             |
| Security | Security Reviewer| —                             |
| Fix      | Lead Dev         | Troubleshooter, Developers    |
| Delivery | CEO + Tech Writer| QA, Security (sign-off)       |

Roles are assigned per phase, not all active at once. Only the current phase's roles are loaded.
