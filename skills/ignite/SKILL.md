---
name: ignite
description: MANDATORY Forge entry point. Use when the user explicitly says "forge", "포지", "build a harness", "set up Forge", asks Forge to build a new product, or asks Forge to diagnose/fix/analyze an existing project. If the request is for a phased team workflow, build-vs-repair routing, or harness-based execution, you must start here.
---

<Purpose>
Forge is a Virtual Software Company. Ignite is the universal entry point.
Two modes:
- BUILD mode: idea → spec → design → development → QA → delivery
- REPAIR mode: existing project → diagnosis → fix → QA → delivery

The CEO evaluates the request and routes to the right mode.
</Purpose>

<Use_When>
- User invokes /forge:ignite or says "forge"
- BUILD: "~~ 만들어줘", "build me a ~~", "I want an app that ~~"
- REPAIR: "이거 고쳐줘", "오류 분석해줘", "fix this bug", "왜 안 돼?"
- User wants team-based development or debugging
</Use_When>

<Do_Not_Use_When>
- User is already in a Forge session (use phase-specific skills like forge:resume)
- Trivial one-line change that doesn't need team process
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
- Load `references/phase-map.md` for the compact phase sequence.
- Load `references/harness-ab-eval.md` when asked to prove Forge's value against a baseline.
</Execution_Policy>

<Steps>
Phase 0 — INTAKE / 접수 (CEO):
  1. Read the client's request / 의뢰인 요청 확인
  2. CEO agent evaluates and ROUTES / CEO가 평가 후 라우팅:

     [BUILD mode] — new product request
      "만들어줘", "build me", idea description
      → Can we build this? Scope reasonable?
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

  3. If unclear which mode → ask the client
  4. BUILD: initialize .forge/ directory with state.json, hand off to PM
  5. REPAIR: initialize .forge/ with mode="repair", hand off to Troubleshooter

Phase 1 — DISCOVERY / 발견 (PM):
  1. Invoke forge:discovery skill / 디스커버리 스킬 실행
  2. PM interviews client one question at a time / PM이 질문으로 요구사항 파악
  3. Generate spec.md from template / spec.md 생성
  4. Open Questions must reach 0 / 미해결 질문 0건 달성
  5. CEO reviews spec → client approves → Phase 2 / CEO 검토 → 의뢰인 승인 → 2단계

Phase 2 — DESIGN / 설계 (CTO + Designer):
  1. Invoke forge:design skill / 디자인 스킬 실행
  2. CTO: architecture + code-rules.md + interface contracts / CTO: 아키텍처 + 코드 규칙 + 인터페이스 계약
  3. Designer: UI/UX spec + component definitions / 디자이너: UI/UX 사양 + 컴포넌트 정의
  4. Cross-review between CTO and Designer / CTO-디자이너 교차 검토
  5. Fact checker validates all technical claims via context7 / 팩트체커가 기술 주장 검증
  6. Client approves design → Phase 3 / 의뢰인 설계 승인 → 3단계

Phase 3 — DEVELOPMENT / 개발 (Lead + Devs + Publisher):
  1. Invoke forge:develop skill / 개발 스킬 실행
  2. Lead splits work into tasks, creates git worktrees / 리드가 작업 분할, 워크트리 생성
  3. Each developer/publisher works in isolated worktree / 개발자별 격리된 워크트리에서 작업
  4. PR-based merge with 3-tier review (auto → lead → CTO) / PR 기반 머지, 3단계 리뷰
  5. Code rules enforced — inconsistent code is REJECTED / 코드 규칙 위반 시 거부
  6. All PRs merged → Phase 4 / 모든 PR 머지 → 4단계

Phase 4 — QA / 품질보증 (QA Engineer):
  1. Invoke forge:qa skill / QA 스킬 실행
  2. Functional, visual, contract, regression, edge-case testing / 기능, 시각, 계약, 회귀, 엣지케이스 테스트
  3. Issues → bug tracker (.forge/holes/) / 이슈 → 버그 트래커
  4. Blockers → Phase 5, No blockers → Phase 4.5 / 블로커 → 5단계, 없으면 → 4.5단계

Phase 4.5 — SECURITY / 보안 (Security Reviewer):
  1. Invoke forge:security skill / 보안 스킬 실행
  2. OWASP Top 10, secrets scan, auth/authz review / OWASP Top 10, 시크릿 스캔, 인증/인가 검토
  3. Security issues = blockers → Phase 5 / 보안 이슈 = 블로커 → 5단계

Phase 5 — FIX LOOP / 수정 루프 (Fact Checker + Devs + Troubleshooter):
  1. Invoke forge:fix skill / 수정 스킬 실행
  2. Simple issues: fact-check → dev fix → QA re-verify / 단순 이슈: 팩트체크 → 개발자 수정 → QA 재검증
  3. Complex issues: troubleshooter RCA → dev fix → QA re-verify / 복잡 이슈: 근본원인 분석 → 수정 → 재검증
  4. Max 3 iterations, then CEO reports to client with alternatives / 최대 3회 반복, 초과 시 CEO가 대안 제시
  5. All blockers resolved → Phase 6 / 모든 블로커 해결 → 6단계

Phase 6 — DELIVERY / 납품 (CEO + Tech Writer):
  1. Invoke forge:deliver skill / 딜리버리 스킬 실행
  2. Tech writer generates docs (README, API docs, deploy guide) / 테크라이터가 문서 생성
  3. CEO compiles delivery report / CEO가 납품 보고서 작성
  4. Present to client: coverage %, known issues, test results / 의뢰인에게 제출: 커버리지, 이슈, 테스트 결과
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
│ Needs Approval / 승인 필요: N   │
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
- Do NOT use tools without evidence (PreToolUse guard may deny code writes when harness prerequisites are missing)
</Tool_Usage>
