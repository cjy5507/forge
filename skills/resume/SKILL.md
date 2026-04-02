---
name: resume
description: Use when returning to a Forge project after a session break. Auto-detects current phase and continues from where you left off.
---

<Purpose>
Automatically detects the current Forge project state and resumes from the last active phase.
Used when starting a new Claude Code session with an existing .forge/ project.
</Purpose>

<Use_When>
- User returns after session break: "이어서 해줘", "continue", "forge resume"
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
   - Last checkpoint from .forge/checkpoints/
4. Display resume summary:
   "Forge 프로젝트 '{{project_name}}' 복귀합니다.
    현재 Phase: {{phase}}/7 ({{phase_name}})
    스펙 승인: {{yes/no}} | 설계 승인: {{yes/no}}
    미해결 이슈: {{holes_count}}건"
5. Map phase number to skill:
   - 0 → forge:intake
   - 1 → forge:discovery
   - 2 → forge:design
   - 3 → forge:develop
   - 4 → forge:qa
   - 5 → forge:security (or forge:fix if holes exist)
   - 6 → forge:fix
   - 7 → forge:deliver
6. Load relevant context files:
   - Phase 1+: .forge/spec.md
   - Phase 2+: .forge/code-rules.md, .forge/design/
   - Phase 3+: .forge/contracts/, .forge/tasks/
   - Phase 4+: .forge/holes/
7. Invoke the corresponding phase skill to continue
</Steps>

<Context_Loading>
Each phase loads only what it needs (minimal context):
- Phase 0-1: spec template only
- Phase 2: approved spec
- Phase 3: spec + design + contracts + code-rules
- Phase 4-7: spec + holes + delivery status
</Context_Loading>

<Tool_Usage>
- Read: .forge/state.json, .forge/checkpoints/*, relevant phase files
- Skill: invoke phase-specific skill (forge:intake through forge:deliver)
</Tool_Usage>
