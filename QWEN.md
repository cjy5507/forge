# Forge for Qwen Code

Use Forge as the repository's orchestration layer.

- Treat `.forge/` as the source of truth for plan, runtime, and next action.
- Prefer explicit Forge requests such as `forge continue`, `forge info`, and `forge analyze`.
- Native Qwen support in this repository includes `skills/`, `agents/`, and `/forge:*` Markdown commands.
- Do not assume Claude-style hook lifecycle parity. Qwen support currently focuses on explicit commands, skills, agents, and shared `.forge` state.

When Forge artifacts already exist, continue from them instead of inventing a separate workflow.
