# Forge Phase Map

Use this reference when you need the full phase sequence without loading the entire workflow explanation into context.

## Build mode

0. Intake
1. Discovery
2. Design
3. Develop
4. QA
5. Security
6. Fix
7. Delivery / complete handoff

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
