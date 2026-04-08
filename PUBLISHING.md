# Forge Publishing Checklist

Use this checklist before submitting Forge to any public marketplace.

## Required

- Plugin manifest has no repo-local install assumptions
- No absolute filesystem paths appear in plugin docs, tests, or manifests
- `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `gemini-extension.json`, and `qwen-extension.json` agree on core metadata and versioning
- `.codex-plugin/hooks/hooks.json` points only to relative plugin files via the repository-root hook wrapper
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

### Verified by automated tests

- Claude, Codex, Gemini, and Qwen manifests parse as valid JSON
- `.codex-plugin/hooks/hooks.json` is valid JSON and routes through an existing root hook wrapper
- Asset references in the Codex manifest exist on disk
- Setup copy mode preserves the Gemini and Qwen extension roots
- Version sync keeps all shipped host manifests aligned to `package.json`
- MCP configuration is documented and optional auth requirements are noted
- Codex hook wrapper and underlying scripts are present and referenced correctly

### Pending live-environment verification

These have not been confirmed against a running plugin host and should be tested before treating a release as fully validated.

- Build mode works end-to-end in a real agent session
- Repair mode works end-to-end in a real agent session
- Stop guard does not trap the user in an infinite loop under real workloads
- Subagent lifecycle events populate runtime state in a real multi-agent run
- Failure guidance appears after tool failures in a real session
- Codex plugin host recognizes and loads the plugin from `.codex-plugin/plugin.json`
- Claude-started project resumes correctly from Codex with explicit `forge continue`, and the inverse path also works
- Gemini CLI installs or links the root extension and exposes `/forge:*` commands in a real host
- Qwen Code installs the root extension and exposes native commands, skills, and agents in a real host
- Context7 auth flow completes on a fresh install

## Do not ship if

- A file mentions a user-specific path or repo-local marketplace assumption
- Hooks depend on unavailable scripts
- Phase mapping is inconsistent
- Smoke tests fail
