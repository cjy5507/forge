---
name: discovery
description: "Use when Forge begins requirements gathering. PM interviews the client one question at a time until all ambiguity is eliminated and a complete spec is produced."
---

<Purpose>
Phase 1 of the Forge pipeline. The PM conducts a structured interview with the client,
translating their idea into a complete, unambiguous spec. The client does NOT need to know
programming — the PM speaks their language and translates to technical requirements.
</Purpose>

<Use_When>
- Automatically invoked after Phase 0 (intake) approval
- state.json phase=1
</Use_When>

<Core_Rule>
NO AMBIGUITY, NO START.
This Phase does NOT end until Open Questions = 0.
If the client gives a vague answer, ask follow-up.
If answers contradict, point it out and resolve.
NEVER assume. ALWAYS ask.
</Core_Rule>

<Steps>
1. Dispatch PM agent in the main session (not as subagent — PM talks directly to client)

2. PM conducts interview following this flow:

   Round 1 — Big Picture:
   - "이 앱/서비스가 뭐하는 건가요? 한 문장으로 설명해주세요"
   - "주로 누가 사용하나요?"
   - "핵심 가치가 뭐예요? 사용자가 왜 이걸 쓰나요?"
   - "참고할 만한 앱이나 사이트 있으세요?"

   Round 2 — Features (one at a time):
   - For each user type: "이 사용자는 주로 뭘 하나요?"
   - "이 기능에서 에러가 나면 어떻게 되어야 하나요?"
   - "반드시 있어야 하는 기능과 나중에 해도 되는 기능을 나눠주세요"

   Round 3 — Constraints (one at a time):
   - "웹? 모바일? 둘 다?"
   - "디자인 느낌은? (a) 미니멀 (b) 화려한 (c) 참고할 앱 있으면 알려주세요"
   - "로그인이 필요한가요? 어떤 방식?"
   - "결제 기능이 필요한가요?"
   - "실시간 기능이 필요한가요? (채팅, 알림, 위치추적 등)"

   Round 4 — Validation:
   - Compile all answers into spec.md (using forge/templates/spec.md)
   - Show spec summary to client
   - "이 내용이 맞는지 확인해주세요"
   - Resolve any mismatches

3. Spec Completion Check:
   - Count Open Questions in spec
   - If > 0: continue interview
   - If = 0: proceed to approval

4. Approval Flow:
   a. CEO reviews spec (dispatch forge:ceo agent)
   b. CEO confirms scope is feasible
   c. Present final spec to client for sign-off
   d. Client approves → Update state.json: phase=2, phase_id="design", phase_name="design", spec_approved=true

5. Save spec to .forge/spec.md

6. Create rollback tag: git tag forge/v1-spec

7. Transition to Phase 2 (forge:design)
</Steps>

<Communication_Style>
- ONE question at a time
- Multiple choice when possible: "(a) ... (b) ... (c) ..."
- Simple Korean or English — no jargon
- Acknowledge ideas before asking next question
- If client is non-technical, never mention:
  frameworks, APIs, databases, endpoints, middleware, auth tokens
  Instead say: 로그인, 결제, 실시간, 알림, 페이지
</Communication_Style>

<State_Changes>
- Creates: .forge/spec.md
- Updates: state.json (phase=2, spec_approved=true)
- Creates: git tag forge/v1-spec
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:pm (main session, not subagent)
- Agent tool: dispatch forge:ceo for spec review
- Write tool: create .forge/spec.md
- Edit tool: update .forge/state.json
- Bash tool: git tag forge/v1-spec
- Read tool: load forge/templates/spec.md
</Tool_Usage>

<Failure_Modes_To_Avoid>
- Asking 3+ questions at once
- Using technical terms with non-technical clients
- Moving to Phase 2 with Open Questions > 0
- Assuming features the client didn't mention
- Not resolving contradictions in client answers
- Skipping CEO review before client sign-off
</Failure_Modes_To_Avoid>
