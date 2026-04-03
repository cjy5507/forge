---
name: status
description: "Show current Forge project state. Triggers: \"forge status\", \"where are we?\", \"show progress\"."
---

<Purpose>
One-glance view of the project. Answers three questions: where are we, what's blocking, what's next.
Prioritizes actionable information over completeness.
</Purpose>

<Use_When>
- User asks "forge status", "where are we?", "show progress"
- Between phases to check overall state
- When returning to a session
</Use_When>

<Steps>

## 1. Read state

Load `.forge/state.json`. If missing → "No active Forge project. Use `forge` to start one."

Also load if they exist:
- `.forge/runtime.json` — lanes, blockers, ownership
- `.forge/holes/` — issue counts by severity
- Latest git tag matching `forge/*`

## 2. Calculate progress

| Phase | Range  |
|-------|--------|
| 0–1   | 0–25%  |
| 2     | 25–40% |
| 3     | 40–70% |
| 4–5   | 70–90% |
| 6     | 90–100%|

Within Phase 3, refine by lane completion ratio.

## 3. Display dashboard

```
Forge: {{project_name}} ({{build|repair}})
Phase {{N}}/7 — {{phase_name}}
{{progress_bar}} {{X}}%

{{actionable_summary}}

Lanes: {{done}}/{{total}} done{{if blocked}}, {{blocked}} blocked{{/if}}
Issues: {{blocker}} blocker, {{major}} major, {{minor}} minor
Tag: {{latest_tag}}
```

### Actionable summary rules

Pick the FIRST that applies:

1. **Customer blocker exists** → "Waiting on client: {{what's needed}}"
2. **Internal blocker exists** → "Blocked: {{description}} (owner: {{role}})"
3. **Delivery ready for review** → "Ready for client review"
4. **Lanes in progress** → "Active: {{lane names}}. Next: {{recommended action}}"
5. **Default** → "Phase {{name}} in progress"

### When to show more detail

If the user asks "forge status --verbose" or "detail", expand with:
- Full lane list with status per lane
- All hole summaries
- Handoff notes from runtime
- Worktree paths

But the default is the compact view above.

</Steps>

<Tool_Usage>
- Read: .forge/state.json, .forge/runtime.json, .forge/holes/*.md
- Bash: git tag -l "forge/*" --sort=-version:refname | head -1
</Tool_Usage>
