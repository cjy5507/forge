---
name: deliver
description: "Use when Forge delivers the completed product. Tech writer generates docs, CEO compiles delivery report with spec coverage and known issues."
---

<Purpose>
Phase 6 of the Forge pipeline. The final phase where the Tech Writer generates
comprehensive documentation and the CEO compiles a delivery report summarizing
spec coverage, test results, and known issues. The completed product is presented
to the client with full transparency.
</Purpose>

<Use_When>
- Automatically invoked after Phase 5 (fix) completes or Phase 4.5 (security) passes clean
- state.json phase=6
</Use_When>

<Steps>
1. Dispatch Tech Writer agent to generate documentation:

   a. README.md:
      - Project overview (from spec.md, non-technical)
      - Getting started (install, configure, run)
      - Environment variables required
      - Available scripts (dev, build, test, lint)
      - Project structure overview
      - Tech stack summary

   b. API Documentation (if API routes exist):
      - For each API route:
        - Method, path, description
        - Request parameters/body (from contracts)
        - Response format (from contracts)
        - Error responses
        - Authentication requirements
      - Save to .forge/delivery-report/api-docs.md

   c. Component Documentation (if UI components exist):
      - For each shared/reusable component:
        - Props interface (from contracts)
        - Usage examples
        - Available variants/states
      - Save to .forge/delivery-report/component-docs.md

   d. Deployment Guide:
      - Environment setup
      - Build commands
      - Deployment steps (Vercel, Docker, etc. based on architecture)
      - Environment variable configuration
      - Post-deployment verification steps
      - Save to .forge/delivery-report/deploy-guide.md

2. CEO compiles Delivery Report (.forge/delivery-report/report.md):

   a. Spec Coverage Analysis:
      - Map every feature in spec.md to implementation status
      - Calculate coverage percentage: (implemented / total) * 100
      - List any descoped features with reason and V2 plan

   b. Test Results Summary:
      - Total tests: N (pass: N, fail: N, skip: N)
      - Test coverage percentage (if measurable)
      - QA test case results (from Phase 4)
      - Security audit results (from Phase 4.5)

   c. Known Issues (minor/cosmetic only — blockers are resolved):
      - List each known issue from .forge/holes/ with severity=minor or cosmetic
      - Impact assessment for each
      - Planned resolution timeline (V1.1 or V2)

   d. Architecture Summary:
      - Tech stack used
      - Key design decisions and rationale
      - Scalability considerations

   e. Handoff Notes:
      - How to extend the codebase
      - Key files and their responsibilities
      - Recommended next steps

3. Present delivery to client:
   a. Show spec coverage percentage prominently
   b. List completed features with checkmarks
   c. List known issues (minor only) with severity labels
   d. Show test results summary
   e. Provide all generated documentation links
   f. Ask: "배달 받으시겠습니까? / Do you accept the delivery?"

4. Client accepts → finalize delivery:
   a. Update state.json: phase=7, phase_id="complete", phase_name="complete", status="delivered"
   b. Create git tag: forge/v1-delivery
   c. Create version tag: forge/v0.1.0
   d. Final dashboard showing complete project summary

5. Client requests changes → route back to appropriate phase:
   - Feature change → Phase 1 (discovery) for spec amendment
   - Design change → Phase 2 (design)
   - Bug found → Phase 5 (fix)
</Steps>

<State_Changes>
- Creates: .forge/delivery-report/report.md
- Creates: .forge/delivery-report/api-docs.md (if applicable)
- Creates: .forge/delivery-report/component-docs.md (if applicable)
- Creates: .forge/delivery-report/deploy-guide.md
- Creates: README.md (project root)
- Updates: .forge/state.json (phase=7, phase_id="complete", phase_name="complete", status="delivered")
- Creates: git tag forge/v1-delivery
- Creates: git tag forge/v0.1.0
</State_Changes>

<Failure_Modes_To_Avoid>
- Delivering without documentation
- Inflating spec coverage percentage (counting partial implementations as complete)
- Hiding known issues from the client
- Not including deployment instructions
- Generating docs that reference non-existent files or APIs
- Not calculating actual spec coverage (just saying "done")
- Skipping the client acceptance step
- Creating version tag before client accepts delivery
- Forgetting to include environment variable documentation
- Not providing handoff notes for future development
</Failure_Modes_To_Avoid>
