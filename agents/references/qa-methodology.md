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
