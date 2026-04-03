---
name: develop
description: "Use when Forge starts implementation after design approval, or when the user asks for parallel module development with worktrees, scoped tasks, PR review, and living-standard enforcement. Trigger on requests to split implementation, dispatch developers, or enforce consistent multi-agent coding."
---

<Purpose>
Phase 3 of the Forge pipeline. The Lead Developer splits the approved design into
independent tasks. Each developer/publisher works in an isolated git worktree —
physical file-system separation, not just branches. All code goes through a 3-tier
PR-based review pipeline with code-rules enforcement. The first merged PR becomes
the "living standard" that all subsequent PRs must match. Lane orchestration is
runtime-backed: `.forge/runtime.json` stores the lane graph, owners, statuses,
active worktrees, handoff notes, and review/merge/rebase signals. Common Forge
paths should update that runtime automatically through the standard helpers, but
the process remains human-led and review-gated; it is not an autonomous merge bot.
</Purpose>

<Use_When>
- Automatically invoked after Phase 2 (design) completes
- state.json phase=3
</Use_When>

<Core_Rules>
1. Every developer works in their own git worktree (physical isolation)
2. No Evidence, No Code — developers must verify via fact-checker before writing
3. Code that violates code-rules.md = REJECTED
4. Code inconsistent with already-merged code = REJECTED
5. First merged PR becomes the "living standard"
6. Developers load ONLY: spec subset + relevant contracts + code-rules.md (minimal context)
7. Every created worktree/task must have a runtime lane record before dispatch
8. Handoff notes are required before review or reassignment
9. Explicit review, merge, and rebase states must be reflected in runtime
</Core_Rules>

<Progressive_Disclosure>
- Load `references/review-pipeline.md` when you need the full review tiers or worktree rules.
- Load `references/lane-runtime.md` when you need the standard runtime helper commands and lane graph rules.
</Progressive_Disclosure>

<Steps>
1. Lead Developer reads:
   - .forge/design/architecture.md
   - .forge/contracts/*.ts
   - .forge/code-rules.md

2. Lead defines the lane graph in `.forge/runtime.json`:
   - One lane per isolated module/feature
   - Record upstream dependencies before dispatch
   - Keep owner, reviewer, worktree, status, handoff notes, and next lane current with the runtime helper
   - Convert the PM session brief into an implementation session brief for this session and the next

3. Lead splits work into independent tasks (one per module/feature):
   - Identify module boundaries from architecture
   - Map each task to its interface contracts
   - Define test criteria each module must pass
   - Ensure tasks have minimal cross-dependencies

4. For each task, Lead creates:
   a. Git worktree with the standardized helper:
      node scripts/forge-worktree.mjs create --lane {module} --branch forge/{module}
   b. Task definition from `templates/task.md`: .forge/tasks/{module}.md containing:
      - Scope: which files to create/modify
      - Contracts: which interfaces to implement
      - Tests: what must pass before PR
      - Dependencies: what other modules this relies on (if any)
      - Owner / reviewer / worktree / review / handoff sections
   c. Runtime lane record with the standardized helper:
      node scripts/forge-lane-runtime.mjs init-lane --lane {module} --title "{title}" --task-file .forge/tasks/{module}.md --worktree .forge/worktrees/{module} [--depends-on ...]
      - This step should create the lane record immediately so the worktree/task pair never exists outside runtime.

5. Dispatch developer/publisher agents in parallel, each with:
   - isolation: "worktree"
   - Working directory: .forge/worktrees/{module}
   - Context loaded: spec subset + module contract + code-rules.md
   - NO access to other worktrees or modules
   - Lane owner assigned via:
     node scripts/forge-lane-runtime.mjs assign-owner --lane {module} --owner {agent}

6. Each developer implements their module:
   a. Read assigned task definition (.forge/tasks/{module}.md)
   b. Read relevant contracts (.forge/contracts/)
   c. Read code-rules.md
   d. Fact-check any uncertain technical claims before coding
   e. Update lane status to `in_progress`
   f. Implement the module
   g. Run tests locally in the worktree
   h. Write a handoff note before review:
      node scripts/forge-lane-runtime.mjs write-handoff --lane {module} --note "{verification summary}"
   i. Update lane status to `in_review`
   j. If review requests changes, or the lane needs merge/rebase follow-up, reflect that state in runtime immediately instead of leaving it implicit in chat.
   k. Create PR when all local tests pass

7. PR Review Pipeline (3 tiers — ALL must approve):

   Tier 1 — Automated Checks (instant):
   - Lint passes
   - TypeScript typecheck passes
   - All tests pass
   - No secrets or credentials in diff
   → Fail = instant reject, developer fixes and resubmits

   Tier 2 — Lead Developer Review:
   - code-rules.md compliance (naming, patterns, structure)
   - Consistency with already-merged code
   - Contract implementation correctness
   - No scope creep (only touches files in task definition)
   → Violate = reject with specific instructions:
     "개발자 B는 fetchUser()인데 당신은 getUser(). fetchUser()로 맞춰주세요"

   Tier 3 — CTO Review (architecture):
   - Module fits the overall architecture
   - No hidden coupling or circular dependencies
   - Performance and scalability concerns
   - Only invoked if Lead flags architectural concerns
   → Reject = CTO provides redesign guidance

   All tiers approve → merge to main

8. After each merge, update the lane record, then rebase all other active worktrees:
   node scripts/forge-lane-runtime.mjs update-lane-status --lane {module} --status merged --note "Merged to main"
   node scripts/forge-lane-runtime.mjs update-lane-status --lane {module} --status done --note "Worktree cleaned up"
   cd .forge/worktrees/{other-module} && git rebase main
   - If rebase conflicts: developer resolves in their worktree
   - If conflict is architectural: escalate to Lead
   - If a lane is waiting on rebase, mark that in runtime so status/continue can surface it as an active control-tower signal.

9. Repeat steps 6-8 until all PRs are merged
   - Use `node scripts/forge-lane-runtime.mjs summarize-lanes` to review the lane graph and blocked lanes
   - Update the session handoff so the next session knows what remains and who owns the first move

10. Cleanup worktrees:
   node scripts/forge-worktree.mjs remove --lane {module}
   (for each completed module)

11. Update state.json: phase=4, phase_name="qa"
    - Update company runtime for QA:
      `node scripts/forge-lane-runtime.mjs set-company-gate --gate qa --gate-owner qa --delivery-state in_progress`
    - Update session handoff toward QA:
      `node scripts/forge-lane-runtime.mjs write-session-handoff --summary "{what remains to verify}" --next-goal "Run QA and classify blockers" --next-owner qa`

12. Create git tag: forge/v1-dev

13. Transition to Phase 4 (forge:qa)
</Steps>

<Worktree_Management>
Create worktree:
  node scripts/forge-worktree.mjs create --lane {module} --branch forge/{module}

List active worktrees:
  node scripts/forge-worktree.mjs list

Rebase worktree after merge:
  cd .forge/worktrees/{module} && git rebase main

Remove worktree after merge:
  node scripts/forge-worktree.mjs remove --lane {module}

Prune stale worktrees:
  node scripts/forge-worktree.mjs prune
</Worktree_Management>

<Lane_Runtime>
Lane graph summary:
  node scripts/forge-lane-runtime.mjs summarize-lanes

Assign lane owner:
  node scripts/forge-lane-runtime.mjs assign-owner --lane {module} --owner {agent}

Update lane status:
  node scripts/forge-lane-runtime.mjs update-lane-status --lane {module} --status in_progress --note "{status note}"

Write handoff note:
  node scripts/forge-lane-runtime.mjs write-handoff --lane {module} --note "{handoff summary}"

Review and merge states:
  - Keep `in_review`, `blocked`, `merged`, and `done` current in runtime as the lane moves through review and integration.
  - Use runtime notes to capture rebase blockers, reviewer requests, and merge completion.
</Lane_Runtime>

<PR_Review_Checklist>
Tier 1 — Automated:
  [ ] Lint: no warnings, no errors
  [ ] TypeScript: tsc --noEmit passes
  [ ] Tests: all test suites pass
  [ ] Secrets: no API keys, tokens, or credentials in diff
  [ ] Build: project builds successfully

Tier 2 — Lead Developer:
  [ ] Naming conventions match code-rules.md
  [ ] File structure matches code-rules.md
  [ ] Import patterns match code-rules.md
  [ ] Error handling matches code-rules.md
  [ ] Consistent with already-merged PRs (the living standard)
  [ ] Only touches files within assigned task scope
  [ ] Implements all required interface contracts
  [ ] No TODO/FIXME/HACK comments left unresolved

Tier 3 — CTO (when flagged):
  [ ] Module boundaries respected
  [ ] No circular dependencies introduced
  [ ] No hidden coupling between modules
  [ ] Performance implications acceptable
  [ ] Scalability concerns addressed
</PR_Review_Checklist>

<Code_Consistency_Rule>
The FIRST merged PR sets the living standard for the entire project.

All subsequent PRs must match:
- Naming: if PR #1 uses fetchUser(), everyone uses fetchUser(), not getUser()
- Patterns: if PR #1 uses try/catch with custom errors, everyone follows
- Structure: if PR #1 puts hooks in /hooks, everyone puts hooks in /hooks
- Imports: if PR #1 uses absolute imports, everyone uses absolute imports
- Types: if PR #1 exports interfaces from /types, everyone does the same

When inconsistency is found, Lead rejects with explicit correction:
  "이미 머지된 코드에서는 {pattern}을 사용합니다. 이에 맞춰주세요:
   - Before: {developer's code}
   - After: {corrected code}"
</Code_Consistency_Rule>

<State_Changes>
- Creates: .forge/runtime.json lane records for each active lane
- Creates: .forge/worktrees/{module}/ (git worktrees, one per task)
- Creates: .forge/tasks/{module}.md (task definitions)
- Updates: state.json (phase=4, phase_name="qa")
- Updates: .forge/runtime.json (qa gate + QA session handoff)
- Creates: git tag forge/v1-dev
- Removes: all worktrees after completion
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:lead-dev for task splitting and PR review
- Agent tool: dispatch forge:developer (parallel, one per module)
- Agent tool: dispatch forge:publisher (parallel, for UI modules)
- Agent tool: dispatch forge:cto for Tier 3 reviews
- Agent tool: dispatch forge:fact-checker for technical verification
- Bash tool: git rebase, git tag
- CLI helper: `node scripts/forge-worktree.mjs` for worktree create/list/remove/prune
- CLI helper: `node scripts/forge-lane-runtime.mjs` for lane graph, owner, status, and handoff updates
- Write tool: create `.forge/tasks/{module}.md` from `templates/task.md`
- Read tool: load contracts, code-rules.md, architecture
- Edit tool: update `.forge/state.json` and `.forge/runtime.json`
</Tool_Usage>

<Failure_Modes_To_Avoid>
- Developers modifying files outside their worktree scope
- Skipping any tier of code review
- Merging without all 3 tiers approving
- Failing to register a lane in `.forge/runtime.json` before dispatch
- Leaving lane status stale after ownership, review, or merge changes
- Sending work to review without a handoff note in runtime
- Reassigning a lane without a handoff note in runtime
- Not rebasing other worktrees after a merge
- Leaving orphan worktrees after Phase 3 completes
- Developers loading full project context instead of minimal subset
- Not enforcing code-rules.md on every PR
- Allowing inconsistent patterns between merged PRs
- Letting merge/rebase state drift out of sync with runtime
- Treating helper-backed runtime updates as optional instead of mandatory on the common path
- Starting Phase 4 before all worktrees are cleaned up
- Not creating the forge/v1-dev tag before transition
</Failure_Modes_To_Avoid>
