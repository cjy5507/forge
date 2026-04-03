# Forge Release Notes Draft

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
