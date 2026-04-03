---
name: intake
description: "Use when Forge receives a new project request. CEO evaluates feasibility, scope, and information completeness before starting discovery."
---

<Purpose>
Phase 0 of the Forge pipeline. The CEO evaluates the client's request to decide
if it's something we can build, if the scope is reasonable, and if we have enough
critical information to begin the discovery process. The CEO acts as the internal
operator for the company, not as a messenger waiting for customer approval at every step.
</Purpose>

<Use_When>
- Automatically invoked by forge:ignite skill at Phase 0
- Client submits a new project request
</Use_When>

<Steps>
1. Read the client's request

2. Dispatch CEO agent to evaluate:
   a. Technical feasibility — Can this be built with available tools/frameworks?
   b. Scope assessment — Is this one project or should it be split into V1/V2?
   c. Information completeness — Do we have enough critical information to start safe discovery?

3. CEO Decision:
   - GO → Initialize .forge/ directory, set state.json phase=1, hand off to PM
   - HOLD → CEO asks the client only for missing business-critical information
   - NO-GO → CEO explains why and suggests alternatives

4. Initialize project state:
   a. Create .forge/ directory structure:
      .forge/state.json, .forge/runtime.json, .forge/design/, .forge/contracts/, .forge/evidence/,
      .forge/holes/, .forge/tasks/, .forge/worktrees/, .forge/checkpoints/,
      .forge/knowledge/, .forge/delivery-report/
   b. Copy forge/templates/state.json → .forge/state.json
   c. Initialize `.forge/runtime.json` for helper-backed company coordination:
      - lanes / lane graph
      - active_worktrees
      - resume_lane
      - internal gate metadata
      - blocker / readiness metadata
      - helper/runtime metadata
   d. Fill in project name, client name, created_at
   e. Set phase=1, phase_id="discovery", phase_name="discovery", status="active"

5. Transition to Phase 1 (forge:discovery)
</Steps>

<State_Changes>
- Creates: .forge/ directory with all subdirectories
- Creates: .forge/state.json (from template)
- Creates: .forge/runtime.json (lane/runtime scaffold)
- Sets: phase=1 on GO decision
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:ceo agent for evaluation
- Write tool: create .forge/ files
- Bash tool: mkdir for directory structure
- Read tool: load templates
</Tool_Usage>

<Failure_Modes_To_Avoid>
- Starting Phase 1 without CEO approval
- Skipping the feasibility check
- Proceeding with a request that's clearly out of scope
- Asking the client to manage internal phase transitions
- Not creating the full .forge/ directory structure
</Failure_Modes_To_Avoid>
