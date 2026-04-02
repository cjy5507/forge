---
name: cancel
description: "Use when canceling or cleaning up an active Forge project. Removes worktrees, clears state, preserves code already merged to main."
---

<Purpose>
Cleanly stops an active Forge project. Removes git worktrees, clears .forge/ state,
but preserves any code already merged to main branch.
</Purpose>

<Use_When>
- User says "forge cancel", "포지 취소", "프로젝트 취소"
- Need to abort mid-project
- Need to clean up after a completed project
</Use_When>

<Steps>
1. Read .forge/state.json to understand current state
2. If not found → "No active Forge project to cancel."
3. Confirm with user:
   "현재 Phase {{N}} ({{phase_name}}) 진행 중입니다.
    취소하면:
    - .forge/ 디렉토리 삭제
    - 활성 worktree 정리
    - main에 이미 머지된 코드는 유지
    계속할까요? (y/n)"
4. If confirmed:
   a. List and remove active worktrees:
      `git worktree list` → filter forge worktrees → `git worktree remove`
   b. Remove forge branches not merged to main:
      `git branch --list "forge/*" --no-merged main` → delete each
   c. Remove .forge/ directory
   d. Show summary: "Forge 프로젝트가 취소되었습니다. main 브랜치의 코드는 유지됩니다."
</Steps>

<Safety>
- ALWAYS confirm before deleting
- NEVER delete main branch or merged code
- NEVER force-delete branches that are merged
- If worktree removal fails, report error and continue with remaining cleanup
</Safety>

<Tool_Usage>
- Bash: git worktree list, git worktree remove, git branch -d
- Bash: rm -rf .forge/
- Read: .forge/state.json
</Tool_Usage>
