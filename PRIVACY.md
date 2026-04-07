# Forge Privacy Policy

Forge is a local workflow plugin.

## What Forge stores

- `.forge/state.json` for workflow state
- `.forge/runtime.json` for runtime events, active subagents, and recent failures
- `.forge/checkpoints/` and other generated project artifacts when the workflow uses them

## What Forge sends externally

Forge itself does not require a hosted backend.

Optional MCP integrations such as Context7 may send requests to their own services when used.
Those services operate under their own privacy policies and authentication models.

## User responsibility

Users are responsible for reviewing:

- which MCP servers are enabled,
- what repository content they allow agents to read,
- and whether generated `.forge/` artifacts should be committed or ignored.
