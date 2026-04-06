# Forge Release Notes Draft

## v0.3.6

Worktree guard root-resolution hotfix.

### Highlights

- Fixed `write-gate` so worktree writes resolve `.forge` paths from the canonical repo root
- Fixed false missing-contract errors when writing Forge task/state files from a worktree cwd
- Added worktree regression coverage for `.forge/tasks/...` writes and root contract/evidence lookup
- 330 automated tests passing

### Notes

- This is a safety fix for Forge plugin path resolution, not a workflow surface change
- The goal is to keep develop-phase guards strict while making worktree lanes use the correct repo-root artifacts

## v0.3.5

Codex evidence and evaluation alignment release.

### Highlights

- Added `forge eval` MVP with machine-readable scorecards and markdown reports under `.forge/eval/`
- Added live Codex smoke evidence for `forge status`, `forge info`, `forge continue`, and `forge analyze`
- Fixed delivered-project resume routing so terminal projects collapse to the canonical info surface
- Unified hole scoping across status, delivery, and evaluation so product proof surfaces stop drifting
- 328 automated tests passing

### Notes

- Codex support remains explicitly degraded for lifecycle hooks; the verified surface is runtime, status, continue, and analysis
- `forge eval` is ready to capture harness runs, but still needs baseline runs for stronger A/B claims

## v0.3.4

Intent traceability hardening release.

### Highlights

- Added requirement-aware templates for spec, task, hole, and delivery artifacts
- Added `traceability.json` template and contracts for requirement-level state
- Added write-gate intent warnings and high-risk denial when active lanes lack requirement linkage
- Added traceability coverage reporting and delivery report generation CLIs
- Added traceability sync so lane progress and linked holes update requirement status
- Added auto-decompose requirement inference from `traceability.json`
- 294 automated tests passing

### Notes

- Forge now tracks user intent more directly across develop, QA, fix, and delivery
- Delivery coverage can be computed from requirement state instead of manual report writing

## v0.3.3

State machine validation and consistency checks.

### Highlights

- Added `validatePhaseTransition()` — blocks invalid backward phase transitions (fix-loop and rollback still allowed)
- Added `validateStateConsistency()` — detects and auto-corrects contradictions between state.json and runtime.json (e.g. phase=plan + delivery_readiness=delivered)
- Added `completeForgeProject()` / `cancelForgeProject()` — explicitly marks projects as terminal so `forge continue` can detect stale projects
- Added `isProjectTerminal()` — used by continue to distinguish active vs completed/cancelled projects
- Extended `normalizeDeliveryReadiness` to accept `completed` and `cancelled` values
- 21 new tests, 279 total tests passing
- Inspired by claw-code-main's explicit state machine pattern

### Notes

- All validation uses degraded mode: contradictions log warnings and auto-correct rather than throwing errors
- Backward compatibility preserved — no existing API signatures changed

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
