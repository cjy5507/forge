# Development Review Pipeline

Use this reference when you need the full review and consistency rules.

## Tier 1: Automated

- Lint passes
- Typecheck passes
- Tests pass
- Build succeeds
- No secrets in diff

## Tier 2: Lead review

- Matches `code-rules.md`
- Matches living standard set by earlier merges
- Stays inside task scope
- Implements required contracts

## Tier 3: CTO review

Use only when architecture risk exists:
- hidden coupling
- circular dependency
- scalability concern
- performance concern

## Worktree rule

Each module gets its own worktree. Rebase remaining worktrees after each merge.
Approved or merge-ready lanes are not "done later" work. Land them immediately before opening more implementation scope.
