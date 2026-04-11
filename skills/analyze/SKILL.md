---
name: analyze
description: "Run codebase analysis via Analyst agent. Triggers: \"forge analyze\", \"analyze codebase\", \"code analysis\", \"architecture analysis\", \"impact analysis\", \"dependency trace\", and first-principles redesign requests that need an assumption audit plus execution plan."
---

<Purpose>
On-demand codebase analysis using the Analyst agent and host-provided
codebase-memory-mcp tools when available.
Produces architecture maps, impact reports, dependency traces, or quality assessments
depending on what the user asks for. Can run standalone or feed results into an active
Forge phase (design, develop, fix).

This skill must produce a durable analysis artifact and analysis metadata, not just
an ephemeral chat answer.

When the user is stuck in obvious solutions, the analysis must follow a harness-engineering
shape instead of a generic review:
1. First-principles reframe: identify assumptions, separate physical constraints from habit,
   and redesign around the irreducible core.
2. Execution plan and risk management: turn the redesign into concrete actions, failure points,
   and repeat-mistake checkpoints.

Forge does not bundle codebase-memory-mcp servers in the package manifest. If the active
host does not provide them, the Analyst must downgrade to direct file/module inspection
with explicit confidence notes instead of pretending graph-backed precision.
</Purpose>

<Use_When>
- User asks "forge analyze", "analyze this codebase", "code analysis"
- KO: "코드 분석", "아키텍처 분석"  JA: "コード分析", "アーキテクチャ分析"  ZH: "代码分析", "架构分析"
- User wants architecture mapping before making changes
- User asks "what would break if I change X?"
- User asks about dependencies, coupling, dead code, or complexity
- User asks for design improvement, UX improvement, redesign, usability improvement, or flow improvement
- During design phase to map existing code before architecture decisions
- During fix/troubleshoot to trace dependencies for root cause analysis
</Use_When>

<Do_Not_Use_When>
- User wants external library/framework research (use Researcher instead)
- User wants to verify a specific technical claim (use Fact-Checker instead)
- User wants bug diagnosis with reproduction (use Troubleshooter instead)
</Do_Not_Use_When>

<Steps>

## 0. Ambiguity gate

Ask the user a question only if the analysis target is materially ambiguous and the result
would otherwise point at the wrong system, workflow, or failure mode.

Allowed examples:
- multiple plausible targets and no way to disambiguate from repo/runtime evidence
- the user says "this problem" but never names the subsystem, workflow, or symptom
- the request mixes product strategy and code diagnosis in a way that would change the output shape

Not allowed:
- asking for preferences that can be inferred from the repo
- pausing because several reasonable analysis paths exist
- handing the question back to the user when code inspection, runtime state, or an assumption table would resolve it

If ambiguity is internal rather than customer-owned, document the assumption and continue.

## 1. Determine analysis type

Based on the user's request, select one or more:

| Request | Analysis Type | Primary Tool |
|---------|--------------|--------------|
| "architecture analysis", "map the codebase" | Architecture Mapping | get_architecture, search_graph |
| "what breaks if I change X?", "impact analysis" | Impact Analysis | trace_call_path, detect_changes |
| "dependency trace", "who calls X?" | Dependency Tracing | trace_call_path, query_graph |
| "code quality", "dead code", "complexity" | Quality Assessment | search_graph (degree filters) |
| "problem is obvious", "rethink this", "redesign from first principles" | First-Principles Redesign | Analyst + repo/runtime evidence |
| "design improvement", "UX improvement", "redesign", "improve the flow" | Design-Improvement Analysis | Analyst + repo/runtime evidence |
| "why does this harness keep asking / stopping / under-using agents?" | Behavioral Audit | Runtime + event evidence |
| No specific request | Architecture Mapping (default) | get_architecture |

## 2. Ensure codebase is indexed

Check if codebase-memory-mcp has current data:
- Use index_status to check freshness
- If stale or unindexed: run index_repository first
- If recently indexed: proceed directly

## 2b. Check graph health before trusting graph-only conclusions

Before choosing the analysis path, inspect whether the current graph is sufficient
for the requested mode.

- If function/call relationships are sparse or absent:
  - downgrade impact/dependency analysis to file/module scope
  - use `search_code` and LSP/grep fallback
  - report confidence explicitly
- Never present precise caller/callee claims when the graph cannot support them

## 3. Dispatch Analyst

Dispatch the Analyst agent (forge:analyst) with the selected analysis type:

```
Agent(subagent_type="forge:analyst", prompt="Run {analysis_type} on {target}")
```

The Analyst uses codebase-memory-mcp tools:
- **get_architecture** — module structure, layer boundaries
- **search_graph** — find functions, classes, routes and relationships
- **trace_call_path** — call chains, dependency trees, impact radius
- **query_graph** — custom Cypher queries for complex patterns
- **detect_changes** — what changed and blast radius
- **search_code / LSP fallback** — when graph fidelity is too weak for symbol-level confidence

## 4. Capture Analyst output (AnalystReport v1 JSON only)

The Analyst agent MUST emit a single JSON block conforming to
`.forge/contracts/analyst-report.ts` (the `AnalystReport` discriminated union).
No free-form markdown templates. The shape is mechanically enforced by
`scripts/lib/forge-analyst-schema.mjs::validateAnalystReport`, which is called
in Step 5 before the record is accepted — if the payload does not match the
contract, `record-analysis` exits non-zero and you must re-dispatch the
Analyst with the error message so it can fix its output.

Envelope fields (required on every kind):

- `version: '1'`
- `kind`: one of `architecture | impact | dependency | quality | first-principles | design-improvement | behavioral-audit`
- `generated_at` (ISO 8601), `target`, `graph_health`, `confidence`,
  `risk_level`, `locale`, `summary`
- `body`: kind-specific object (see contract for required fields per kind)
- `recommendations`: array of `{ priority, action, owner_role? }`

Analyses with design, workflow, or problem-framing weight still need the
first-principles reframe + execution plan substance — that substance lives
inside `body` for the `first-principles` and `design-improvement` kinds
(`assumptions`, `essence`, `inverted_design`, `action_plan`, `verification`,
etc). Do not re-format it as markdown before saving; downstream consumers
read the JSON directly.

## 5. Persist + validate (mandatory if Forge project is active)

If a Forge project is active (.forge/state.json exists):

1. Write the raw JSON payload (a fenced ```json block is acceptable — the
   validator's `extractJson` handles both raw and fenced forms) to the
   kind-appropriate artifact path:
   - `.forge/design/codebase-analysis.md` for
     architecture / impact / dependency / quality / first-principles
   - `.forge/design/ux-analysis.md` for `design-improvement`
   - `.forge/evidence/behavioral-audit.md` for `behavioral-audit`
2. Immediately record + validate via:
   `node scripts/forge-lane-runtime.mjs record-analysis --type <kind> --target <target> --artifact <artifact-path> --locale <ko|en|ja|zh> --graph-health <health> --confidence <level> --risk <level> --summary "<summary>"`
3. If the CLI exits non-zero, treat as failure: do NOT advance the phase, do
   NOT hand off downstream. Read the stderr message (it will start with
   `record-analysis rejected for ... AnalystReport v1 validation failed:
   ...`), then re-dispatch the Analyst with the error so it can correct the
   payload. Legacy free-form markdown is explicitly rejected by the validator.
4. On success, CTO, Lead, or Troubleshooter can reference the validated
   artifact in their phase work. Use
   `node scripts/forge-lane-runtime.mjs analysis-status --json` when checking
   freshness before design/develop/fix.
5. If the kind is `design-improvement` and the validated record was accepted,
   immediately hand off to `forge:design` in UX-opening mode.

</Steps>

<Tool_Usage>
- Use Agent tool to dispatch forge:analyst
- Analyst uses codebase-memory-mcp tools internally
- Results saved to .forge/design/codebase-analysis.md if Forge project is active
- For quick queries, Analyst can run without full Forge project context
- Ask the user only when the ambiguity gate in Step 0 is tripped
</Tool_Usage>

<State_Changes>
- If Forge project active: updates `.forge/design/codebase-analysis.md`, `.forge/design/ux-analysis.md`, or `.forge/evidence/behavioral-audit.md`
- No phase transition — this is an on-demand utility, not a phase gate
</State_Changes>
