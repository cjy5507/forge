---
name: status
description: Use whenever the user asks for Forge progress, current phase, active agents, pending blockers, or "where are we now?" prompts such as "forge status", "진행 상황", "어디까지 됐어?", "what phase is this in?", or "show the harness state".
---

<Purpose>
Shows the current state of the Forge project at a glance — phase, progress, active agents, holes, and pending client questions.
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
5. Read `.forge/runtime.json` for active tier, recommended agents, and metrics
6. Read .forge/tasks/ for active task status
6. Display dashboard:

```
Forge 진행 현황: {{PROJECT_NAME}}
┌─────────────────────────────────┐
│ Phase: {{N}}/7 ({{phase_name}})│
│ Tier: {{light|medium|full}}    │
│ {{progress_bar}} {{X}}%        │
│                                │
│ ✅ 완료: {{completed_items}}    │
│ 🔄 진행 중: {{active_items}}    │
│ ⏳ 대기: {{pending_items}}      │
│                                │
│ 🕳️ 이슈: {{holes_count}}       │
│   blocker: {{blocker_count}}   │
│   major: {{major_count}}       │
│   minor: {{minor_count}}       │
│                                │
│ ❓ 의뢰인 확인 필요: {{N}}      │
│ 🤖 추천 에이전트: {{agents}}    │
│ 🏷️ 최신 태그: {{latest_tag}}   │
└─────────────────────────────────┘
```
</Steps>

<Tool_Usage>
- Read: .forge/state.json, .forge/runtime.json, .forge/holes/*.md, .forge/tasks/*.md
- Bash: git tag -l "forge/*" --sort=-version:refname | head -1
</Tool_Usage>
