# Contributing

Forge is a host-agnostic workflow harness with Claude-first automation and shared `.forge/`
runtime state. Keep changes small, reversible, and test-backed.

## Product bar

Forge is a deterministic harness OS for engineering teams. Core changes should
improve at least one of:

- determinism
- verifiability
- recoverability
- observability
- bounded host consistency

If a proposed change mainly adds breadth, convenience, or prompt surface area
without improving one of the above, it likely does not belong in Forge core.

## Local checks

Run these before opening a PR:

```bash
npm run lint
npm run typecheck
npm test
```

## Repo shape

- `skills/` contains workflow surfaces. Phase 3 planning uses `forge:plans`.
- `agents/` contains version-controlled agent prompts.
- `scripts/` contains the runtime, CLI entrypoints, and hook implementations.
- `.forge/contracts/` and `types/` define the durable state/runtime contracts.

## Adding or changing a skill

1. Add or update `skills/<name>/SKILL.md`.
2. If routing is phase-based or keyword-driven, update the relevant dispatcher logic and tests.
3. If the skill changes artifacts or runtime state, document those side effects in the skill body.
4. Prefer reusing existing `scripts/forge-lane-runtime.mjs` operations over inventing new ad hoc state writes.

## Adding or changing an agent

1. Add or update `agents/<name>.md`.
2. Keep the role narrow and verifiable.
3. If the agent introduces a new workflow assumption, add or update tests or docs that lock the behavior.

## Hook surfaces

- Runtime hook scripts live in `scripts/*.mjs`.
- `.codex-plugin/hooks/hooks.json` is the packaged Codex hook surface.
- `hooks/hooks.json` is the repository-root executable wrapper surface and must stay aligned with real guardrail behavior.
- `hooks/run-hook.mjs` is the host-neutral wrapper that forwards stdin/stdout to the real script implementation in `scripts/`.
- Do not claim host hook parity that the target host cannot actually provide.

## Cleanup rules

- Prefer deletion over addition.
- Lock behavior with tests before removing or consolidating workflow surfaces.
- Do not add dependencies without a strong reason.
- Keep docs honest about degraded host support.
