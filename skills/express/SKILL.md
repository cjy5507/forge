---
name: express
description: "Collapsed Forge pipeline for medium-complexity tasks. Use when the user says \"forge express\", \"빠르게\", \"quick build\", or when a task is too complex for a single prompt but doesn't warrant the full 8-phase pipeline."
---

<Purpose>
Express mode collapses the 8-phase pipeline into 3 steps for medium-complexity tasks:
1. PLAN (Discovery + Design compressed into one approval gate)
2. BUILD (Development + QA in a single pass with inline testing)
3. SHIP (Fix + Delivery compressed)

This reduces approval gates from 5 to 2 and turns from ~20 to ~8.
</Purpose>

<Use_When>
- Task is medium complexity (2-5 files, clear requirements)
- User explicitly requests express mode
- Task type is 'feature' or 'refactor' with clear scope
</Use_When>

<Do_Not_Use_When>
- Task requires extensive discovery (unclear requirements)
- Security-sensitive changes (auth, payments, data handling)
- Large-scale architectural changes (use full pipeline)
- Simple bugfix (use light tier instead)
</Do_Not_Use_When>

<Steps>
Step 1 — PLAN:
  1. Initialize .forge/ with tier='medium', mode='express'
  2. PM: Generate compact spec (max 1 page) from user's request
  3. CTO: Define code-rules and key interfaces inline
  4. Single approval gate: "Plan looks good? (y/n)"

Step 2 — BUILD:
  1. Lead-dev: Split into tasks, assign to developer(s)
  2. Developer: Implement with inline QA checks (test as you go)
  3. Fact-checker validates key claims
  4. Auto-merge if tests pass, else flag issues

Step 3 — SHIP:
  1. Fix any flagged issues (max 2 iterations)
  2. Tech-writer: Generate minimal README updates
  3. Present delivery summary
  4. Done — no separate QA or security phase (already inline)
</Steps>

<State_Management>
Express mode uses the same .forge/ directory but with mode='express'.
Phase mapping: plan=discovery, build=develop, ship=delivery
Tier is locked to 'medium' throughout.
</State_Management>
