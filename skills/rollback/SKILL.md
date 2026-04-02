---
name: rollback
description: Use when the client wants to go back to a previous phase. Rolls back to a git tag checkpoint and resumes from that phase.
---

<Purpose>
Rolls the project back to a previous phase using git tags created at each phase completion.
The client can say "아까 디자인이 더 나았어요" and Forge rolls back to that point.
</Purpose>

<Use_When>
- Client wants to undo recent work: "되돌려줘", "아까가 더 나았어", "rollback"
- A phase produced unsatisfactory results
- Need to restart from a specific phase
</Use_When>

<Steps>
1. List available rollback points:
   `git tag -l "forge/v*" --sort=-version:refname`
   Show to user:
   "사용 가능한 복원 지점:
    - forge/v1-spec (Phase 1 완료 — 스펙)
    - forge/v1-design (Phase 2 완료 — 설계)
    - forge/v1-dev (Phase 3 완료 — 개발)
    - forge/v1-qa (Phase 4 완료 — QA)
    어디로 돌아갈까요?"

2. User selects a tag

3. Confirm with user:
   "forge/v1-design 으로 롤백하면:
    - Phase 3 이후 작업이 되돌아갑니다
    - 코드 변경사항이 롤백됩니다
    - Phase 2 (설계) 이후부터 다시 시작합니다
    계속할까요? (y/n)"

4. If confirmed:
   a. Save current state as backup tag: `git tag forge/backup-{timestamp}`
   b. Reset to selected tag: `git checkout {tag} -- .` (safe checkout, not hard reset)
   c. Update .forge/state.json:
      - Restore phase number from tag name
      - Set status to "active"
      - Clear tasks/holes that came after this phase
   d. Clean up worktrees from later phases
   e. Show: "Phase {{N}} ({{phase_name}})으로 롤백 완료. 이 시점부터 다시 진행합니다."

5. Invoke forge:resume to continue from the rolled-back phase
</Steps>

<Safety>
- ALWAYS create backup tag before rollback
- NEVER use git reset --hard (use safe checkout)
- ALWAYS confirm with user before executing
- Show exactly what will be lost
</Safety>

<Tool_Usage>
- Bash: git tag -l, git tag (backup), git checkout {tag} -- .
- Write: update .forge/state.json
- Skill: forge:resume after rollback
</Tool_Usage>
