# Forge Release Notes Draft

## v0.1.0

Initial public marketplace-ready release.

### Highlights

- Added phase-gated build and repair workflows
- Added runtime stop guard and subagent lifecycle tracking
- Added tool-failure recovery guidance
- Added Codex-facing plugin manifest metadata
- Added Context7 MCP wiring
- Added marketplace assets: icon, logo, screenshots
- Added smoke tests for hooks, manifests, MCP, and asset references

### Notes

- Forge is distributed as a generic plugin and does not assume repo-local installation.
- Optional MCP providers may require their own authentication flow.
