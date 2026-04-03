---
name: continue
description: "Use whenever the user wants to continue an existing Forge run after a pause, restart, compaction, or interruption. Triggers include \"forge continue\", \"이어서 해줘\", \"pick up where we left off\", and any request to continue the active `.forge/` state."
---

<Purpose>
Automatically detects the current Forge project state and resumes from the most actionable company task first, with lane-level continuation next and phase-level continuation as the fallback. Used when starting a new session with an existing .forge/ project.
</Purpose>

<Use_When>
- User returns after session break: "이어서 해줘", "forge continue"
- SessionStart detects existing .forge/state.json
- User wants to pick up where they left off
</Use_When>

<Steps>
1. Read .forge/state.json
2. If not found → "No active Forge project. Use /forge to start a new one."
3. Load project context:
   - Current phase and phase name
   - Spec approved? Design approved?
   - Active holes count
   - Current internal gate, delivery readiness, customer blockers, and internal blockers from .forge/runtime.json
   - Current session goal, exit criteria, next session goal, next session owner, and session handoff summary
   - Active lanes, blocked lanes, review lanes, merge/rebase lanes, and recommended resume lane from .forge/runtime.json
   - Lane handoff notes and blocked reasons from the runtime record
   - Last checkpoint from .forge/checkpoints/
4. Display resume summary:
   "Forge 프로젝트 '{{project_name}}' 복귀합니다.
    현재 Phase: {{phase}}/7 ({{phase_name}})
    현재 Gate: {{active_gate}} | Delivery: {{delivery_state}}
    이번 세션 목표: {{current_session_goal}}
    스펙 승인: {{yes/no}} | 설계 승인: {{yes/no}}
    활성 lane: {{lane_count}} | 재개 lane: {{resume_lane}}
    고객 블로커: {{customer_blockers}} | 내부 블로커: {{internal_blockers}}
    다음 세션 시작 담당: {{next_session_owner}} | 다음 목표: {{next_session_goal}}
    가장 중요한 handoff: {{session_handoff_summary}}
    미해결 이슈: {{holes_count}}건"
5. Map phase number to skill:
   If mode === 'express', use express phase mapping:
   - plan → forge:discovery (compressed with design)
   - build → forge:develop (with inline QA)
   - ship → forge:deliver (compressed with fix)

   Otherwise, use standard phase mapping:
   - 0 → forge:intake
   - 1 → forge:discovery
   - 2 → forge:design
   - 3 → forge:develop
   - 4 → forge:qa
   - 4.5 / security → forge:security
   - 5 / fix → forge:fix
   - 6 / delivery → forge:deliver
   - complete → forge:status
6. Load relevant context files:
   - Phase 1+: .forge/spec.md
   - Phase 2+: .forge/code-rules.md, .forge/design/
   - Phase 3+: .forge/contracts/, .forge/tasks/, .forge/runtime.json
   - Phase 4+: .forge/holes/
7. Resume in this order:
   - If a customer blocker exists, surface the customer-owned question instead of pretending execution can continue internally
   - Else if an internal gate is active, resume the owning team or matching phase
   - Else if a resume lane exists, prefer that lane's task/worktree context first
   - Else fall back to the phase skill
8. Invoke the corresponding phase skill or lane-specific continuation path to continue
</Steps>

<Context_Loading>
Each phase loads only what it needs (minimal context):
- Phase 0-1: spec template only
- Phase 2: approved spec
- Phase 3: spec + design + contracts + code-rules
- Phase 4-7: spec + holes + delivery status
  - If company-mode runtime exists, load it before phase prose so gate, blocker, review, merge, and rebase states are preserved.
</Context_Loading>

<Tool_Usage>
- Read: .forge/state.json, .forge/runtime.json, .forge/checkpoints/*, relevant phase files
- Skill: invoke phase-specific skill (forge:intake through forge:deliver)
</Tool_Usage>
