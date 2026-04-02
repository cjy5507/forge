---
name: fix
description: Use when Forge enters the bug fix loop. Routes simple issues to developers, complex issues to troubleshooter for root cause analysis.
---

<Purpose>
Phase 5 of the Forge pipeline. The fix loop triages discovered issues from QA and
security phases, routes them to the appropriate handler (simple fix or deep diagnosis),
and iterates until all blockers are resolved. Max 3 iterations before escalating to
the client with alternatives.
</Purpose>

<Use_When>
- Automatically invoked when Phase 4 (QA) or Phase 4.5 (security) finds blockers
- state.json phase=5
</Use_When>

<Steps>
1. Load all open issues from .forge/holes/:
   a. Read each .forge/holes/{issue-id}.md
   b. Sort by severity: blocker → major → minor → cosmetic
   c. Focus ONLY on blockers (minor/cosmetic are deferred to known-issues)

2. Triage each blocker:
   a. Simple issue (clear cause, isolated to one module):
      - Fact-checker verifies the root cause is correct
      - Dispatch developer agent to fix in worktree:
        git worktree add .forge/worktrees/fix-{issue-id} -b forge/fix-{issue-id}
      - Developer implements fix
      - PR review (Tier 1 automated + Tier 2 Lead review)
      - Merge and cleanup worktree

   b. Complex issue (unclear cause, spans multiple modules, or reproduces intermittently):
      - Invoke forge:troubleshoot skill for root cause analysis
      - Troubleshooter produces RCA report in .forge/evidence/rca-{issue-id}.md
      - Dispatch developer agent with RCA report to implement minimal fix
      - PR review (all 3 tiers — automated + Lead + CTO)
      - Merge and cleanup worktree

3. QA Re-verification:
   a. After each fix is merged, dispatch QA engineer to re-verify:
      - Does the specific issue reproduce? (must be NO)
      - Did the fix introduce any regressions? (run full test suite)
      - Are related features still working?
   b. If re-verification fails:
      - Issue goes back to step 2 with additional context
      - Increment iteration counter for this issue

4. Iteration Tracking:
   - Each issue has a max of 3 fix attempts
   - Track in .forge/holes/{issue-id}.md:
     - attempt_count: N
     - attempt_history: what was tried and why it failed

5. Max Iterations Exceeded:
   - If any blocker reaches 3 failed attempts:
     a. CEO agent compiles a report for the client:
        - What the issue is (non-technical explanation)
        - What was tried (3 attempts summary)
        - Alternatives:
          (a) Redesign the affected feature
          (b) Descope the feature to V2
          (c) Accept as known limitation with workaround
     b. Client decides which alternative to pursue
     c. If redesign → route back to Phase 2 (design) for the affected module
     d. If descope → move issue to known-issues, continue to Phase 6
     e. If accept → document workaround, continue to Phase 6

6. Gate Decision:
   - All blockers resolved (fixed or client-approved descope) → phase=6
   - Still has unresolved blockers → continue iteration

7. Update state.json: phase=6, phase_id="delivery", phase_name="delivery"

8. Transition to Phase 6 (forge:deliver)
</Steps>

<State_Changes>
- Creates: .forge/worktrees/fix-{issue-id}/ (temporary fix worktrees)
- Updates: .forge/holes/{issue-id}.md (attempt count, resolution status)
- Creates: .forge/evidence/rca-{issue-id}.md (for complex issues)
- Updates: .forge/state.json (phase=6 when all blockers resolved)
- Removes: fix worktrees after merge
</State_Changes>

<Failure_Modes_To_Avoid>
- Attempting to fix a complex issue without root cause analysis
- Fixing symptoms instead of root causes
- Not re-verifying after each fix (assuming the fix works)
- Exceeding 3 iterations without escalating to client
- Fixing a blocker but introducing a new blocker (regression)
- Not tracking attempt history for each issue
- Skipping CTO review on complex multi-module fixes
- Leaving orphan fix worktrees after Phase 5 completes
- Marking an issue as resolved without QA re-verification
- Not presenting alternatives when max iterations are exceeded
</Failure_Modes_To_Avoid>
