# Forge

Forge is a harness-engineering plugin that turns an agent into a phase-gated virtual software company.

## What Forge does

- Routes work through build or repair mode
- Persists `.forge/` state across sessions
- Tracks active subagents and recent failures
- Guards code-writing when design prerequisites are missing
- Adapts automatically across light, medium, and full intervention tiers
- Uses role prompts for CEO, PM, CTO, QA, Security, and Troubleshooter workflows

## Plugin layout

- `.claude-plugin/plugin.json`: Claude-facing manifest
- `.codex-plugin/plugin.json`: Codex-facing manifest
- `.mcp.json`: shared MCP connections, including Context7
- `assets/`: marketplace icon, logo, and screenshots
- `hooks/hooks.json`: lifecycle guardrails
- `skills/`: phase and control skills
- `agents/`: specialist role prompts
- `templates/`: project outputs and evaluation templates

## Codex installation

Install Forge as a normal Codex plugin by placing the `forge/` directory in your plugin location
or by publishing it through your own marketplace. Forge should not assume any repo-specific
installation path.

## Installation

### Claude Code

If you publish Forge through a Claude Code marketplace, users can install it with the normal
Claude marketplace flow.

Typical flow:

```text
/plugin marketplace add <owner>/<marketplace-repo>
/plugin install forge@<marketplace-name>
```

If you distribute Forge directly, users can also place the plugin folder where Claude Code
expects plugins and install/import it through the client UI or plugin workflow.

### Codex

Forge ships with a `.codex-plugin/plugin.json` manifest.

Install it through the Codex host's plugin/import flow by pointing the host at the `forge/`
plugin directory or at a published marketplace entry that resolves to that directory.

Because Codex hosts may vary, Forge intentionally does not assume a fixed global path or
repo-local marketplace file.

### Local validation after install

Use prompts such as:

- `Build a forge harness for this project`
- `forge status`
- `forge resume`

## MCP note

Forge ships with Context7 configured in `.mcp.json`.

- Default URL: `https://mcp.context7.com/mcp`
- If your client requires auth, add `CONTEXT7_API_KEY` or switch to the OAuth endpoint supported by your MCP client.

## Suggested prompts

- `Build a harness for this repo with Forge`
- `Use forge to diagnose and fix this project`
- `forge status`
- `forge stats`
- `forge resume`
- `Run a Forge A/B evaluation for this task`

## Validation

Run the Forge hook smoke tests:

```bash
npm test -- forge/scripts/harness-hooks.test.mts
```

Render marketplace screenshots:

```bash
node forge/scripts/render-marketplace-assets.mjs
```

## Marketplace docs

- [Marketplace copy](./MARKETPLACE.md)
- [Release notes draft](./RELEASE_NOTES.md)
- [Publishing checklist](./PUBLISHING.md)
