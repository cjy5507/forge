# Task: {{lane_id}} - {{title}}

## Summary
- Goal: {{goal}}
- Owner: {{owner}}
- Reviewer: {{reviewer}}
- Status: pending

## Lane
- Lane ID: {{lane_id}}
- Branch: {{branch}}
- Worktree: {{worktree}}
- Runtime record: `.forge/runtime.json`

## Scope
- Allowed files:
  - {{allowed_file_1}}
- Excluded files:
  - {{excluded_file_1}}

## Dependencies
- Depends on:
  - {{dependency_lane_or_none}}
- Blockers:
  - {{blocker_or_none}}

## Inputs
- Spec references:
  - {{spec_ref}}
- Contract references:
  - {{contract_ref}}
- Code rules:
  - `.forge/code-rules.md`

## Acceptance Criteria
- {{acceptance_criterion_1}}
- {{acceptance_criterion_2}}

## Verification
- Required checks:
  - {{verification_command_1}}
- Evidence location:
  - {{evidence_path}}

## Review
- Review owner: {{reviewer}}
- Review handoff trigger:
  - Update lane status to `in_review`
- Review notes:
  - {{review_note_or_none}}

## Handoff
- Current handoff note:
  - {{handoff_note}}
- Next owner:
  - {{next_owner_or_same}}
- Runtime commands:
  - `node scripts/forge-lane-runtime.mjs write-handoff --lane {{lane_id}} --note "<summary>"`
  - `node scripts/forge-lane-runtime.mjs update-lane-status --lane {{lane_id}} --status <pending|ready|in_progress|blocked|in_review|merged|done>`
