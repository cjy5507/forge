---
name: status
description: "Use whenever the user asks for Forge progress, current phase, active agents, pending blockers, or \"where are we now?\" prompts such as \"forge status\", \"진행 상황\", \"어디까지 됐어?\", \"what phase is this in?\", or \"show the harness state\"."
---

<Purpose>
Shows the current state of the Forge project at a glance — phase, progress, active lanes, worktrees, holes, gates, blockers, and delivery readiness. This is the control tower view: company-mode runtime signals outrank phase narration when the two disagree.
</Purpose>

<Use_When>
- User asks "forge status", "진행 상황", "어디까지 됐어?"
- Between phases to check overall progress
- When returning to a session to see where things left off
</Use_When>

<Steps>
1. Read .forge/state.json
2. If not found → "No active Forge project. Use /forge to start."
3. Calculate progress:
   - Phase 0-1: spec work (0-25%)
   - Phase 2: design (25-40%)
   - Phase 3: development (40-70%)
   - Phase 4-5: QA + fix (70-90%)
   - Phase 6: delivery (90-100%)
4. Read .forge/holes/ directory for known issues count by severity
5. Read `.forge/runtime.json` for active tier, recommended agents, metrics, lane state, worktree activity, resume guidance, and company-mode gate state
6. Read .forge/tasks/ for active task status
7. Prioritize runtime signals in this order when building the summary:
   - active internal gate and gate owner
   - delivery readiness state
   - current session goal and exit criteria
   - next session goal and next session owner
   - customer blockers and whether client input is required
   - internal blockers and owning team
   - active/in_progress lanes
   - blocked lanes and their reasons
   - review lanes and review state
   - merge/rebase lanes and merge state
   - ready/pending lanes
   - recommended resume lane from runtime
8. Display dashboard:

```
Forge 진행 현황: {{PROJECT_NAME}}
┌─────────────────────────────────┐
│ Phase: {{N}}/7 ({{phase_name}})│
│ Tier: {{light|medium|full}}    │
│ Gate: {{active_gate}}          │
│ Delivery: {{delivery_state}}   │
│ Goal: {{current_session_goal}} │
│ Next: {{next_session_owner}}   │
│ {{progress_bar}} {{X}}%        │
│                                │
│ ✅ 완료: {{completed_items}}    │
│ 🔄 진행 중: {{active_items}}    │
│ ⛔ 막힘: {{blocked_items}}      │
│ 👀 review: {{review_items}}     │
│ ↺ merge/rebase: {{merge_items}} │
│ ⏳ 대기: {{pending_items}}      │
│                                │
│ 🕳️ 이슈: {{holes_count}}       │
│   blocker: {{blocker_count}}   │
│   major: {{major_count}}       │
│   minor: {{minor_count}}       │
│                                │
│ ❓ 고객 블로커: {{customer_blockers}} │
│ 🏢 내부 블로커: {{internal_blockers}} │
│ 🤖 추천 에이전트: {{agents}}    │
│ 🧩 활성 lane: {{lane_count}}    │
│ 🌿 worktree: {{worktree_count}} │
│ ▶️ 재개 lane: {{resume_lane}}   │
│ 🏷️ 최신 태그: {{latest_tag}}   │
└─────────────────────────────────┘
```

When company-mode runtime is available, status should call out the most actionable next move first:
- if `customer_blockers > 0`, say exactly what needs customer input
- else if `internal_blockers > 0`, say which internal team owns the next fix
- else if `delivery_readiness === ready_for_review`, say the company is ready for customer review
- else fall back to lane and phase summaries

If no company-mode data exists, keep the legacy lane + phase summary intact.
</Steps>

<Tool_Usage>
- Read: .forge/state.json, .forge/runtime.json, .forge/holes/*.md, .forge/tasks/*.md, .forge/worktrees/
- Bash: git tag -l "forge/*" --sort=-version:refname | head -1
</Tool_Usage>
