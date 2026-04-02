---
name: forge
description: Use when the user wants to build a complete product from an idea. Triggers on "forge", "만들어줘", "build me", "create an app". Entry point for the Virtual Software Company pipeline.
---

<Purpose>
Forge is a Virtual Software Company that takes an idea and delivers a working product.
This skill is the main entry point that orchestrates the entire pipeline:
Intake → Discovery → Design → Development → QA → Security → Fix → Delivery
</Purpose>

<Use_When>
- User invokes /forge or says "forge"
- User describes a product idea: "~~ 만들어줘", "build me a ~~", "I want an app that ~~"
- User wants end-to-end product development with team collaboration
</Use_When>

<Do_Not_Use_When>
- User wants a quick code fix (use direct editing)
- User wants to modify existing code (use standard workflow)
- User is already in a Forge session (use phase-specific skills)
</Do_Not_Use_When>

<Core_Principles>
1. No Evidence, No Code — 증거 없이 코드 작성 금지
2. No Ambiguity, No Start — 모호하면 구현 말고 질문
3. No Hole Left Behind — 발견된 구멍은 반드시 추적
4. Right Architecture, Right Scale — 규모에 맞는 최적 설계
</Core_Principles>

<Execution_Policy>
- Each Phase MUST complete before the next begins
- The client (user) approves at every Phase gate
- If ANYTHING is unclear, ASK — never assume
- State is persisted in .forge/ directory
- Cancel with "forge cancel" or "포지 취소" at any time
</Execution_Policy>

<Steps>
Phase 0 — INTAKE (CEO):
  1. Read the client's request
  2. CEO agent evaluates: Can we build this? Is scope reasonable?
  3. If unclear → ask the client
  4. If GO → initialize .forge/ directory with state.json
  5. Hand off to PM for Phase 1

Phase 1 — DISCOVERY (PM):
  1. Invoke forge:discovery skill
  2. PM interviews client one question at a time
  3. Generate spec.md from template
  4. Open Questions must reach 0
  5. CEO reviews spec → client approves → Phase 2

Phase 2 — DESIGN (CTO + Designer):
  1. Invoke forge:design skill
  2. CTO: architecture + code-rules.md + interface contracts
  3. Designer: UI/UX spec + component definitions
  4. Cross-review between CTO and Designer
  5. Fact checker validates all technical claims via context7
  6. Client approves design → Phase 3

Phase 3 — DEVELOPMENT (Lead + Devs + Publisher):
  1. Invoke forge:develop skill
  2. Lead splits work into tasks, creates git worktrees
  3. Each developer/publisher works in isolated worktree
  4. PR-based merge with 3-tier review (auto → lead → CTO)
  5. Code rules enforced — inconsistent code is REJECTED
  6. All PRs merged → Phase 4

Phase 4 — QA (QA Engineer):
  1. Invoke forge:qa skill
  2. Functional, visual, contract, regression, edge-case testing
  3. Issues → bug tracker (.forge/holes/)
  4. Blockers → Phase 5, No blockers → Phase 4.5

Phase 4.5 — SECURITY (Security Reviewer):
  1. Invoke forge:security skill
  2. OWASP Top 10, secrets scan, auth/authz review
  3. Security issues = blockers → Phase 5

Phase 5 — FIX LOOP (Fact Checker + Devs + Troubleshooter):
  1. Invoke forge:fix skill
  2. Simple issues: fact-check → dev fix → QA re-verify
  3. Complex issues: troubleshooter RCA → dev fix → QA re-verify
  4. Max 3 iterations, then CEO reports to client with alternatives
  5. All blockers resolved → Phase 6

Phase 6 — DELIVERY (CEO + Tech Writer):
  1. Invoke forge:deliver skill
  2. Tech writer generates docs (README, API docs, deploy guide)
  3. CEO compiles delivery report
  4. Present to client: coverage %, known issues, test results
</Steps>

<State_Management>
On first invocation, create .forge/ directory:

.forge/
├── state.json      ← current phase, progress, active agents
├── spec.md         ← client-approved spec (Phase 1 output)
├── code-rules.md   ← CTO-defined code rules (Phase 2 output)
├── design/         ← architecture + UI design (Phase 2 output)
├── contracts/      ← interface contracts (Phase 2 output)
├── evidence/       ← fact-checker verification results
├── holes/          ← discovered issues
├── tasks/          ← work unit definitions
├── worktrees/      ← git worktree directories
├── checkpoints/    ← context checkpoints
├── knowledge/      ← project knowledge base
└── delivery-report/← final delivery docs
</State_Management>

<Dashboard>
After each Phase transition, show progress to client:

Forge 진행 현황:
┌─────────────────────────────────┐
│ Phase: N/6 (phase_name)        │
│ ████████░░░░ XX%               │
│                                │
│ ✅ completed items              │
│ 🔄 in-progress items            │
│ ⏳ pending items                 │
│                                │
│ 알려진 이슈: N                  │
│ 의뢰인 확인 필요: N             │
└─────────────────────────────────┘
</Dashboard>

<Rollback>
Each Phase completion creates a git tag:
  forge/v{N}-{phase_name}

Client can request rollback:
  "아까 디자인이 더 나았어요" → rollback to forge/v1-design → resume from Phase 2
</Rollback>

<Tool_Usage>
- Use Agent tool to dispatch team members (CEO, PM, CTO, etc.)
- Use TaskCreate/TaskUpdate for work tracking
- Use Bash for git operations (worktree, branch, tag, merge)
- Use Write for .forge/ state files
- Use Read for loading specs, contracts, code-rules
- Do NOT use tools without evidence (PreToolUse hook will block)
</Tool_Usage>
