# Forge Release Notes Draft

## v0.1.5

Maintenance and consistency release.

### Highlights

- Removed model hardcoding from all agent prompts; model selection is now left to the host
- Restored Context7 MCP wiring after it was dropped in a prior cleanup pass
- All 139 automated tests pass
- Host support table added to README (Claude Code confirmed; Codex pending live verification)
- Phase numbering made consistent across agent prompts and harness docs (if phase-numbering lane merged)
- Harness prompt DRY refactor: shared boilerplate extracted to reduce duplication (if DRY lane merged)

### Notes

- No behavioral changes to Forge workflows. This release cleans up configuration drift.
- Codex plugin host support is listed as planned in the README; it has not been verified in a live Codex environment.

## v0.1.2

Marketplace update detection release.

### Highlights

- Bumped package, plugin, and marketplace manifest versions to `0.1.2`
- Added deeper runtime re-entry verification coverage, including customer-review to internal-fix smoke coverage

### Notes

- Claude `/plugin` update flows use manifest version metadata, so this release is intended to make the latest published changes discoverable.

## v0.1.1

Claude marketplace hook hotfix release.

### Highlights

- Fixed Claude runtime hook paths to use `${CLAUDE_PLUGIN_ROOT}` inside installed plugin copies
- Added Claude marketplace manifest for `/plugin marketplace add` flow
- Updated Claude install documentation to match validated marketplace behavior

### Notes

- Existing Claude installs on v0.1.0 may need an update or reinstall to pick up the fixed hook commands.

## v0.1.0

Initial public marketplace-ready release.

### Highlights

- Added phase-gated build and repair workflows
- Added adaptive light / medium / full harness tiers
- Added runtime stop guard and subagent lifecycle tracking
- Added tool-failure recovery guidance
- Added Codex-facing plugin manifest metadata
- Added Context7 MCP wiring
- Added marketplace assets: icon, logo, screenshots
- Added smoke tests for hooks, manifests, MCP, and asset references

### Notes

- Forge is distributed as a generic plugin and does not assume repo-local installation.
- Optional MCP providers may require their own authentication flow.
