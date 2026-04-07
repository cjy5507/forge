# Lane Runtime Reference

Forge lane orchestration is file-backed. The canonical state lives in `.forge/runtime.json`.

## Runtime Shape
- `lanes.<lane-id>.title` — human-readable lane title
- `lanes.<lane-id>.status` — `pending | ready | in_progress | blocked | in_review | merged | done`
- `lanes.<lane-id>.owner_role` — current owner role or label
- `lanes.<lane-id>.reviewer` — designated reviewer
- `lanes.<lane-id>.task_file` — `.forge/tasks/<lane>.md`
- `lanes.<lane-id>.worktree_path` — `.forge/worktrees/<lane>`
- `lanes.<lane-id>.dependencies[]` — upstream lane ids; this is the lane graph
- `lanes.<lane-id>.session_handoff_notes` — latest handoff summary
- `lanes.<lane-id>.handoff_notes[]` — ordered status and handoff notes
- `lanes.<lane-id>.review_state` — `none | pending | changes_requested | approved`
- `lanes.<lane-id>.merge_state` — `none | queued | rebasing | ready | merged`
- `active_worktrees` — lane-to-worktree lookup
- `next_lane` — the next lane Forge should continue

## Standard Helper Commands
Create the worktree:

```bash
node scripts/forge-worktree.mjs create \
  --lane api-auth \
  --branch forge/api-auth
```

Register the lane in runtime:

```bash
node scripts/forge-lane-runtime.mjs init-lane \
  --lane api-auth \
  --title "Implement auth API" \
  --task-file .forge/tasks/api-auth.md \
  --worktree .forge/worktrees/api-auth \
  --depends-on contracts
```

Assign ownership:

```bash
node scripts/forge-lane-runtime.mjs assign-owner \
  --lane api-auth \
  --owner developer
```

Update status during execution:

```bash
node scripts/forge-lane-runtime.mjs update-lane-status \
  --lane api-auth \
  --status in_progress \
  --note "Contracts confirmed, implementation started"
```

Write a review or developer handoff:

```bash
node scripts/forge-lane-runtime.mjs write-handoff \
  --lane api-auth \
  --note "Ready for review after lint, typecheck, and tests"
```

Summarize the lane graph:

```bash
node scripts/forge-lane-runtime.mjs summarize-lanes
```

## Operating Rules
- Every lane gets a task file from `templates/task.md`.
- Every lane gets a worktree created through `scripts/forge-worktree.mjs`.
- Every lane transition updates `.forge/runtime.json`.
- Handoff notes are required before review, reassignment, or merge coordination.
- Approved / merge-ready lanes should be surfaced and landed before new implementation work starts.
- `subagent-stop` will auto-infer narrow control-tower signals from final notes such as `approved`, `changes requested`, `ready to merge`, and `needs rebase`.
- The Lead Developer manages the lane graph; no helper auto-merges or auto-rebases on its own.
