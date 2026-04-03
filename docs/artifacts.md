# Forge Artifact Structure

Forge persists all project state in a `.forge/` directory at the project root. This directory is
the single source of truth for project progress, decisions, and work tracking.

## Directory layout

```
.forge/
├── state.json              # Current phase, mode, tier, progress
├── runtime.json            # Lane graph, ownership, blockers, handoff notes
├── spec.md                 # Requirements (Phase 1 output)
├── code-rules.md           # Code conventions enforced on every PR (Phase 2)
│
├── design/                 # Phase 2 outputs
│   ├── architecture.md     # System architecture, tech stack, key decisions
│   ├── components.md       # UI component definitions (if applicable)
│   └── tokens.json         # Design tokens (if applicable)
│
├── contracts/              # Interface contracts (Phase 2)
│   └── *.ts                # TypeScript interface stubs for module boundaries
│
├── tasks/                  # Work unit definitions (Phase 3)
│   └── {lane-name}.md      # One file per lane: scope, acceptance criteria, dependencies
│
├── holes/                  # Issue tracker (Phase 4+)
│   └── {issue-id}.md       # One file per issue: severity, description, attempts, status
│
├── evidence/               # Fact-checker verification results
│   └── *.md                # One file per verified claim
│
├── worktrees/              # Git worktree directories (Phase 3, transient)
│   └── {lane-name}/        # Isolated working copy per lane
│
├── checkpoints/            # Context snapshots for session continuity
│   └── {phase}-{timestamp}.md
│
├── delivery-report/        # Final delivery (Phase 6)
│   ├── report.md           # Spec coverage, test results, known issues
│   ├── api-docs.md         # API documentation (if applicable)
│   ├── component-docs.md   # Component documentation (if applicable)
│   └── deploy-guide.md     # Deployment instructions
│
└── knowledge/              # Project-specific knowledge base
    └── *.md                # Decisions, trade-offs, context that doesn't fit elsewhere
```

## Artifact lifecycle

| Artifact         | Created at | Updated at     | Used by                    |
|------------------|------------|----------------|----------------------------|
| state.json       | Phase 0    | Every phase    | continue, status, all skills|
| runtime.json     | Phase 3    | Phase 3–6      | continue, status, develop, fix |
| spec.md          | Phase 1    | Phase 1 (amendments rare) | All phases after 1   |
| code-rules.md    | Phase 2    | Phase 2        | develop, fix (enforcement) |
| design/          | Phase 2    | Phase 2        | develop (reference)        |
| contracts/       | Phase 2    | Phase 2–3      | develop, fix (guard)       |
| tasks/           | Phase 3    | Phase 3        | develop (scope)            |
| holes/           | Phase 4    | Phase 4–5      | fix, status                |
| evidence/        | Phase 2+   | Any phase      | fact-checker               |
| worktrees/       | Phase 3    | Cleaned up after Phase 3 | develop         |
| checkpoints/     | Any phase  | Before compaction | continue               |
| delivery-report/ | Phase 6    | Phase 6        | deliver                    |

## Key files explained

### state.json

The minimal coordination file. Every Forge command reads this first.

```json
{
  "version": "0.1.0",
  "project": "my-saas-app",
  "phase": 3,
  "phase_id": "develop",
  "phase_name": "develop",
  "tier": "medium",
  "mode": "build",
  "status": "in_progress",
  "spec_approved": true,
  "design_approved": true
}
```

### runtime.json

Tracks parallel work during development and fix phases. Each lane has:
- **status**: pending → ready → in_progress → blocked → in_review → merged → done
- **owner_role**: which agent role owns the lane
- **worktree_path**: isolated git worktree location
- **dependencies**: upstream lanes that must complete first
- **handoff_notes**: ordered status updates for session continuity

### holes/{issue-id}.md

Each discovered issue gets its own file with:
- Severity (blocker / major / minor)
- Description and reproduction steps
- Attempt count and history (max 3 before escalation)
- Current status

### contracts/*.ts

TypeScript interface stubs defining module boundaries. The contract guard hook
(`scripts/contract-guard.mjs`) verifies written code matches these interfaces.

## Artifact consistency rules

`forge status` and `forge continue` read artifacts consistently per phase:

| Phase         | Reads                                       | Graceful if missing             |
|---------------|---------------------------------------------|---------------------------------|
| 0–1 (intake/discovery) | state.json                        | runtime.json (skip lanes)       |
| 2 (design)    | state.json, spec.md                         | runtime.json                    |
| 3 (develop)   | state.json, spec.md, code-rules.md, design/, contracts/, runtime.json | design/ (warn) |
| 4–5 (QA/fix)  | state.json, spec.md, holes/, runtime.json   | delivery-report/                |
| 6 (delivery)  | state.json, spec.md, holes/, delivery-report/ | runtime.json                 |

**Repair mode** adds:

| Phase         | Required artifact before advancing           |
|---------------|----------------------------------------------|
| reproduce     | (none — this is where evidence starts)       |
| isolate       | `.forge/evidence/` must exist                |
| fix           | `.forge/evidence/rca-*.md` must exist        |
| regress       | (none — this is where regression check starts)|
| verify        | `.forge/holes/` must exist                   |
| delivery      | (none — verify gate passed)                  |

If a required artifact is missing, the phase skill should warn clearly
("Missing .forge/evidence/ — run the reproduce phase first") rather than
silently proceeding.

## What is NOT in .forge/

- **Source code** — lives in the normal project tree, not inside `.forge/`
- **Git history** — standard git, with `forge/*` tags marking phase completions
- **Build output** — standard build directories
- **Dependencies** — standard package manager files

`.forge/` is metadata about the process, not the product.
