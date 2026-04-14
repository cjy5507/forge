# QA Methodology

Use this reference when planning or executing QA passes.

## Test layers

- Functional: acceptance criteria, error handling, edge cases
- Visual: states, spacing, responsive behavior, design-token usage
- Contract: API and component shape consistency
- Regression: existing tests and previously fixed bugs
- Edge-case: empty, boundary, invalid, rapid interaction, timeout, auth expiry

## Hole report minimum fields

- Severity
- Symptom
- Expected behavior
- Reproduction steps
- Related contract
- Related spec section
- Environment

## Severity guide

- `blocker`: cannot ship
- `major`: significant issue that should block delivery
- `minor`: low-impact or cosmetic, can ship with disclosure

## Summary output

Include:
- Total requirements tested
- Passed / failed / blocked counts
- Blockers
- Major issues
- Minor issues
- Delivery recommendation
- Test-file diff: lines added per file vs baseline, mapped to acceptance IDs

## Test volume discipline

Background: 2026-04 codex-framework-benchmark-hard run revealed Forge produced 300
test lines vs plain Codex 169 lines on the same single-file bug — process-proof tests
inflate output without raising coverage.

Rules (mirrored in `skills/qa/SKILL.md` <Test_Budget>):

1. Capture baseline `wc -l test/**/*` before adding.
2. Per-file growth cap: `+50%` over baseline OR `+60` lines (whichever is larger).
   Exceeding requires a justification table mapping each new test → spec/acceptance ID.
3. One test per acceptance criterion is the default. Multiple tests = each must name
   the boundary, error path, or regression it covers.
4. Forbidden: tests that exist only to demonstrate QA ran (smoke tests of imports,
   "returns an object", trivial assertions on stable framework primitives).
5. Edge-case tests require a spec mention OR an observed failure. Speculative
   "what if X is null" tests are skipped unless null is a legal contract input.
6. Reuse over duplicate: cite existing coverage instead of restating it.

If a real coverage gap requires breaching the budget, escalate to Lead Dev *before*
writing the tests, with a written reason.
