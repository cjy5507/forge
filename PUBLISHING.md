# Forge Publishing Checklist

Use this checklist before submitting Forge to any public marketplace.

## Required

- Plugin manifest has no repo-local install assumptions
- No absolute filesystem paths appear in plugin docs, tests, or manifests
- `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` agree on core metadata
- `hooks/hooks.json` points only to relative plugin files
- `README.md` explains what Forge does and how to validate it
- `PRIVACY.md` and `TERMS.md` exist for marketplace metadata
- `npx --yes vitest run scripts/*.test.mts` passes

## Recommended

- Add plugin assets under `./assets/`
- Add a logo and at least one screenshot for marketplace cards
- Add a short demo or installation GIF to the repository README
- Publish a changelog entry for the release

Current Forge asset set:

- `assets/forge-icon.svg`
- `assets/forge-logo.svg`
- `assets/screenshot-overview.png`
- `assets/screenshot-console.png`

## Release sanity checks

- Build mode works
- Repair mode works
- Stop guard does not trap the user in an infinite loop
- Subagent lifecycle events populate runtime state
- Failure guidance is added after tool failures
- MCP configuration is documented and optional auth requirements are clear

## Do not ship if

- A file mentions a user-specific path or repo-local marketplace assumption
- Hooks depend on unavailable scripts
- Phase mapping is inconsistent
- Smoke tests fail
