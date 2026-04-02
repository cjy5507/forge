---
name: intake
description: Use when Forge receives a new project request. CEO evaluates feasibility, scope, and information completeness before starting discovery.
---

<Purpose>
Phase 0 of the Forge pipeline. The CEO evaluates the client's request to decide
if it's something we can build, if the scope is reasonable, and if we have enough
information to begin the discovery process.
</Purpose>

<Use_When>
- Automatically invoked by forge:forge skill at Phase 0
- Client submits a new project request
</Use_When>

<Steps>
1. Read the client's request

2. Dispatch CEO agent to evaluate:
   a. Technical feasibility — Can this be built with available tools/frameworks?
   b. Scope assessment — Is this one project or should it be split into V1/V2?
   c. Information completeness — Do we have enough to start asking detailed questions?

3. CEO Decision:
   - GO → Initialize .forge/ directory, set state.json phase=1, hand off to PM
   - HOLD → CEO asks client for missing high-level information
   - NO-GO → CEO explains why and suggests alternatives

4. Initialize project state:
   a. Create .forge/ directory structure:
      .forge/state.json, .forge/design/, .forge/contracts/, .forge/evidence/,
      .forge/holes/, .forge/tasks/, .forge/worktrees/, .forge/checkpoints/,
      .forge/knowledge/, .forge/delivery-report/
   b. Copy forge/templates/state.json → .forge/state.json
   c. Fill in project name, client name, created_at
   d. Set phase=1, phase_name="discovery", status="active"

5. Transition to Phase 1 (forge:discovery)
</Steps>

<State_Changes>
- Creates: .forge/ directory with all subdirectories
- Creates: .forge/state.json (from template)
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
- Not creating the full .forge/ directory structure
</Failure_Modes_To_Avoid>
