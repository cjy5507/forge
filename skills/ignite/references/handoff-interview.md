# Handoff Interview Protocol

Every phase transition gives the receiving team a chance to catch misunderstandings
before work begins. The protocol is **tier-aware** — heavy ceremony is reserved for
`full` tier, where code enforces an artifact gate. Lower tiers use a single inline
step so phase transitions do not burn wall-clock on orchestration overhead.

## Why This Exists

Without any handoff, each team fills gaps with silent assumptions that compound
across phases. The interview catches blockers early, when they are cheap to fix.

## The Protocol

### Lower tiers (`off` / `light` / `medium`) — single inline step

The receiving team:

1. Reads the previous phase's artifacts.
2. Records any **blockers** and any **consequential assumptions** as bullets at the
   top of its own working artifact (e.g. `design/architecture.md`,
   `plan.md`, `tasks/{lane}.md`). One bullet per item, free-form prose — no
   `Q:/Domain:/Blocker:` template. Non-consequential uncertainty is not recorded;
   convert it into assumptions, fact-check tasks, or QA checks instead.
3. If a blocker exists, sends the question directly (via `SendMessage`) to the
   specific owner — PM for spec intent, CTO for technical, Designer for UX. No CEO
   triage hop. Work does not start until blockers are answered.
4. Begins work once no blockers remain. No separate "understanding statement"
   step; the working artifact itself is the record.

CEO is involved only when the owner is ambiguous or the question is truly
customer-owned (rare outside intake/discovery).

### `full` tier — artifact gate (code-enforced)

At `full` tier, phase gate `handoff_required` blocks advance until
`.forge/handoff-interviews/{phase}.md` exists (≥40 bytes). Contents:

```
# Handoff: {from_phase} → {to_phase}

## Blockers (must resolve before work)
- {blocker} — owner: {role} — resolved? {yes/no, brief answer}

## Assumptions recorded
- {assumption} — source: {artifact reference}
```

One file per entering phase (design, plan, develop, qa in build mode; fix in
repair mode). If there are no blockers and no consequential assumptions, a
one-line "none — artifacts are self-sufficient" is valid. Sign-off is implicit:
writing the artifact means the receiving team has read and accepted the inputs.

The handing-off team reviews the artifact **only if blockers were recorded**. No
blockers → no review step. This removes the two-party ceremony for the common
case where the handoff is clean.

Enforcement runs in `state-store`'s `applyPhaseGateCheck` at transition time, not
in `write-gate` (which would re-check on every tool call). See
`skills/ignite/references/DECISIONS.md` for the full rationale.

## When to Skip

- Express mode (forge:express) — no interview; the single plan/build/ship flow
  keeps context in one agent.
- Repair mode phases where ownership does not change (intake→reproduce,
  reproduce→isolate, QA→fix→QA re-verify) — a handoff note in the working
  artifact suffices. Only `isolate → fix` (troubleshooter → developer) requires
  an artifact at full tier.
- Same-agent transitions within a phase.

## Anti-Patterns

- Receiving team starts substantive work before blockers are answered.
- Routing every question through CEO when an owner is obvious.
- Using a structured `Q:/Domain:/Blocker:` template at lower tiers — that format
  is obsolete; free-form bullets on the working artifact are canonical.
- Writing a separate "understanding statement" at any tier — the working
  artifact itself is the understanding record.
- Producing a handoff artifact with more than a handful of blockers — that
  signals the previous phase did not complete and should be reopened instead.
