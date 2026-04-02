---
name: develop
description: Use when Forge begins parallel development. Lead splits tasks, creates git worktrees, developers implement in isolation with PR-based review and code consistency enforcement.
---

<Purpose>
Phase 3 of the Forge pipeline. The Lead Developer splits the approved design into
independent tasks. Each developer/publisher works in an isolated git worktree —
physical file-system separation, not just branches. All code goes through a 3-tier
PR-based review pipeline with code-rules enforcement. The first merged PR becomes
the "living standard" that all subsequent PRs must match.
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
</Core_Rules>

<Steps>
1. Lead Developer reads:
   - .forge/design/architecture.md
   - .forge/contracts/*.md
   - .forge/code-rules.md

2. Lead splits work into independent tasks (one per module/feature):
   - Identify module boundaries from architecture
   - Map each task to its interface contracts
   - Define test criteria each module must pass
   - Ensure tasks have minimal cross-dependencies

3. For each task, Lead creates:
   a. Git worktree:
      git worktree add .forge/worktrees/{module} -b forge/{module}
   b. Task definition: .forge/tasks/{module}.md containing:
      - Scope: which files to create/modify
      - Contracts: which interfaces to implement
      - Tests: what must pass before PR
      - Dependencies: what other modules this relies on (if any)

4. Dispatch developer/publisher agents in parallel, each with:
   - isolation: "worktree"
   - Working directory: .forge/worktrees/{module}
   - Context loaded: spec subset + module contract + code-rules.md
   - NO access to other worktrees or modules

5. Each developer implements their module:
   a. Read assigned task definition (.forge/tasks/{module}.md)
   b. Read relevant contracts (.forge/contracts/)
   c. Read code-rules.md
   d. Fact-check any uncertain technical claims before coding
   e. Implement the module
   f. Run tests locally in the worktree
   g. Create PR when all local tests pass

6. PR Review Pipeline (3 tiers — ALL must approve):

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

7. After each merge, rebase all other active worktrees:
   cd .forge/worktrees/{other-module} && git rebase main
   - If rebase conflicts: developer resolves in their worktree
   - If conflict is architectural: escalate to Lead

8. Repeat steps 5-7 until all PRs are merged

9. Cleanup worktrees:
   git worktree remove .forge/worktrees/{module}
   (for each completed module)

10. Update state.json: phase=4, phase_name="qa"

11. Create git tag: forge/v1-dev

12. Transition to Phase 4 (forge:qa)
</Steps>

<Worktree_Management>
Create worktree:
  git worktree add .forge/worktrees/{module} -b forge/{module}

List active worktrees:
  git worktree list

Rebase worktree after merge:
  cd .forge/worktrees/{module} && git rebase main

Remove worktree after merge:
  git worktree remove .forge/worktrees/{module}

Prune stale worktrees:
  git worktree prune

Emergency cleanup (all):
  git worktree list --porcelain | grep "worktree .forge" | cut -d' ' -f2 | xargs -I{} git worktree remove {}
</Worktree_Management>

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
- Creates: .forge/worktrees/{module}/ (git worktrees, one per task)
- Creates: .forge/tasks/{module}.md (task definitions)
- Updates: state.json (phase=4, phase_name="qa")
- Creates: git tag forge/v1-dev
- Removes: all worktrees after completion
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:lead for task splitting and PR review
- Agent tool: dispatch forge:developer (parallel, one per module)
- Agent tool: dispatch forge:publisher (parallel, for UI modules)
- Agent tool: dispatch forge:cto for Tier 3 reviews
- Agent tool: dispatch forge:fact-checker for technical verification
- Bash tool: git worktree add/remove/list, git rebase, git tag
- Write tool: create .forge/tasks/{module}.md
- Read tool: load contracts, code-rules.md, architecture
- Edit tool: update .forge/state.json
</Tool_Usage>

<Failure_Modes_To_Avoid>
- Developers modifying files outside their worktree scope
- Skipping any tier of code review
- Merging without all 3 tiers approving
- Not rebasing other worktrees after a merge
- Leaving orphan worktrees after Phase 3 completes
- Developers loading full project context instead of minimal subset
- Not enforcing code-rules.md on every PR
- Allowing inconsistent patterns between merged PRs
- Starting Phase 4 before all worktrees are cleaned up
- Not creating the forge/v1-dev tag before transition
</Failure_Modes_To_Avoid>
