---
name: qa
description: Use when Forge begins quality assurance. QA engineer runs functional, visual, contract, regression, and edge-case tests against the spec.
---

<Purpose>
Phase 4 of the Forge pipeline. The QA Engineer systematically tests the implemented
product against the spec, design, and interface contracts. Every feature is verified
through functional, visual, contract, regression, and edge-case testing. Issues are
tracked in .forge/holes/ and classified by severity to determine the next phase.
</Purpose>

<Use_When>
- Automatically invoked after Phase 3 (develop) completes
- state.json phase=4
</Use_When>

<Steps>
1. Dispatch QA Engineer agent with context:
   - .forge/spec.md (requirements reference)
   - .forge/design/components.md (visual reference)
   - .forge/design/tokens.json (design tokens)
   - .forge/contracts/*.ts (interface contracts)
   - .forge/code-rules.md (code standards)

2. Functional Testing:
   a. Map every feature in spec.md to a test case
   b. For each feature:
      - Verify happy path works as described in spec
      - Verify error states behave as spec defines
      - Verify edge cases (empty data, max length, special chars, concurrent access)
   c. Record pass/fail for each test case

3. Visual Testing:
   a. For each component in components.md:
      - Verify all states render correctly: default, hover, active, disabled, loading, error, empty
      - Verify responsive behavior at all breakpoints (mobile, tablet, desktop)
      - Verify design tokens are applied correctly (colors, spacing, typography)
   b. Record visual discrepancies with screenshots/descriptions

4. Contract Testing:
   a. For each interface in .forge/contracts/:
      - Verify API responses match declared types
      - Verify component props match declared interfaces
      - Verify data flow matches architecture diagram
   b. Record contract violations

5. Regression Testing:
   a. Run full test suite (unit + integration)
   b. Verify no previously passing tests now fail
   c. Verify no unintended side effects from merged PRs

6. Edge-Case Testing:
   a. Empty states: what happens with no data?
   b. Boundary values: min/max inputs, zero, negative
   c. Rapid interactions: double-click, spam submit
   d. Network conditions: slow response, timeout
   e. Authentication edge cases: expired token, missing auth

7. Issue Classification:
   For each discovered issue, create a file in .forge/holes/:
   - .forge/holes/{issue-id}.md with:
     - Severity: blocker | major | minor | cosmetic
     - Category: functional | visual | contract | regression | edge-case
     - Steps to reproduce
     - Expected behavior (from spec/design)
     - Actual behavior
     - Affected spec section

8. Gate Decision:
   - Count blockers and majors
   - If blockers > 0 → set next_phase=5 (fix loop)
   - If blockers = 0 → set next_phase=4.5 (security review)

9. Update state.json:
   - If blockers: phase=5, phase_id="fix", phase_name="fix"
   - If clean: phase=4.5, phase_id="security", phase_name="security"

10. Create git tag: forge/v1-qa

11. Transition to next phase (forge:fix or forge:security)
</Steps>

<State_Changes>
- Creates: .forge/holes/{issue-id}.md (one per discovered issue)
- Updates: .forge/state.json (phase=5 or phase=4.5)
- Creates: git tag forge/v1-qa
</State_Changes>

<Failure_Modes_To_Avoid>
- Testing only the happy path and skipping error/edge cases
- Not referencing the spec when determining expected behavior
- Classifying blockers as minor to skip the fix loop
- Skipping visual testing across all responsive breakpoints
- Not verifying interface contracts match actual implementation
- Moving to security review when blockers exist
- Not creating reproducible steps for discovered issues
- Testing against assumed behavior instead of spec-defined behavior
</Failure_Modes_To_Avoid>
