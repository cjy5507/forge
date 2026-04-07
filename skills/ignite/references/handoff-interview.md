# Handoff Interview Protocol

Every phase transition triggers a **Handoff Interview** — the receiving team reads the
previous phase's artifacts and generates domain-specific questions before starting work.

## Why This Exists

Without handoff interviews, each team works from documents alone and fills gaps with
assumptions. Assumptions compound across phases, producing a final product that drifts
from client intent. The handoff interview catches misunderstandings early, when they're
cheap to fix.

## The Three-Step Handoff

### Step 1 — Receiving Team Reads Artifacts
The team entering the new phase reads ALL artifacts from the previous phase:
- Phase 1→2: CTO + Designer read spec.md
- Phase 2→3: Lead Dev reads architecture.md, contracts/*.ts, code-rules.md, components.md
- Phase 3→4: Lead Dev + developers read plan.md, tasks/*.md, contracts, code-rules.md
- Phase 4→5: QA reads spec.md, architecture.md, contracts, merged code
- Phase 5→7: Dev team reads hole reports, spec sections referenced

### Step 2 — Receiving Team Generates Questions
Each team member produces a **domain-scoped question list**:
- Questions they CANNOT answer from the artifacts alone
- Contradictions or gaps they found
- Assumptions they'd have to make without clarification

Format per question:
```
Q: {question}
Domain: {technical | design | business | integration}
Blocker: {yes — can't start without answer | no — can proceed with assumption}
Default assumption if no answer: {what they'd assume}
```

### Step 3 — CEO Triages Questions
CEO classifies each question:
- **INTERNAL** → route to the team that owns the answer (PM clarifies spec intent,
  CTO clarifies architecture intent, Designer clarifies UX intent)
- **CLIENT** → only if truly customer-owned (business decision, subjective preference,
  external constraint only client knows)
- **ASSUMPTION OK** → the default assumption is safe; record it and proceed

Questions are answered before the receiving team starts substantive work.

## Understanding Confirmation

After questions are resolved, the receiving team produces a **one-paragraph understanding
statement**: "Here is what I understand I need to do, and the constraints I'm working within."

The handing-off team reviews this statement. If it misrepresents intent → correct immediately.
If accurate → sign off and the phase proceeds.

## When to Skip

- Express mode (forge:express) uses a lightweight version: single combined plan-review
  instead of full interview rounds
- Repair mode Phase 0→1 (intake→reproduce): Troubleshooter reads codebase directly,
  no interview needed
- Same-team transitions (e.g., QA→Fix→QA re-verify): handoff note suffices

## Anti-Patterns

- Receiving team starts work before questions are answered
- CEO routes all questions to client (most should resolve internally)
- Questions are too vague ("is this right?") instead of specific
- Handing-off team rubber-stamps understanding statement without reading it
- Interview round exceeds 10 questions per team member (scope creep — deeper issues
  belong in the previous phase's output)
