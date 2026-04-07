# Forge Phase Map

Use this reference when you need the full phase sequence without loading the entire workflow explanation into context.

## Build mode

0. Intake
1. Discovery
2. Design
3. Plan
4. Develop
5. QA
6. Security
7. Fix
8. Delivery / complete handoff

## Repair mode

Skip discovery and design when the project already exists (7 working phases, N/7):

0. Intake
1. Reproduce
2. Isolate
3. Fix
4. Regress
5. Verify
6. Delivery

## Phase gate rule

Do not advance to the next phase until:
- the current phase output exists,
- the client gate is satisfied when required,
- and the state file is updated.

## Handoff interview rule

Every phase transition (1→2, 2→3, 3→4, 4→5) triggers a Handoff Interview:
1. Receiving team reads previous phase artifacts
2. Receiving team generates domain-specific questions
3. CEO triages: internal answer vs client question vs safe assumption
4. Questions resolved → receiving team writes understanding statement
5. Handing-off team confirms understanding → phase proceeds

See `references/handoff-interview.md` for full protocol.
Skip conditions: express mode, repair same-team transitions, handoff-note-only cases.
