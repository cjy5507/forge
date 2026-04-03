---
name: design
description: "Use when Forge reaches the design phase or the user asks for technical architecture, UI spec, contracts, or code rules before implementation. Trigger on requests for architecture design, component specification, design tokens, interface contracts, or phased pre-build planning."
---

<Purpose>
Phase 2 of the Forge pipeline. CTO and Designer collaborate in parallel to produce
architecture, code rules, interface contracts, and design specs. Researcher supports
them when external option comparison is needed, but CTO and Designer keep decision
ownership. Every technical claim is verified via context7 before being committed to
the design. No guessing — only evidence-backed decisions. In Autonomous Company Mode,
design is an internal readiness gate by default, not a customer approval checkpoint.
</Purpose>

<Use_When>
- After Phase 1 (discovery) completes
- state.json phase=2
</Use_When>

<Core_Rules>
1. CTO MUST use context7 to verify every framework pattern before deciding
   - No "I think Next.js supports..." — look it up, cite the doc
   - If context7 can't confirm it, flag it as unverified

2. Use Researcher before locking external choices that are still open
   - Researcher compares viable frameworks, packages, vendors, or service options
   - CTO still makes the final architecture call

3. Designer MUST define every component completely:
   - Size, color, spacing, typography, border radius
   - All states: default, hover, active, disabled, loading, error, empty
   - Responsive breakpoints: mobile, tablet, desktop

4. CTO and Designer MUST cross-review each other's work
   - CTO reviews design feasibility: can this be built with chosen stack?
   - Designer reviews architecture: does it support all UI needs?

5. If design and tech conflict → resolve internally first
   - Never silently drop a feature because it's "hard"
   - Never force a design that the architecture can't support
   - Escalate to the client only if the blocker is truly customer-owned:
     - unresolved business priority
     - subjective direction with no responsible default
     - incompatible requirements that only the client can choose between

6. code-rules.md MUST have examples (good + bad) for every rule:

   Example format:
   ```
   Rule: Component files use PascalCase

   GOOD:
   UserProfile.tsx
   PaymentForm.tsx

   BAD:
   userProfile.tsx
   payment-form.tsx
   ```
</Core_Rules>

<Progressive_Disclosure>
- Load `references/design-deliverables.md` for the complete deliverable and cross-review checklist.
- Load `references/research-integration.md` when discovery hands off research or design needs external option comparison.
</Progressive_Disclosure>

<Steps>
1. Dispatch CTO agent and Designer agent in parallel
   - Dispatch Researcher in parallel only when discovery handed off an open research brief or a design decision depends on outside option comparison
   - Researcher informs the choice; CTO still decides

2. CTO produces:
   a. .forge/design/architecture.md
      - Tech stack with version numbers (verified via context7)
      - Directory structure
      - Data flow diagram (text-based)
      - API route inventory
      - State management strategy
   b. .forge/code-rules.md
      - Naming conventions (files, variables, components)
      - Import ordering rules
      - Error handling patterns
      - Each rule with GOOD + BAD examples
   c. .forge/contracts/*.ts
      - TypeScript interfaces for all shared boundaries
      - API request/response types
      - Database model types
      - Component prop types

3. Designer produces:
   a. .forge/design/components.md
      - Component inventory (every UI element)
      - Per-component spec: size, color, spacing, states
      - Interaction patterns (click, hover, drag, swipe)
      - Accessibility requirements (ARIA roles, keyboard nav)
   b. .forge/design/tokens.json
      - Color palette (primary, secondary, neutral, semantic)
      - Typography scale (font family, sizes, weights, line heights)
      - Spacing scale (4px base grid)
      - Border radius values
      - Shadow definitions
      - Breakpoints

4. Cross-review:
   - CTO reviews Designer output:
     "Can I build every component with the chosen stack?"
     "Are animations/interactions feasible within performance budget?"
   - Designer reviews CTO output:
     "Does the architecture support all screens and flows?"
     "Are the contracts complete for every UI component?"
   - If Researcher was used, CTO folds the brief into the architecture rationale and flags any remaining unknowns

5. Internal design-readiness gate:
   - CTO confirms the architecture is implementable at the chosen scale
   - Designer confirms the design covers required flows and states
   - Fact checker confirms technical claims are evidence-backed
   - If the gate fails, revise internally before moving on
   - Escalate to the client only for genuine customer-owned blockers

6. Fact checker validates all technical claims:
   - Every package referenced exists and is at claimed version
   - Every API pattern works as described (verified via context7)
   - Every TypeScript type is syntactically valid
   - Every framework feature is available in the chosen version

7. Optional client check-in only when needed:
   - If a real business-level design blocker remains, present it clearly in customer language
   - Otherwise keep the design decision internal and proceed

8. Internal design readiness passes → update state.json: phase=3, phase_id="develop", phase_name="develop", design_approved=true
   - Update company runtime for implementation:
     `node scripts/forge-lane-runtime.mjs set-company-gate --gate implementation_readiness --gate-owner lead-dev --delivery-state in_progress`
   - Update session handoff toward implementation:
     `node scripts/forge-lane-runtime.mjs set-session-brief --goal "Prepare reviewable implementation lanes" --next-owner lead-dev --handoff "{summary}"`

9. Create git tag: forge/v1-design

10. Transition to Phase 3 (forge:develop)
</Steps>

<Scale_Decision>
Project size determines architecture depth:

| Size   | Pages | Architecture Approach                              |
|--------|-------|----------------------------------------------------|
| Small  | 1-3   | Single Next.js app, flat structure, minimal abstraction |
| Medium | 4-10  | Feature-based folders, shared lib, API route layer  |
| Large  | 10+   | Monorepo (Turborepo), shared packages, strict contracts |

CTO determines size from spec.md and applies the matching approach.
Over-engineering a small project is as bad as under-engineering a large one.
</Scale_Decision>

<State_Changes>
- Creates: .forge/design/architecture.md
- Creates: .forge/design/components.md
- Creates: .forge/design/tokens.json
- Creates: .forge/contracts/*.ts
- Creates: .forge/code-rules.md
- Updates: .forge/state.json (phase=3, design_approved=true)
- Updates: .forge/runtime.json (implementation_readiness gate + next session brief)
- Creates: git tag forge/v1-design
</State_Changes>

<Tool_Usage>
- Agent tool: dispatch forge:cto and forge:designer in parallel
- Agent tool: dispatch forge:researcher for bounded external option research
- Agent tool: dispatch forge:cto for design feasibility review
- Agent tool: dispatch forge:designer for architecture UI review
- context7 MCP: verify every framework pattern, package version, API behavior
- Write tool: create design files, contracts, code-rules
- Read tool: load .forge/spec.md for requirements reference
- Edit tool: update .forge/state.json
- Bash tool: git tag forge/v1-design
</Tool_Usage>

<Failure_Modes_To_Avoid>
- CTO guessing framework behavior without verifying via context7
- Locking stack or vendor choices before reviewing needed Researcher evidence
- Designer skipping component states (only defining "happy path" appearance)
- Skipping cross-review between CTO and Designer
- Escalating internal design decisions to the client too early
- Proceeding to Phase 3 without internal design-readiness
- code-rules.md with rules but no GOOD/BAD examples
- Contracts missing request/response types for API routes
- Design tokens without responsive breakpoints
- Over-engineering a small project or under-engineering a large one
- Letting Researcher replace CTO decision-making
</Failure_Modes_To_Avoid>
