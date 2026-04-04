# Forge

**A structured build-and-repair harness for long-running coding work.**

Forge gives coding agents phase discipline, ownership, and continuable state —
so work that spans sessions, days, or interruptions doesn't fall apart.

## The problem

Coding agents are fast but forgetful. On long-running tasks they lose track of
what was decided, who owns what, and where things broke. When a session ends,
context disappears. When it resumes, you re-explain everything.

Forge fixes this by writing project state to files — not chat history — and
structuring work into phases with explicit gates, so every session picks up
exactly where the last one stopped.

## Who this is for

- Multi-session projects where context loss is the bottleneck
- Teams that need an audit trail of specs, designs, and decisions
- Build or repair work that benefits from phase gates instead of open-ended prompting
- Parallel development where lane ownership and merge order matter

## Core UX

### `forge info` — see where you are

Shows current phase, what's blocking, and what to do next. One glance, not a wall of fields.

```
Forge: my-saas-app (build)
Phase 3/8 — develop
████████████░░░░ 55%

Active: auth-api, payment-ui. Blocked: db-schema (waiting on contract review)

Lanes: 2/5 done, 1 blocked
Issues: 1 blocker, 0 major, 2 minor
Tag: forge/v1-design
```

### `forge continue` — restore saved state and keep going

Restores saved workflow state from `.forge/` — phase, lane ownership, blockers,
handoff notes — and routes to the most actionable point. No re-prompting,
no re-explaining what you were doing.

```
Forge: my-saas-app
Phase 3/8 — develop
3 lanes active, 1 blocked (auth waiting on DB schema)

Next: Continue auth-api lane after resolving DB contract
```

It picks the right entry point automatically:
- **Blocker that needs your input?** Surfaces that first.
- **Internal blocker?** Routes to the owning team.
- **Active lane with handoff notes?** Loads that lane's worktree and task context.
- **None of the above?** Falls back to the current phase skill.

### `forge` — start a new project or fix an existing one

Forge detects whether you're building something new or fixing something broken,
and routes accordingly.

## Build and repair workflows

Forge runs two structured pipelines. Each phase has a defined input, output, and
gate — work doesn't advance until prerequisites are met.

### Build mode — new projects

```mermaid
graph LR
    A[Intake] --> B[Discovery]
    B --> C[Design]
    C --> D[Develop]
    D --> E[QA]
    E --> F[Security]
    F --> G{Blockers?}
    G -- yes --> H[Fix]
    H --> E
    G -- no --> I[Delivery]
```

| Phase     | What happens                                    | Output                    |
|-----------|-------------------------------------------------|---------------------------|
| Intake    | Evaluate scope, route to build mode              | `.forge/state.json`       |
| Discovery | Gather requirements, eliminate ambiguity          | `.forge/spec.md`          |
| Design    | Architecture, contracts, code rules, UI spec     | `.forge/design/`, `contracts/`, `code-rules.md` |
| Develop   | Split into lanes, parallel work in git worktrees | Merged code, `runtime.json` |
| QA        | Functional, regression, edge-case testing        | `.forge/holes/`           |
| Security  | OWASP Top 10, secrets scan, auth review          | `.forge/holes/`           |
| Fix       | Resolve blockers (max 3 attempts per issue)      | Fixes merged              |
| Delivery  | Docs, delivery report, client review             | `.forge/delivery-report/` |

### Repair mode — existing codebases

```mermaid
graph LR
    A[Intake] --> B[Reproduce]
    B --> C[Isolate]
    C --> D[Fix]
    D --> E[Regress]
    E --> F{Clean?}
    F -- no --> C
    F -- yes --> G[Verify]
    G --> H[Delivery]
```

| Phase     | What happens                                          | Output                    |
|-----------|-------------------------------------------------------|---------------------------|
| Intake    | Read existing code, generate baseline artifacts       | `spec.md`, `code-rules.md`, `contracts/` |
| Reproduce | Confirm the bug exists and capture reproduction steps | `.forge/evidence/`        |
| Isolate   | Root cause analysis — narrow to the responsible module | `.forge/evidence/rca-*.md` |
| Fix       | Implement targeted fix in isolated worktree            | Fix branch                |
| Regress   | Verify fix doesn't break adjacent functionality        | `.forge/holes/`           |
| Verify    | Full QA pass on the fix                                | `.forge/holes/`           |
| Delivery  | Update docs, delivery report                           | `.forge/delivery-report/` |

Repair is not "just fix it." It's reproduce → isolate root cause → fix → prove no regressions → verify.

### State lives in files, not chat

Every decision, spec, contract, and issue is written to `.forge/`. When a session
ends and a new one starts, `forge continue` reads these files and picks up.
Nothing depends on chat history surviving.

See [docs/phases.md](./docs/phases.md) for detailed phase gates and ownership.
See [docs/artifacts.md](./docs/artifacts.md) for the full `.forge/` directory reference.

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/cjy5507/forge/main/scripts/bootstrap-install.mjs | node --input-type=module - --scope global --force
```

Then:

```
forge                  # start a new project or fix an existing one
forge info             # see current phase, blockers, next steps
forge continue         # restore state and pick up where you left off
```

This installs Forge globally at `~/.forge/plugins/forge`.
For project-local or other install options, see [Installation details](#installation-details) below.

## Installation details

<details>
<summary>Global install (manual)</summary>

```bash
git clone https://github.com/cjy5507/forge.git "$HOME/.forge/src/forge"
node "$HOME/.forge/src/forge/scripts/setup-plugin.mjs" --scope global --force
```

Prepares the plugin at `~/.forge/plugins/forge`.
</details>

<details>
<summary>Project-local install (manual)</summary>

```bash
git clone https://github.com/cjy5507/forge.git .forge/vendor/forge
node .forge/vendor/forge/scripts/setup-plugin.mjs --scope project --project-root "$PWD" --force
```

Prepares the plugin at `./.forge/plugins/forge`.
</details>

<details>
<summary>Copy mode (no symlinks)</summary>

Add `--mode copy` to any install command:

```bash
curl -fsSL https://raw.githubusercontent.com/cjy5507/forge/main/scripts/bootstrap-install.mjs | node --input-type=module - --scope global --mode copy --force
```
</details>

<details>
<summary>Claude Code marketplace</summary>

```text
/plugin marketplace add cjy5507/forge
/plugin install forge@forge
```

Or with HTTPS:

```text
/plugin marketplace add https://github.com/cjy5507/forge.git
/plugin install forge@forge
```

Point Claude Code at the repository root (the folder containing `.claude-plugin/plugin.json`,
`skills/`, `scripts/`, and `hooks/`), not at `.claude-plugin/` alone.
</details>

<details>
<summary>Codex</summary>

```bash
npm install -g @openai/codex
```

Point the host at the repository root containing `.codex-plugin/plugin.json`.
Recommended roots: `~/.forge/plugins/forge` or `./.forge/plugins/forge`.
</details>

## Validation

```bash
npx --yes vitest run scripts/*.test.mts
```

## MCP

Forge ships with [Context7](https://context7.com) configured in `.mcp.json` for documentation
lookups during fact-checking. No API key required.

## Host support

| Host | Status | Notes |
|------|--------|-------|
| Claude Code | **Verified** | Full hook lifecycle, subagent routing, lane management |
| Codex | **Manifest only** | `.codex-plugin/plugin.json` present, but hooks use Claude-specific events (`${CLAUDE_PLUGIN_ROOT}`, `SubagentStart`, etc.) — runtime parity not yet achieved |

Forge's file-based state system (`.forge/`, `state.json`, `runtime.json`) is host-agnostic.
The automation layer (hooks, subagent tracking, stop guards) currently requires Claude Code.

## Links

- [Phase structure](./docs/phases.md)
- [Artifact reference](./docs/artifacts.md)
- [Marketplace copy](./MARKETPLACE.md)
- [Release notes](./RELEASE_NOTES.md)
- [Publishing checklist](./PUBLISHING.md)
