---
name: stats
description: Use when the user asks for Forge metrics, harness overhead, with/without comparisons, stop-block counts, agent-call counts, failure history, or prompts like "forge stats", "measure Forge", "show harness metrics", and "compare with baseline".
---

<Purpose>
Shows Forge effectiveness and overhead using `.forge/state.json`, `.forge/runtime.json`,
and the A/B evaluation template.
</Purpose>

<Use_When>
- User asks for Forge metrics or performance
- User wants with/without harness comparison
- User asks how much Forge intervened
- User asks whether Forge is worth keeping on
</Use_When>

<Steps>
1. Read `.forge/state.json`
2. Read `.forge/runtime.json`
3. Report:
   - Tier
   - Session count
   - Agent calls
   - Failure count
   - Stop-block count
   - Test runs and failures
4. If baseline data exists, compare with the current run.
5. If no baseline exists, prepare one using `templates/ab-eval-report.md`.
</Steps>

<Progressive_Disclosure>
- Load `../ignite/references/harness-ab-eval.md` when a structured with/without comparison is needed.
</Progressive_Disclosure>
