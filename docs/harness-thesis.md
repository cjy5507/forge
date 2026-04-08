# Forge Harness Thesis

Forge is not a general AI coding toolbox.

Forge is a deterministic harness OS for engineering teams running long-lived
build and repair work across sessions, hosts, and interruptions.

## Primary product goal

Strengthen:

- determinism
- verifiability
- recoverability
- observability
- bounded cross-host consistency

Do not optimize first for:

- breadth of domain skills
- quantity of agents
- novelty of prompts
- generic workflow convenience without stronger harness guarantees

## Feature intake rubric

Every meaningful feature should answer:

1. Which runtime decision becomes more deterministic?
2. Which verification path becomes more explicit or reproducible?
3. Which failure becomes easier to recover from?
4. Which durable artifact or audit trail does it create?
5. What is the honest degraded-host story?

If a change does not materially improve one of those, it is probably not a
Forge-core feature.

## Default posture

- Guarded by default
- Additive schema evolution
- Explicit degraded behavior
- File-backed shared control plane
- Honest trust model over inflated security claims
