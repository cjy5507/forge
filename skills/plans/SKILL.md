---
name: plans
description: "Use when Forge reaches the planning phase between design and development. Lead Dev turns approved design artifacts into an execution plan, lane graph, and task briefs using Forge's native decomposition helpers."
---

<Purpose>
Phase 3 of the Forge build pipeline. Lead Dev converts approved design artifacts into
an executable implementation plan without starting code changes yet. This phase should
prefer Forge's native decomposition surfaces (`auto-decompose`, lane graph helpers,
task briefs, traceability) over handwritten hardcoded checklists. The goal is to
produce a reviewable execution plan that Develop can consume with minimal ambiguity.
</Purpose>

<Use_When>
- Automatically invoked after Phase 2 (design) completes
- state.json phase=3 / phase_id="plan"
</Use_When>

<Core_Rules>
1. Planning is not implementation. No feature code changes in this phase.
2. Prefer native decomposition helpers over manual lane invention when they fit the task.
3. The plan must capture ordering, boundaries, and verification intent, not just a todo list.
4. If the native decomposition output is weak or noisy, refine it; do not accept it blindly.
5. Task briefs must stay lane-scoped and reviewable.
</Core_Rules>

<Steps>
-1. **Staleness check**
    - Read state.json.staleness.
    - If architecture, contracts, code_rules, components, or tokens are stale, BLOCK.
    - Route back to design owners before planning proceeds.

0. **Handoff Interview — Planning Intake**
   a. Lead Dev reads:
      - .forge/design/architecture.md
      - .forge/design/components.md
      - .forge/design/tokens.json
      - .forge/contracts/*.ts
      - .forge/code-rules.md
      - CTO handoff notes / pre-generated implementation questions
   b. Lead identifies what still blocks decomposition:
      - unclear lane boundaries
      - hidden shared-state coupling
      - missing contracts or acceptance criteria
      - uncertain dependency order
   c. CEO triages unresolved questions internally first.
   d. Lead writes an understanding statement:
      "I will convert the approved design into [N] execution lanes with [ordering summary].
       The critical path is [path]. Main risks are [list]."

1. Generate the first decomposition draft with Forge's native helper:
   `node scripts/forge-lane-runtime.mjs auto-decompose --description "<spec/design summary>"`

2. Review and refine the native decomposition output:
   - tighten lane boundaries
   - split oversized lanes
   - merge trivial lanes
   - confirm dependency order
   - confirm file ownership scope

3. Write `.forge/plan.md` as the planning artifact:
   - summary of the approach
   - lane list with ownership/boundary notes
   - execution order / critical path
   - verification intent per lane
   - open risks or assumptions

4. Create or update `.forge/tasks/{lane}.md` briefs for each lane:
   - scope
   - contract references
   - acceptance refs / verification expectations
   - dependencies

5. Update runtime lane records so Develop can resume from file-backed state:
   - lane ids
   - scope
   - dependency graph
   - task file links
   - model hints when relevant

6. Internal planning gate:
   - Lead confirms the plan is executable without major ambiguity
   - CTO confirms the sequencing respects architecture intent
   - If a lane graph feels forced or brittle, revise it now rather than during implementation

7. Update state and handoff:
   - Update state.json: phase=4, phase_id="develop", phase_name="develop"
   - Update company runtime:
     `node scripts/forge-lane-runtime.mjs set-company-gate --gate implementation_readiness --gate-owner lead-dev --delivery-state in_progress`
   - Update session handoff toward development:
     `node scripts/forge-lane-runtime.mjs set-session-brief --goal "Advance the next implementation lane" --next-owner lead-dev --handoff "{plan summary}"`

8. Create git tag: forge/v1-plan

9. Transition to Phase 4 (forge:develop)
</Steps>

<State_Changes>
- Creates: .forge/plan.md
- Creates/updates: .forge/tasks/{lane}.md
- Creates/updates: .forge/runtime.json lane graph
- Updates: .forge/state.json (phase=4, phase_name="develop")
- Creates: git tag forge/v1-plan
</State_Changes>

<Tool_Usage>
- CLI helper: `node scripts/forge-lane-runtime.mjs auto-decompose`
- CLI helper: `node scripts/forge-lane-runtime.mjs init-lane`
- CLI helper: `node scripts/forge-lane-runtime.mjs summarize-lanes`
- Write tool: create `.forge/plan.md`, `.forge/tasks/{lane}.md`
- Read tool: load design artifacts and contracts
- Edit tool: update `.forge/state.json`, `.forge/runtime.json`
</Tool_Usage>

<Auto_Chain>
When planning completes (plan.md written, lane graph validated, task briefs linked):
1. Update state.json: phase_id → "develop"
2. IMMEDIATELY invoke Skill: forge:develop
Do NOT stop or ask the user unless there is a real customer-owned ambiguity.
</Auto_Chain>
