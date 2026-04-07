# Forge terminology decisions

## `resume_lane` → `next_lane` (complete)

**Status**: Migration complete. All runtime code, tests, fixtures, and state files use `next_lane`.

**Background**: User-facing commands use `continue` (`forge continue`), but the original
runtime field was `resume_lane`. This created a terminology split between what users
see and what the code says.

**Decision**: Renamed `resume_lane` to `next_lane` across runtime code, state files, and
internal docs. `next_lane` is shorter, neutral (no resume/continue ambiguity), and
describes what the field actually means — "which lane should be picked up next."

**What's done**:
- `scripts/lib/forge-state.mjs` — `selectNextLane()`, `next_lane` field throughout
- `scripts/forge-lane-runtime.mjs` — runtime output uses `next_lane`
- `scripts/forge-runtime-core.test.mts` — all assertions use `next_lane`
- `scripts/harness-hooks.test.mts` — test assertions use `selectNextLane`
- `scripts/fixtures/*.json` — all fixtures use `next_lane`
- `skills/continue/SKILL.md` — continuation target table references `next_lane`
- `skills/intake/SKILL.md` — runtime.json field list uses `next_lane`
- `skills/develop/references/lane-runtime.md` — field documentation updated
- `agents/lead-dev.md` — no `resume_lane` references remain

**Remaining**: None. The migration is complete.

**Not changing**: The word "resume" as a generic English verb in prose descriptions
(e.g., "resume from Phase 2") is fine — it's only the API field name that needed consistency.
