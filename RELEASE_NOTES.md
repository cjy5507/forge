# Forge Release Notes Draft

## v0.6.2

Codex selective-install UX hotfix.

### Highlights

- Automatically switches selective host/profile installs to `copy` mode when `--mode` is omitted
- Fixes the common `--host codex` bootstrap path so it no longer fails on the default symlink mode
- Keeps explicit `--mode symlink` behavior strict, so invalid selective symlink installs still fail clearly
- Installer regression coverage increased to 491 passing tests across the full suite

### Notes

- This release removes a real usability footgun for Codex installs
- The goal is that `--host codex` feels like a normal install path, not a hidden selective-install edge case

## v0.6.1

Codex installer UX patch.

### Highlights

- Added best-effort Codex local marketplace registration during Forge setup
- Added automatic Codex plugin symlink creation for standard local plugin scan paths
- Kept Forge installation non-failing when Codex marketplace registration cannot be completed
- Added installer regression coverage for Codex registration behavior

### Notes

- This is a patch release focused on reducing post-install manual setup for Codex users
- Standard Codex environments should now be much closer to one-command install behavior

## v0.6.0

Harness OS release.

### Highlights

- Promoted Forge from a phase-only workflow harness into a more explicit deterministic harness OS
- Added `harness_policy`, `decision_trace`, `verification`, and `recovery` runtime surfaces
- Added integrity fingerprint stamping and trust-visibility warnings for state/runtime drift
- Added Stop-time verification planning, durable verification artifact output, and `forge verification`
- Added recovery ledger with retry/escalation behavior and `forge recovery`
- Added host adapter contract surfaces with deterministic floor and observed lifecycle reporting
- Added health/status/analytics surfacing for policy posture, latest decisions, verification, and recovery
- 487 automated tests passing

### Notes

- This release strengthens determinism, verifiability, recoverability, and bounded host behavior rather than broadening the toolbox surface
- Claude remains the deepest lifecycle host; degraded hosts now expose a clearer deterministic floor and explicit bounded degraded behavior

## v0.3.9

Explicit cross-host continue release.

### Highlights

- Added a real `scripts/forge-continue.mjs` command surface backed by shared `.forge` state
- Tightened Codex/Claude resume messaging around explicit cross-host `forge continue`
- Extracted shared host-context, continue-routing, and prompt-routing helpers to reduce hook duplication
- Refreshed durable analysis truth so previously fixed issues are not carried forward as current blockers
- 361 automated tests passing

### Notes

- This release narrows the product contract: separate Codex CLI and Claude CLI workflows should resume through explicit `forge continue`
- Claude remains the deeper hook-lifecycle host; Codex remains degraded support outside the shared state/status/continue path

## v0.3.8

Release-readiness and delivery alignment release.

### Highlights

- Fixed copy-mode packaging so `.mcp.json` is preserved in copied installs
- Aligned `forge analyze` docs/skill contract with the actual bundled MCP surface
- Made task decomposition degrade immediately on Codex instead of stalling on Claude CLI
- Prevented heuristic decomposition from fabricating nonexistent `src/...` ownership in script-first repos
- Restored a green TypeScript gate for runtime `.mjs` sources
- Fixed status/delivery issue counts so verified tracked holes no longer appear as active release blockers
- 342 automated tests passing

### Notes

- This release is intended to be safe to ship immediately from `main`
- Existing historical Forge phase/version tags were preserved; this release adds a fresh semantic version tag

## v0.3.7

Merge-debt control-tower release.

### Highlights

- Surfaced `approved`, `merge-ready`, `queued`, `rebasing`, and `changes requested` lanes ahead of fresh implementation work
- Updated `forge status` and next-action routing so small reviewed slices are landed before more scope opens
- Added narrow `subagent-stop` inference for review approval, requested changes, merge readiness, and rebase-needed notes
- Bumped package, plugin, and marketplace metadata to `0.3.7` for update detection and cache refresh
- 231 targeted automated tests passing for runtime, hooks, and status surfaces

### Notes

- This release is aimed at reducing large catch-up merges by making merge debt first-class in the harness
- `merged` and `done` remain explicit state transitions; Forge does not infer irreversible integration state from prose

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
