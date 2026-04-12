<Purpose>
User-facing entry point for Forge Researcher. Dispatches the forge:researcher
agent for external investigation, comparison analysis, and decision-ready briefs.
</Purpose>

<Use_When>
- User invokes /forge:researcher or says "research", "compare options"
- User asks to evaluate external tools, libraries, repos, or approaches
- User wants a structured comparison before committing to a decision
- KO: "조사해줘", "비교해줘", "리서치"  JA: "調査して", "比較して"  ZH: "调查一下", "比较一下"
</Use_When>

<Do_Not_Use_When>
- User wants internal codebase analysis (use forge:analyze instead)
- User wants to verify a specific technical claim (use forge:fact-checker via other phases)
- User wants bug diagnosis (use forge:troubleshoot)
</Do_Not_Use_When>

<Steps>
1. Parse the user's research question. If the target is ambiguous (multiple plausible
   interpretations that would produce different research), ask ONE clarifying question.
   Otherwise proceed.

2. Dispatch the forge:researcher agent:
   ```
   Agent(subagent_type="forge:researcher", prompt="<research brief with question, constraints, desired output format>")
   ```

3. When the researcher returns, present the research brief to the user.
   If a Forge project is active (.forge/state.json exists), also save to
   `.forge/knowledge/research-{topic}.md`.

4. If the research naturally leads to a Forge action (e.g., "adopt pattern X"),
   suggest the appropriate next step (forge:ignite, forge:express, forge:design)
   but do not auto-chain — let the user decide.
</Steps>

<Tool_Usage>
- Agent tool: dispatch forge:researcher
- Write tool: save research brief to .forge/knowledge/ if project active
- Read tool: load .forge/state.json to check project context
</Tool_Usage>

<State_Changes>
- If Forge project active: creates .forge/knowledge/research-{topic}.md
- No phase transition — this is an on-demand utility
</State_Changes>
