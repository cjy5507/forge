# Forge Marketplace Copy

## Name

Forge

## Tagline

Structure, ownership, and continuable state for coding agents.

## Short description

Forge gives long-running agent work a persistent project structure that survives session breaks, tracks decisions, and resumes without re-explaining context.

## Long description

Forge manages a `.forge/` directory that tracks your project through structured phases — from requirements through design, development, QA, and delivery.

Each phase has explicit gates. Work doesn't advance until prerequisites are met. Decisions, specs, and code rules are written to files so they persist across sessions and context resets.

When you come back after a break, `forge continue` reads the project state and picks up from the most actionable point — no re-prompting needed.

For new projects, Forge runs the full pipeline: intake, discovery, design, develop, QA, security review, delivery. For existing codebases that need fixing, it skips to diagnosis, fix, QA, and ship.

Parallel work is tracked in lanes with assigned ownership, isolated worktrees, and handoff notes. Nothing is orphaned when sessions end.

## Suggested starter prompts

- forge — start a new project or fix an existing one
- forge continue — resume where you left off
- forge status — see current phase, blockers, and next steps

## Categories

- Developer Tools
- AI Workflow
- Project Management

## Capabilities

- Session continuity
- Phase-gated workflow
- Ownership tracking
- Build and repair modes
- Artifact persistence
