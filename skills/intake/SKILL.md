---
name: intake
description: "Use when Forge receives a new project request. CEO evaluates feasibility, scope, and information completeness before starting discovery."
---

<Purpose>
Phase 0 of the Forge pipeline. The CEO evaluates the client's request to decide
if it's something we can build, if the scope is reasonable, and if we have enough
critical information to begin the discovery process. The CEO acts as the internal
operator for the company, not as a messenger waiting for customer approval at every step.
Intake is the only phase that is allowed to spend noticeable question budget on the user.
After intake, Forge should behave like a harness engineering system: configure the runway,
start the work, and keep moving unless a real customer-owned blocker exists.
</Purpose>

<Use_When>
- Automatically invoked by forge:ignite skill at Phase 0
- Client submits a new project request
</Use_When>

<Fast_Path_Check>
Before full internal deliberation, CEO does a quick scope assessment.

**Auto-express triggers** (route directly to express, no deliberation, no full pipeline):
- Bug fix prompt: matches `fix`, `bug`, `error`, `failing test`, `not working`, KO `고쳐`, `버그`, JA `直し`, `バグ`, ZH `修复`, `bug` AND scope appears bounded (≤3 files, no architecture decisions)
- Single-feature change with explicit scope (file/module named in prompt)
- "Quick", "simple", "express", "small" keywords (any language)
- Documentation or config-only edit

**Full-pipeline triggers**:
- Multi-system integration (auth + db + API + UI)
- Security/compliance-sensitive change (auth, payments, PII, secrets)
- User explicitly asks for full process ("full forge", "discovery", "design first")
- Greenfield product ("build me an app that…")

**Default for ambiguous bug fixes**: prefer express. Bias toward less process — if QA later finds the scope was bigger, escalate then. Over-processing a 1-file fix is itself a defect (this rule reverses the prior "prefer full pipeline" default after benchmark feedback showed a 77% test-line inflation on routine bug fixes).

**Express routing action**:
1. CEO acknowledges the request
2. Initialize .forge/ with mode appropriate to request (build/repair/express)
3. Set tier to "medium"
4. Route directly to next phase (express → forge:express, repair → troubleshooter)

**Otherwise**: Proceed with full internal deliberation below.
</Fast_Path_Check>

<Express_Interview>
When express fast-path is active, collapse the PM interview:
- Instead of 5 rounds of questions, do 1-2 rounds max
- Round 1: "What are you building or fixing? Any specific constraints?"
- Round 2 (if needed): "Anything else before we start?"
- Then generate minimal spec and proceed
</Express_Interview>

<Steps>
0. **Pre-flight: workspace freshness** (prevents prior-run state contamination WITHOUT discarding paused long-running projects)
   a. Run `node -e "import('./scripts/lib/session-cleanup.mjs').then(m=>console.log(JSON.stringify(m.detectStaleForgeWorkspace(process.cwd()))))"` (or read `.forge/runtime.json` `stats.last_finished_at`)
   b. **Long-term memory is sacred** — `state.json`, `runtime.json`, `spec.md`, `design/`, `contracts/`, `plan.md`, `holes/`, `lessons/`, `evidence/`, `knowledge/` are NEVER auto-deleted. Only `.forge/sessions/*.jsonl` (>1h) is auto-pruned because that's the actual contamination vector.
   c. Decide based on tier:
      - **absent**: proceed normally (this is a brand-new project)
      - **fresh** (<1h): the prior session is almost certainly the same project. Invoke `forge:continue` instead of intake.
      - **warm** (1h–24h): the prior session is likely the same project. Default to `forge:continue`. Only ask the client if their new request semantically diverges from the existing `state.json` `project_name` / `spec.md` summary.
      - **stale** (≥24h): the project may be paused or abandoned. **Ask the client ONE question** — "Found a prior Forge project (`{project_name}`, last touched `{ts}`, phase `{phase}`). Resume, or archive and start fresh?" Default = resume. NEVER auto-archive without explicit consent.
      - **orphanSessions > 0** alone: do nothing here — `cleanupSessionArtifacts` already prunes them on SessionStart. Not a reason to disturb the project.
   d. Honor `FORGE_FRESH=1` env var: explicit user override — archive and start fresh, no prompt.
   e. Archive only on consent or `FORGE_FRESH=1`. Use `archiveForgeWorkspace(cwd)` (moves to `.forge.archive-{ts}/` — data is preserved, not destroyed).
   f. After any decision (resume, ask, archive), proceed to step 1 only if the user chose fresh; otherwise yield to `forge:continue`.

1. Read the client's request

2. **Fast-path gate**: Apply <Fast_Path_Check> — if all conditions met, skip to step 5 with express routing

3. Dispatch CEO agent to evaluate (full deliberation):
   a. Technical feasibility — Can this be built with available tools/frameworks?
   b. Scope assessment — Is this one project or should it be split into V1/V2?
   c. Information completeness — Do we have enough critical information to start safe discovery?

4. CEO Decision:
   - GO → Initialize .forge/ directory, set state.json phase=1, hand off to PM
   - HOLD → CEO asks the client only for missing business-critical information that cannot be
     inferred internally and would change the product direction or execution mode
   - NO-GO → CEO explains why and suggests alternatives
   Note: For REPAIR mode, after CEO evaluation, dispatch the Troubleshooter for diagnosis (aligned with ignite/SKILL.md repair routing).

5. Initialize project state:
   a. Create .forge/ directory structure:
      .forge/state.json, .forge/runtime.json, .forge/design/, .forge/contracts/, .forge/evidence/,
      .forge/holes/, .forge/tasks/, .forge/worktrees/,
      .forge/knowledge/, .forge/lessons/, .forge/delivery-report/
   b. Copy templates/state.json → .forge/state.json
   c. Initialize `.forge/runtime.json` for helper-backed company coordination:
      - lanes / lane graph
      - active_worktrees
      - next_lane
      - internal gate metadata
      - blocker / readiness metadata
      - helper/runtime metadata
   d. Fill in project name, client name, created_at
   e. Set phase=1, phase_id="discovery", phase_name="discovery", status="active"

6. **REPAIR baseline bootstrap** — run ONLY when `state.mode === 'repair'`:
   The write-gate (`scripts/write-gate.mjs:319-325`) requires `.forge/code-rules.md` and
   at least one file in `.forge/contracts/` for medium+ tier high-risk writes. In repair
   mode these artifacts are never produced by a design phase, so the CEO MUST generate
   minimal stubs during intake to prevent write-gate self-deadlock. This is intentional
   prompt-only enforcement (see references/DECISIONS.md → "repair baseline generation").

   a. **Scan existing codebase conventions** and write `.forge/code-rules.md`:
      - Read the closest lint/format config (eslint, biome, prettier, tsconfig, ruff, etc.)
      - Extract naming conventions from 3-5 existing source files in the affected module
      - Minimum sections: `## Naming Conventions` and `## Rules` (enforced by phase gate regex)
      - Minimum 100 bytes; placeholder "# Repair baseline (auto-generated)" is acceptable
        when the target codebase has no discoverable conventions
   b. **Generate contract stubs** in `.forge/contracts/`:
      - Scan existing `types/`, `*.d.ts`, or public API surfaces for interfaces touched by the repair
      - Copy or symlink at least one `.ts`/`.json`/`.mjs`/`.zod` file into `.forge/contracts/`
      - If no typed surfaces exist, write a placeholder `contracts/repair-scope.json` documenting
        which functions/modules are in scope (satisfies write-gate contracts[] check)
   c. **Document the bootstrap** in `.forge/evidence/repair-baseline.md`:
      - Which config was scanned, which files were sampled, which surfaces were captured as contracts
      - This provides audit trail for the fact-checker during fix phase

7. Transition to Phase 1 (forge:discovery) for BUILD; forge:troubleshoot for REPAIR;
   forge:express for EXPRESS (see Auto_Chain below).
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
- Asking multiple exploratory questions when one routing question or an internal assumption would suffice
- Not creating the full .forge/ directory structure
</Failure_Modes_To_Avoid>

<Auto_Chain>
When intake completes (CEO approves and .forge/ is initialized):
- BUILD mode: update state.json phase_id to "discovery", then IMMEDIATELY invoke Skill: forge:discovery
- REPAIR mode: update state.json phase_id to "reproduce", then IMMEDIATELY invoke Skill: forge:troubleshoot
- EXPRESS mode: update state.json phase_id to "plan", then IMMEDIATELY invoke Skill: forge:express
Do NOT stop, summarize, or ask the user. The pipeline must continue autonomously.
</Auto_Chain>
