# Codex Packaged Hook Smoke

Date: 2026-04-08
Scope: Installed-copy Codex wrapper execution from a project-local Forge install
Status: PASS

## Intent

Reduce the remaining Codex packaging risk by proving that an installed Forge copy
can execute packaged hook commands through the repository-root wrapper without
relying on `${CLAUDE_PLUGIN_ROOT}`.

This is not a claim that a live Codex host emits every lifecycle event.
It is a reproducible installed-copy smoke proving that the packaged hook route is
valid once an event payload is delivered.

## Procedure

1. Create a temporary project root.
2. Run `node scripts/setup-plugin.mjs --scope project --project-root <tmp> --mode copy`.
3. Write a minimal `.forge/state.json` with `phase_id=develop`.
4. Execute the installed wrapper with `CODEX_THREAD_ID=codex-thread-smoke`:
   `node <tmp>/.forge/plugins/forge/hooks/run-hook.mjs state-restore`
5. Execute the installed wrapper again for prompt submission:
   `node <tmp>/.forge/plugins/forge/hooks/run-hook.mjs phase-detector`
6. Inspect `<tmp>/.forge/runtime.json`.

## Observed Results

- `SessionStart` returned `hookSpecificOutput.hookEventName = "SessionStart"`.
- `UserPromptSubmit` returned `hookSpecificOutput.hookEventName = "UserPromptSubmit"`.
- The generated runtime recorded:
  `host_context.current_host = "codex"`
- The generated runtime recorded:
  `host_context.last_event_name = "prompt.submit"`
- The generated runtime exposed a continue directive instead of failing on
  packaged path resolution.

## Conclusion

Verified:

- Codex package commands can route through `./hooks/run-hook.mjs`
- Installed-copy wrapper execution works under `CODEX_THREAD_ID`
- Hook output and runtime host context remain coherent after packaged execution

Not verified:

- Real Codex host emission for every lifecycle event family
- Subagent lifecycle parity
- Stop interception parity
- Full live-host hook lifecycle parity
