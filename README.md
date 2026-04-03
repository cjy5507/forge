# Forge

**Forge gives coding agents structure, ownership, and continuable state.**

Most agent tools optimize for speed — more agents, more parallel calls, faster output.
Forge optimizes for *not losing your place*. It tracks which phase you're in, who owns what,
and what was decided — so long-running work survives interruptions, session breaks, and context resets.

### When Forge fits

- Work that spans multiple sessions or days
- Tasks that need to pause and resume without re-explaining context
- Projects where you need an audit trail of decisions and phases
- Parallel work where ownership and merge order matter
- Build or repair flows that benefit from structured gates (spec → design → dev → QA → ship)

### When you don't need Forge

- One-shot tasks that finish in a single prompt
- Quick fixes where overhead isn't worth it
- Exploration or research without a delivery target

## Quick Start

Choose one install shape:

### Global install

Use one shared Forge install on your machine, then point Claude Code or your Codex host at the
generated plugin root.

One-line bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/cjy5507/forge/main/scripts/bootstrap-install.mjs | node --input-type=module - --scope global --force
```

```bash
git clone https://github.com/cjy5507/forge.git "$HOME/.forge/src/forge"
node "$HOME/.forge/src/forge/scripts/setup-plugin.mjs" --scope global --force
```

This prepares the plugin at `~/.forge/plugins/forge`.

### Project-local install

Install Forge only for the current repository.

One-line bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/cjy5507/forge/main/scripts/bootstrap-install.mjs | node --input-type=module - --scope project --project-root "$PWD" --force
```

```bash
git clone https://github.com/cjy5507/forge.git .forge/vendor/forge
node .forge/vendor/forge/scripts/setup-plugin.mjs --scope project --project-root "$PWD" --force
```

This prepares the plugin at `./.forge/plugins/forge`.

### Copy mode instead of symlink mode

The setup script uses symlinks by default so updating the cloned Forge repo updates the installed
plugin too. If your environment requires a standalone copy, add `--mode copy`.

```bash
curl -fsSL https://raw.githubusercontent.com/cjy5507/forge/main/scripts/bootstrap-install.mjs | node --input-type=module - --scope global --mode copy --force
```

```bash
node "$HOME/.forge/src/forge/scripts/setup-plugin.mjs" --scope global --mode copy --force
```

The bootstrap installer clones Forge into a reusable checkout first, then runs
`scripts/setup-plugin.mjs` for the selected scope.

## What Forge does

Forge manages a `.forge/` directory that persists your project's state across sessions:

- **Phase gates** — work flows through intake → discovery → design → develop → QA → delivery, each with explicit entry/exit criteria
- **Continuable state** — `forge continue` picks up where you left off, loading only the context the current phase needs
- **Ownership tracking** — each task lane has an assigned role, worktree, and handoff notes so nothing is orphaned
- **Build and repair modes** — new projects get the full pipeline; existing codebases skip to diagnosis → fix → QA → ship
- **Artifact trail** — specs, contracts, code rules, and decisions are written to files, not lost in chat history
- **Adaptive tiers** — light for simple work, medium for standard, full for high-stakes projects

## Plugin layout

- `.claude-plugin/plugin.json`: Claude-facing manifest
- `.codex-plugin/plugin.json`: Codex-facing manifest
- `.mcp.json`: shared MCP connections, including Context7
- `assets/`: marketplace icon, logo, and screenshots
- `hooks/hooks.json`: lifecycle guardrails
- `skills/`: phase and control skills
- `agents/`: specialist role prompts
- `templates/`: project outputs and evaluation templates

## Installation

Forge is distributed as a single plugin package.

The plugin root is this repository root, not `.claude-plugin/` or `.codex-plugin/` by themselves.
Your plugin host should be pointed at the folder that contains:

- `.claude-plugin/plugin.json`
- `.codex-plugin/plugin.json`
- `hooks/`
- `scripts/`
- `skills/`

### Get the plugin files

Clone the repository:

```bash
git clone https://github.com/cjy5507/forge.git
cd forge
```

Or download the repository as a ZIP from GitHub and extract it.

After that, use the extracted `forge/` folder as the plugin root in your client.

To create a reusable install target automatically, run `scripts/setup-plugin.mjs` with either
`--scope global` or `--scope project`.

### Claude Code

Forge now ships both a Claude plugin manifest and a Claude marketplace manifest.

Marketplace install from GitHub:

```text
/plugin marketplace add cjy5507/forge
/plugin install forge@forge
```

If your git client prefers HTTPS:

```text
/plugin marketplace add https://github.com/cjy5507/forge.git
/plugin install forge@forge
```

You can also install Forge directly from the repository root folder that contains
`.claude-plugin/plugin.json`.

Do not point Claude Code at `.claude-plugin/` alone. The plugin root is the repository folder
that also contains `skills/`, `scripts/`, `.mcp.json`, and the rest of the shipped assets.

### Codex

If you are setting up Codex itself on a new machine, install the CLI first, similar to the
`oh-my-codex` setup flow:

```bash
npm install -g @openai/codex
```

Forge ships with a `.codex-plugin/plugin.json` manifest for Codex hosts that support plugin or
import flows. Point the host at the repository root folder that contains `.codex-plugin/plugin.json`.

Recommended Forge roots for Codex:

```text
~/.forge/plugins/forge
./.forge/plugins/forge
```

Do not point Codex at `.codex-plugin/` alone. The manifest expects the rest of the plugin files
to be available through relative paths from the plugin root.

Because Codex hosts vary, Forge intentionally does not assume one marketplace command until the
exact host flow is confirmed.

### Local validation after install

Try prompts such as:

- `Start a Forge harness for this project.`
- `Show Forge status and resume the current run.`
- `Use Forge to diagnose and fix this repo.`
- `forge status`
- `forge resume`

## MCP note

Forge ships with Context7 configured in `.mcp.json`.

- Default URL: `https://mcp.context7.com/mcp`
- If your client requires auth, add `CONTEXT7_API_KEY` or switch to the OAuth endpoint supported by your MCP client.

## Suggested prompts

- `Start a Forge harness for this project.`
- `Show Forge status and resume the current run.`
- `Use Forge to diagnose and fix this repo.`
- `forge status`
- `forge stats`
- `forge resume`
- `Run a Forge A/B evaluation for this task`

## Validation

Run the Forge hook smoke tests:

```bash
npx --yes vitest run scripts/*.test.mts
```

Render marketplace screenshots:

```bash
node scripts/render-marketplace-assets.mjs
```

## Marketplace docs

- [Marketplace copy](./MARKETPLACE.md)
- [Release notes draft](./RELEASE_NOTES.md)
- [Publishing checklist](./PUBLISHING.md)
