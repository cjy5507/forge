---
name: qa
description: "Use when Forge begins quality assurance. QA engineer runs functional, visual, contract, regression, and edge-case tests against the spec."
---

<Purpose>
Phase 5 of the Forge pipeline. The QA Engineer systematically tests the implemented
product against the spec, design, and interface contracts. Every feature is verified
through functional, visual, contract, regression, and edge-case testing. Issues are
tracked in .forge/holes/ and classified by severity to determine the next phase.
</Purpose>

<Use_When>
- Automatically invoked after Phase 4 (develop) completes
- state.json phase=5
</Use_When>

<Layer_Classification>
QA agent is dispatched as layer2_subagent — process isolation from developers is critical
to maintain independent verification.

Optional Analyst support: Analyst can augment QA with quality assessment — dead code detection,
complexity hotspots, and pattern violations (see agents/analyst.md). QA decides whether to
invoke Analyst based on project size and scope; skip for small projects, recommend for
multi-module codebases.
</Layer_Classification>

<Test_Budget>
Tests must prove acceptance criteria, not the QA process. Inflated test files were a benchmark
defect (codex-framework-benchmark-hard, 2026-04: forge produced 300 lines vs plain 169).

Hard rules:
1. **Baseline before adding**: `wc -l test/**/*` before any test addition. Record the baseline.
2. **Per-file growth cap**: a QA pass may grow any single test file by at most **+50% over baseline OR +60 lines**, whichever is larger. Exceeding the cap requires a written justification entry in the QA summary listing each added test → spec/acceptance ID.
3. **One test per acceptance criterion** is the default. Multiple tests for the same criterion require justification (boundary, error path, regression — each must be named).
4. **No process-proof tests**: do not add tests that exist only to demonstrate QA ran (e.g., "verify allocator returns an object", "verify import works"). Every test must map to a spec line, contract clause, or known regression.
5. **Reuse > duplicate**: if an existing test covers the criterion, reference it in the QA summary instead of writing a parallel one.
6. **Edge cases on demand**: edge-case tests are added only when the spec mentions the boundary OR a real failure was observed. Speculative edge cases ("what if input is null?") are skipped unless null is a legal input per contract.

If QA needs to exceed the budget, escalate to Lead Dev with the rationale before writing the tests, not after.
</Test_Budget>

<Steps>
0. **Handoff Interview — QA Intake (tier-aware, see `references/handoff-interview.md`)**
   a. QA Engineer reads spec.md, components.md, contracts, Lead Dev's session
      handoff notes, and merged code (git log of Phase 4 work).
   b. At the top of the QA test plan, QA records any **blockers** (spec/impl
      mismatch, missing test criteria, contract/impl drift) and any **consequential
      assumptions**. Free-form bullets, no structured Q template.
   c. For each blocker, QA pings the owner directly (Lead Dev or CTO for
      implementation questions, PM for spec intent). No CEO triage hop.
   d. At `full` tier only, additionally write `.forge/handoff-interviews/qa.md`
      (phase gate enforces this). The test plan is the understanding record;
      no separate statement.

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
   For each discovered issue, dispatch the bug-tracker agent to create a hole file
   using the standard format `HOLE-{NNN}-{slug}.md`:
   - Provide the bug-tracker with:
     - Severity: blocker | major | minor | cosmetic
     - Category: functional | visual | contract | regression | edge-case
     - Steps to reproduce
     - Expected behavior (from spec/design)
     - Actual behavior
     - Affected spec section
     - Requirement IDs and acceptance IDs whenever known
   - The bug-tracker agent writes .forge/holes/HOLE-{NNN}-{slug}.md with the next
     available sequence number and a kebab-case slug derived from the issue summary
   - After hole creation, run:
     `node scripts/forge-sync-traceability.mjs`

7b. **Lesson Check + Extraction (harness learning)**:
    a. Before testing, load relevant pattern lessons from ~/.claude/forge-lessons/ and .forge/lessons/
       - Match lessons against current tech stack and project type
       - Known bug patterns from past projects → add as extra test cases
    b. After testing, if 3+ blockers found:
       - Categorize blockers by root cause type
       - If a category has 2+ blockers → create pattern lesson in .forge/lessons/
       - See `references/harness-learning.md` for format

8. Gate Decision:
   - Count blockers and majors
   - If blockers > 0 → set next_phase=7 (fix loop)
   - If blockers = 0 → set next_phase=6 (security review)
   - Update company runtime in the same step:
     - If blockers > 0:
       `node scripts/forge-lane-runtime.mjs set-company-gate --gate implementation_readiness --gate-owner lead-dev --delivery-state blocked --internal-blockers "{blocker summaries}"`
     - If blockers = 0:
       `node scripts/forge-lane-runtime.mjs set-company-gate --gate security --gate-owner security-reviewer --delivery-state in_progress`

9. Update state.json:
   - If blockers: phase=7, phase_id="fix", phase_name="fix"
   - If clean: phase=6, phase_id="security", phase_name="security"

10. Update session handoff:
   - If blockers:
     `node scripts/forge-lane-runtime.mjs write-session-handoff --summary "{blockers found in QA}" --next-goal "Fix blockers and rerun QA" --next-owner lead-dev`
   - If clean:
     `node scripts/forge-lane-runtime.mjs write-session-handoff --summary "QA clear; proceed to security review" --next-goal "Run security delivery gate" --next-owner security-reviewer`

11. Create git tag: forge/v1-qa

12. Transition to next phase (forge:fix or forge:security)
</Steps>

<State_Changes>
- Creates: .forge/holes/HOLE-{NNN}-{slug}.md (one per discovered issue, via bug-tracker agent)
- Updates: .forge/state.json (phase=7 or phase=6)
- Updates: .forge/runtime.json (qa/security gate result + session handoff)
- Creates: git tag forge/v1-qa
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:qa-engineer (layer2_subagent) for independent test execution
- Agent tool: dispatch forge:bug-tracker to create .forge/holes/HOLE-{NNN}-{slug}.md for each issue
- Agent tool: dispatch forge:analyst (optional) for dead code detection and complexity hotspots on multi-module codebases
- Read tool: load .forge/spec.md, .forge/design/components.md, .forge/contracts/*.ts, .forge/code-rules.md
- Bash tool: run test suites (vitest, jest, playwright)
- Edit tool: update .forge/state.json (phase transition)
- CLI helper: `node scripts/forge-lane-runtime.mjs` for company gate and session handoff updates
</Tool_Usage>

<Failure_Modes_To_Avoid>
- Testing only the happy path and skipping error/edge cases
- Not referencing the spec when determining expected behavior
- Classifying blockers as minor to skip the fix loop
- Skipping visual testing across all responsive breakpoints
- Not verifying interface contracts match actual implementation
- Moving to security review when blockers exist
- Not creating reproducible steps for discovered issues
- Creating holes without requirement linkage when the affected requirement is known
- Testing against assumed behavior instead of spec-defined behavior
</Failure_Modes_To_Avoid>

<Auto_Chain>
When QA completes:
- If blockers found: update state.json phase_id → "fix", IMMEDIATELY invoke Skill: forge:fix
- If no blockers: update state.json phase_id → "security", IMMEDIATELY invoke Skill: forge:security
Do NOT stop, summarize, or ask the user. The pipeline continues autonomously.
</Auto_Chain>
