---
name: ignite
description: "MANDATORY Forge entry point. Use when the user explicitly says \"forge\", \"포지\", \"build a harness\", \"set up Forge\", asks Forge to build a new product, or asks Forge to diagnose/fix/analyze an existing project. If the request is for a phased team workflow, build-vs-repair routing, or harness-based execution, you must start here."
---

<Purpose>
Forge is a Virtual Software Company. Ignite is the universal entry point.
Two modes:
- BUILD mode: idea → spec → design → development → QA → delivery
- REPAIR mode: existing project → diagnosis → fix → QA → delivery

The CEO evaluates the request and routes to the right mode. After kickoff, Forge should
operate like an internal software company: the client gives the request, answers minimum
critical questions, and reviews the delivery at the end. Internal teams own the rest.
</Purpose>

<Use_When>
- User invokes /forge:ignite or says "forge"
- BUILD: "~~ 만들어줘", "build me a ~~", "I want an app that ~~"
- REPAIR: "이거 고쳐줘", "오류 분석해줘", "fix this bug", "왜 안 돼?"
- User wants team-based development or debugging
</Use_When>

<Do_Not_Use_When>
- User is already in a Forge session (use phase-specific skills like forge:continue)
- Trivial one-line change that doesn't need team process
</Do_Not_Use_When>

<Core_Principles>
1. No Evidence, No Code — 증거 없이 코드 작성 금지
2. No Ambiguity, No Start — 모호하면 구현 말고 질문
3. No Hole Left Behind — 발견된 구멍은 반드시 추적
4. Right Architecture, Right Scale — 규모에 맞는 최적 설계
5. No Handoff Without Understanding — 이해 없이 인계 금지
   Each phase transition requires a Handoff Interview: the receiving team reads artifacts,
   generates domain-specific questions, CEO triages (internal vs client), questions are
   resolved, and receiving team confirms understanding before starting work.
   Load `references/handoff-interview.md` for the full protocol.
</Core_Principles>

<Execution_Policy>
- Each Phase MUST complete before the next begins
- The client is NOT the default phase approver; internal readiness gates decide phase progress
- Ask the client only when a blocker is truly customer-owned or critical ambiguity would cause the wrong product to be built
- State is persisted in .forge/ directory
- Cancel with "forge cancel" or "포지 취소" at any time
- Load `references/phase-map.md` for the compact phase sequence.
- Load `references/handoff-interview.md` for the handoff interview protocol between phases.
- Load `references/constraint-propagation.md` when an artifact changes and downstream impact must be tracked.
- Load `references/context-budget.md` when dispatching agents to determine correct context loading.
- Load `references/harness-learning.md` at project start (intake) to check lessons from past projects, and at delivery to record new lessons.
- Load `references/harness-ab-eval.md` when asked to prove Forge's value against a baseline.
</Execution_Policy>

<Steps>
Phase 0 — INTAKE / 접수 (CEO):
  1. Read the client's request / 의뢰인 요청 확인
  1b. **Lessons Check**: CEO loads global lessons from ~/.claude/forge-lessons/ (if exists)
      - Match project type against lesson `applies_when` conditions
      - Relevant lessons → record in state.json as `lessons_brief`
      - If no global lessons exist → log "No global lessons found, skipping" and set lessons_brief=[]
      - Pattern lessons feed into CTO's code-rules, QA's test plan
      - Estimation lessons calibrate scope assessment
  2. **Internal Deliberation** — CEO가 혼자 판단하지 않고 내부 회의 진행:
     - CEO가 CTO에게 기술적 실현 가능성 + 대안 아키텍처 요청 (context7 사용)
     - 고객 의도가 모호하면 PM에게 해석 요청
     - CTO + PM 의견 수렴 후 CEO가 종합 판단
     - 고객에게는 "가능합니다 + 방법은 이겁니다"로 제시 (내부 논의 과정은 비노출)

  3. CEO agent evaluates and ROUTES / CEO가 평가 후 라우팅:

     [BUILD mode] — new product request
      "만들어줘", "build me", idea description
      → Can we build this? If not directly, what alternative achieves the same goal?
      → GO: initialize .forge/, Phase 1 (Discovery)

     [REPAIR mode] — existing project fix/analysis
      "고쳐줘", "안 돼", "오류", "fix", "bug", "분석"
      → Existing codebase detected?
      → REPAIR Intake: Generate minimal baseline artifacts
        - Read existing codebase structure and create minimal spec.md (scope, constraints, known architecture)
        - Extract existing code conventions into code-rules.md
        - Scan for existing interfaces/types and populate .forge/contracts/ with stubs
      → Dispatch Troubleshooter for diagnosis
      → Diagnosis → Fix → QA → Deliver (skip full Phase 1-3)

  3. If unclear which mode or critical customer intent is missing → ask the client
  4. BUILD: initialize .forge/ directory with state.json (from templates/state.json), hand off to PM
     - state.json MUST include: artifact_versions={}, staleness={}, lessons_brief=[]
     - These fields are required for constraint propagation and harness learning
  5. REPAIR: initialize .forge/ with mode="repair" (same template fields), hand off to Troubleshooter

Phase 1 — DISCOVERY / 발견 (PM):
  1. Invoke forge:discovery skill / 디스커버리 스킬 실행
  2. PM interviews the client with understanding verification loops / PM이 이해 확인 루프로 인터뷰
     - After each major topic, PM summarizes understanding back to client
     - Client confirms or corrects before moving to next topic
  3. Generate spec.md from template / spec.md 생성
  4. Internal assumptions and validation targets are recorded
  5. **Pre-handoff: PM pre-generates questions CTO/Designer will likely have**
     - PM anticipates technical/design ambiguities in the spec
     - CEO reviews and resolves what can be answered internally
  6. CEO reviews spec readiness → internal GO to Phase 2

Phase 2 — DESIGN / 설계 (CTO + Designer):
  1. **Handoff Interview: CTO + Designer read spec.md and generate domain questions**
     - CTO: technical feasibility questions, missing constraints, integration gaps
     - Designer: UX flow gaps, missing states, interaction ambiguities
     - CEO triages: internal (PM/CEO answers) vs client-owned (ask client)
     - Questions resolved before design work begins
  2. Invoke forge:design skill / 디자인 스킬 실행
  3. CTO: architecture + code-rules.md + interface contracts
  4. Designer: UI/UX spec + component definitions
  5. Cross-review between CTO and Designer
  6. Fact checker validates all technical claims via context7
  7. **Pre-handoff: CTO generates implementation questions Lead Dev will need**
  8. CTO + Designer + fact-checker confirm design readiness → Phase 3

Phase 3 — DEVELOPMENT / 개발 (Lead + Devs + Publisher):
  1. **Handoff Interview: Lead reads architecture, contracts, code-rules, components**
     - Lead generates implementation questions (ambiguous boundaries, unclear contracts)
     - CEO triages: CTO answers technical, Designer answers UX, client if business-owned
     - Lead confirms understanding before splitting tasks
  2. Invoke forge:develop skill / 개발 스킬 실행
  3. Lead splits work into tasks, creates git worktrees
  4. Each developer/publisher works in isolated worktree
  5. PR-based merge with 3-tier review (auto → lead → CTO)
  6. Code rules enforced — inconsistent code is REJECTED
  7. All required lanes merged and internally verified → Phase 4

Phase 4 — QA / 품질보증 (QA Engineer):
  1. Invoke forge:qa skill / QA 스킬 실행
  2. Functional, visual, contract, regression, edge-case testing / 기능, 시각, 계약, 회귀, 엣지케이스 테스트
  3. Issues → bug tracker (.forge/holes/) / 이슈 → 버그 트래커
  4. Blockers → Phase 6, No blockers → Phase 5 / 블로커 → 6단계, 없으면 → 5단계

Phase 5 — SECURITY / 보안 (Security Reviewer):
  1. Invoke forge:security skill / 보안 스킬 실행
  2. OWASP Top 10, secrets scan, auth/authz review / OWASP Top 10, 시크릿 스캔, 인증/인가 검토
  3. Security issues = blockers → Phase 6 / 보안 이슈 = 블로커 → 6단계

Phase 6 — FIX LOOP / 수정 루프 (Fact Checker + Devs + Troubleshooter):
  1. Invoke forge:fix skill / 수정 스킬 실행
  2. Simple issues: fact-check → dev fix → QA re-verify / 단순 이슈: 팩트체크 → 개발자 수정 → QA 재검증
  3. Complex issues: troubleshooter RCA → dev fix → QA re-verify / 복잡 이슈: 근본원인 분석 → 수정 → 재검증
  4. Max 3 iterations on the same blocker before CEO escalates to the client with alternatives / 같은 블로커가 3회 초과 시에만 CEO가 고객에게 대안 제시
  5. All blockers resolved → Phase 7 / 모든 블로커 해결 → 7단계

Phase 7 — DELIVERY / 납품 (CEO + Tech Writer):
  1. Invoke forge:deliver skill / 딜리버리 스킬 실행
  2. Tech writer generates docs (README, API docs, deploy guide) / 테크라이터가 문서 생성
  3. QA + Security + CEO confirm delivery readiness / QA + 보안 + CEO가 납품 가능 상태 확인
  4. CEO compiles delivery report and presents it to the client for final review / CEO가 최종 납품 보고서를 고객에게 제출
</Steps>

<State_Management>
On first invocation, create .forge/ directory:

.forge/
├── state.json      ← current phase, progress, active agents, artifact_versions, staleness
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
├── lessons/        ← harness learning: lessons from QA, fixes, and delivery
└── delivery-report/← final delivery docs

state.json includes `artifact_versions` and `staleness` fields for constraint propagation.
See `references/constraint-propagation.md` for the full protocol.
</State_Management>

<Dashboard>
After each major transition, show progress to the client in customer language. Internal
status may be richer than what is shown externally:

Forge Progress / 진행 현황:
┌─────────────────────────────────┐
│ Phase: N/{max} ({phase_name})   │
│ ████████░░░░ XX%               │
│                                │
│ ✅ Completed / 완료             │
│ 🔄 In Progress / 진행 중        │
│ ⏳ Pending / 대기 중             │
│                                │
│ Known Issues / 알려진 이슈: N   │
│ Needs Client Input / 고객 확인 필요: N │
└─────────────────────────────────┘
</Dashboard>

<Rollback>
Each Phase completion creates a git tag:
  forge/v{N}-{phase_name}

Client can request rollback:
  "아까 디자인이 더 나았어요" → rollback to forge/v1-design → continue from Phase 2
</Rollback>

<Tool_Usage>
- Use Agent tool to dispatch team members (CEO, PM, CTO, etc.)
- Use TaskCreate/TaskUpdate for work tracking
- Use Bash for git operations (worktree, branch, tag, merge)
- Use Write for .forge/ state files
- Use Read for loading specs, contracts, code-rules
- Do NOT use tools without evidence (PreToolUse guard may deny code writes when harness prerequisites are missing)
- Treat the customer as the client, not the internal project manager
</Tool_Usage>
