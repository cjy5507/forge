# Context Budget Protocol

Every agent dispatch must follow a context budget. Too much context dilutes focus and
wastes tokens. Too little causes the agent to guess or hallucinate. This protocol defines
exactly what each role receives.

## Why This Exists

LLMs degrade when overloaded with context. A developer who receives the entire spec,
all contracts, full architecture, design tokens, AND code-rules will produce worse code
than one who receives only their task definition, relevant contract, and code-rules.
The harness must be the information diet controller.

## Budget Tiers

Each context item has a **priority tier**:

| Tier | Meaning | Load when... |
|------|---------|--------------|
| T0 — Mandatory | Agent cannot function without this | Always loaded |
| T1 — Relevant | Directly related to the assigned task | Loaded by default |
| T2 — Reference | May be consulted if questions arise | Loaded on demand (agent requests it) |
| T3 — Background | General project context | Never loaded for individual agents |

## Per-Role Context Budgets

### PM (Discovery)
| Tier | Items |
|------|-------|
| T0 | state.json, client conversation history |
| T1 | templates/spec.md |
| T2 | Researcher briefs (when dispatched) |
| T3 | architecture.md, contracts, code (never given to PM) |

### CTO (Design)
| Tier | Items |
|------|-------|
| T0 | spec.md, state.json |
| T1 | Researcher briefs (tech options), existing codebase structure (if repair) |
| T2 | Designer's components.md (for cross-review) |
| T3 | Client conversation history, QA reports |

### Designer (Design)
| Tier | Items |
|------|-------|
| T0 | spec.md (user flows and features only), state.json |
| T1 | Reference app screenshots/descriptions |
| T2 | CTO's architecture.md (for cross-review) |
| T3 | Contracts, code-rules, implementation details |

### Lead Dev (Develop)
| Tier | Items |
|------|-------|
| T0 | architecture.md, contracts/*.ts, code-rules.md, state.json |
| T1 | components.md, tokens.json, spec.md (feature list only) |
| T2 | Full spec.md, design rationale |
| T3 | Client conversation, researcher briefs |

### Developer (per-module implementation)
| Tier | Items |
|------|-------|
| T0 | tasks/{module}.md, contracts/{relevant}.ts, code-rules.md |
| T1 | Living standard reference (first merged PR patterns) |
| T2 | architecture.md (module boundaries section only) |
| T3 | Full spec, other modules' tasks, design docs, other worktrees |

**CRITICAL: Developers NEVER receive T3 items.** This is the primary isolation mechanism.

### Publisher (UI implementation)
| Tier | Items |
|------|-------|
| T0 | tasks/{module}.md, contracts/{relevant}.ts, code-rules.md, components.md (assigned components only), tokens.json |
| T1 | Living standard reference |
| T2 | architecture.md (frontend section only) |
| T3 | Backend contracts, other modules, full spec |

### QA Engineer
| Tier | Items |
|------|-------|
| T0 | spec.md, contracts/*.ts, state.json |
| T1 | components.md, tokens.json, holes/ (existing issues) |
| T2 | architecture.md, code-rules.md |
| T3 | Task definitions, worktree contents, developer handoff notes |

### Security Reviewer
| Tier | Items |
|------|-------|
| T0 | Full source code, contracts/*.ts, architecture.md |
| T1 | spec.md (auth/data sections), code-rules.md |
| T2 | holes/ (existing issues) |
| T3 | Design docs, tokens, component specs |

### Troubleshooter (RCA)
| Tier | Items |
|------|-------|
| T0 | hole report for the specific issue, relevant source code |
| T1 | contracts/*.ts, architecture.md (affected module section) |
| T2 | spec.md (expected behavior), QA reproduction steps |
| T3 | Design docs, other modules' code |

### Fact Checker
| Tier | Items |
|------|-------|
| T0 | The specific claim to verify |
| T1 | context7 docs for the relevant library/framework |
| T2 | Architecture decisions that depend on the claim |
| T3 | Everything else |

### Tech Writer (Delivery)
| Tier | Items |
|------|-------|
| T0 | spec.md, architecture.md, contracts/*.ts |
| T1 | README template, deploy guide template |
| T2 | components.md, code-rules.md |
| T3 | holes/, QA reports, developer handoff notes |

## Dispatch Template

When dispatching an agent, follow this pattern:

```
Agent dispatch for {role} ({task description}):
  T0 (mandatory): {list files to read/include}
  T1 (relevant):  {list files to read/include}
  T2 (on-demand): {list files available if agent asks}
  EXCLUDED:       {explicitly list what NOT to include}
```

## Context Escalation

If an agent discovers it needs information not in its budget:
1. Agent requests the specific item with justification
2. Lead Dev (in develop) or CEO (in other phases) approves or denies
3. If approved: item is loaded as a one-time T2 addition
4. If the same item is requested by 3+ agents: promote it to T1 for that role

## Express Mode

Express mode relaxes budgets:
- All roles receive T0 + T1 by default
- T2 is pre-loaded (no on-demand gating)
- T3 exclusion still applies
- Rationale: express tasks are small enough that context overload is unlikely

## Anti-Patterns

- Loading "everything" into an agent because "it might need it"
- Developer receiving full spec.md (they only need their task scope)
- QA receiving developer handoff notes (biases testing toward known issues)
- Security reviewer not receiving full source code (can't audit what they can't see)
- Fact checker receiving more than the specific claim (dilutes focus)
