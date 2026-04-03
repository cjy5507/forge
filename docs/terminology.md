# Forge terminology decisions

## `resume_lane` → `next_lane` (planned)

**Status**: Planned for next breaking-change window.

**Background**: User-facing commands use `continue` (`forge continue`), but the internal
runtime field is still `resume_lane`. This creates a terminology split between what users
see and what the code says.

**Decision**: Rename `resume_lane` to `next_lane` across runtime code, state files, and
internal docs. `next_lane` is shorter, neutral (no resume/continue ambiguity), and
describes what the field actually means — "which lane should be picked up next."

**Affected locations**:
- `scripts/lib/forge-state.mjs` — `selectResumeLane()` → `selectNextLane()`, `resume_lane` field
- `scripts/forge-lane-runtime.mjs` — runtime output and lane selection
- `skills/develop/references/lane-runtime.md` — field documentation
- `agents/lead-dev.md` — "resume guidance" references
- `scripts/*.test.mts` — test assertions
- `.forge/runtime.json` schema — field name in persisted state

**Migration**: Since `.forge/runtime.json` is per-project and transient (recreated each
Forge run), no backward-compatibility shim is needed. Just rename everywhere in one pass.

**Not changing**: The word "resume" as a generic English verb in prose descriptions
(e.g., "resume from Phase 2") is fine — it's only the API field name that needs consistency.
