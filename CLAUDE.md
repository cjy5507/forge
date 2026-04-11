# Forge

Forge is a virtual software company harness for Claude Code. It orchestrates
multi-agent workflows through phased pipelines (intake, discovery, design,
develop, QA, deliver) with tier-based guardrails (off/light/medium/full).

## Environment Variables

- `FORGE_TIER` — Override active tier (off/light/medium/full)
- `FORGE_LLM_TIMEOUT_MS` — LLM call timeout for task-decomposer (default: 12000)
- `FORGE_STALE_THRESHOLD_MS` — Session wall-clock staleness threshold for SessionStart restore tier (default: 24h). Compares against `state.stats.last_finished_at` to choose fresh/warm/stale context loading; unrelated to artifact dependencies.
