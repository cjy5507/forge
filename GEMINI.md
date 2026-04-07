# Forge for Gemini CLI

Use Forge through explicit, shared-state flows.

- Treat `.forge/` as the source of truth for project state and next action.
- Prefer explicit Forge requests such as `forge continue`, `forge info`, and `forge analyze`.
- Use the bundled `/forge:continue`, `/forge:info`, and `/forge:analyze` custom commands when you want the extension to seed the prompt for you.
- Do not assume Claude-style hook lifecycle support. Gemini support is currently explicit-command and shared-runtime oriented.

When the repository already contains a Forge plan, continue from that plan instead of inventing a parallel workflow.
