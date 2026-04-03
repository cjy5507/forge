# Forge Concept Design

Date: 2026-04-03
Status: Approved in brainstorming, pending written-spec review

## Summary

Forge is currently positioned in the repository as a harness-engineering plugin and a phase-gated virtual software company. This document clarifies that existing identity and captures an emerging positioning direction: Forge as a 3rd-generation harness engineering system.

It is not primarily a prompt helper or a generic workflow plugin. It is a control layer that organizes agents into a virtual software company and keeps execution stable, evidence-driven, and context-aware across build and repair workflows, including long-running and large-scale software projects.

Its purpose is to make harness engineering itself more reliable: preserving intent across sessions, reducing hallucinations caused by context degradation, standardizing quality across single-agent and multi-agent execution, supporting build-vs-repair routing, and converging outputs toward product-quality delivery.

## Project Reality Observed in the Current Repository

The current repository already expresses the core concept in code and docs:

- README and plugin manifests define Forge as a harness-engineering plugin and a phase-gated virtual software company.
- Marketplace copy emphasizes evidence-driven execution, runtime guardrails, tracked subagents, recovery loops, and design-before-code prerequisites.
- Hook scripts implement session restore, prompt detection, fact-check gating, stop protection, context checkpointing, tool failure tracking, and subagent lifecycle tracking.
- Forge state/runtime helpers implement phase tracking, tiering, compact context summaries, pending-work summaries, task-type detection, and recommended-agent selection.
- Skills define a phased pipeline for intake, discovery, design, develop, QA, security, fix, delivery, status, stats, continue, rollback, and troubleshoot.
- Agent prompts establish role-specialized behaviors for CEO, PM, CTO, Developer, QA, Security Reviewer, Troubleshooter, Fact Checker, and supporting functions.

This design doc therefore does not redefine Forge from scratch. It clarifies and consolidates the concept already present in the implementation.

## Core Product Definition

### Top-level identity

Forge is currently a harness-engineering plugin, with an emerging positioning direction as a 3rd-generation harness engineering system.

### Operating model

Forge runs agents as a virtual software company:

- roles are explicit,
- phases are gated,
- evidence is required,
- recovery is built in,
- verification is part of the workflow rather than an optional afterthought,
- build and repair are treated as distinct operating modes,
- and adaptive intervention tiers control how much harness pressure is applied.

### Core outcome promise

Forge is designed so that agents can continue working consistently even when:

- context windows get long,
- work spans multiple sessions,
- projects become large,
- multiple agents operate in parallel.

The system goal is to prevent hallucinations caused by context loss, unchecked assumptions, or quality drift.

## Problem Statement

Forge addresses five linked failures in ordinary agent workflows:

1. A single prompt rarely produces the exact product-quality result the user actually wants.
2. As context grows, agents drift, omit constraints, or hallucinate details.
3. When work moves into a new session, prior intent and execution state are often lost.
4. In multi-agent execution, output quality and style can diverge unless a harness standardizes behavior.
5. Without explicit routing, the system can apply the wrong operating posture to a new build versus an existing-project repair task.

Forge treats these not as isolated prompt-writing problems, but as harness-design problems.

## Design Positioning

### What Forge is not

Forge is not mainly:

- a prompt pack,
- a lightweight productivity shortcut,
- a loose collection of skills,
- or a generic multi-agent launcher.

### What Forge is

Forge is a control and continuity system that combines:

- prompt engineering,
- context engineering,
- role orchestration,
- phase management,
- fact-based verification,
- persistent state,
- and recovery workflows

into one execution harness.

## Conceptual Model

### Harness engineering first

The primary concept is harness engineering. The harness governs how agents receive context, when they can act, what they must verify, how they recover, and how quality remains stable over time.

### Virtual software company second

The virtual software company is the operational expression of that harness. It provides a human-legible model for how the system behaves:

- CEO for routing and oversight,
- PM for discovery,
- CTO for architecture,
- developers for implementation,
- QA and security for verification,
- troubleshooter and fact-checker for failure isolation and evidence control.

This model is valuable because it turns abstract agent orchestration into explicit organizational responsibilities.

## Key Mechanisms

### 1. Phase-gated execution

Forge enforces a structured path across intake, discovery, design, development, QA, security, fix, and delivery. The purpose is not bureaucracy. The purpose is to prevent premature coding, preserve approvals, and keep artifacts aligned with the current stage of work. This same structure also supports distinct build and repair routes, so greenfield creation and existing-project recovery do not get forced through the exact same path.

### 2. Evidence and fact gates

Forge treats unsupported claims as a system risk. The fact-checking layer verifies imports, APIs, types, contracts, and evidence artifacts before risky writing proceeds. This is a direct mechanism for reducing hallucinations and assumption-driven mistakes.

### 3. Context engineering and compact reinjection

Forge persists project and runtime state, generates compact context summaries, checkpoints before compaction, and restores critical context at session start. This supports continuity when a conversation becomes too long or execution spans multiple sessions.

### 4. Session-to-session continuity

Forge should let a user resume work in a later session without losing the essential execution state, approvals, phase position, or known issues. The user should experience continuity rather than restart.

### 5. Multi-agent quality standardization

Forge does not treat parallelism as success by itself. It uses isolation, scoped tasks, code rules, contracts, and living-standard review to make sure multiple agents still produce consistent quality and structure.

### 6. Runtime guardrails and recovery

Stop guards, runtime event tracking, failure history, and checkpointing make the system resilient when work is interrupted, fails, or needs to resume safely.

### 7. Adaptive intervention tiers

Forge already implements light, medium, and full harness tiers. This matters conceptually because Forge is not only a rigid pipeline; it is also an adaptive system that changes how much guardrail pressure, agent coordination, and evidence enforcement to apply based on task type and state.

## Information Hierarchy for Messaging

External messaging should explain Forge in this order:

1. **Identity** — Forge is currently a harness-engineering plugin, with an emerging positioning direction as a 3rd-generation harness engineering system.
2. **Operating model** — It runs agents as a virtual software company.
3. **Problems solved** — context drift, session discontinuity, multi-agent quality variance, and hallucination from unchecked assumptions.
4. **Mechanisms** — persistent state, context reinjection, fact gates, code rules, contracts, phase workflows, recovery hooks.
5. **Outcome** — stable, product-quality, low-hallucination execution across long-running and large-scale projects.

## Core Messaging Draft

### Short definition

Forge is a harness-engineering plugin designed to keep agents stable, context-aware, and consistent across build, repair, long-running, and large-scale software workflows.

### Expanded definition

Forge combines prompt engineering, context engineering, role orchestration, phase gates, evidence checks, adaptive intervention tiers, and recovery workflows into one harness. It runs agents as a virtual software company so build and repair work can continue across sessions, remain fact-based, and stay consistent even in multi-agent execution.

### Stronger positioning draft

Forge is not just a better way to prompt agents. It is a harness system designed to route build versus repair correctly, prevent context collapse, reduce hallucinations, and standardize product-quality output across single-agent and multi-agent workflows.

## Security and Verification Position

This concept clarification does not weaken Forge's security or verification posture.

Security remains a required verification axis in the pipeline, not a marketing garnish. Likewise, evidence, facts, contracts, and code rules remain mandatory control mechanisms inside the harness.

The concept work here should therefore sharpen the language around Forge's existing guarantees, not remove or soften them.

## Representative End-to-End Scenario

The representative demonstration scenario for Forge should include all of the following in one flow:

- a substantial product task,
- enough execution time to pressure context length,
- a session boundary or resume event,
- multiple agents or role transitions,
- fact-checked decisions,
- gated implementation,
- QA/security verification,
- and a coherent final delivery.

That scenario best proves Forge's claim: that long-running, multi-session, multi-agent work can stay consistent and low-hallucination under a strong harness.

## Design Decision Summary

- Primary concept: harness engineering
- Current repository identity: harness-engineering plugin + phase-gated virtual software company
- Emerging positioning direction: beyond 2nd-generation prompt/workflow systems toward a 3rd-generation harness system
- Operating metaphor: virtual software company
- Main technical promise: hallucination-resistant execution despite long context and project scale
- Main continuity promise: next-session continuation without losing core intent or state
- Main quality promise: standardized results across single-agent and multi-agent workflows
- Existing workflow pillars retained: build-vs-repair routing and adaptive intervention tiers

## Open Messaging Questions

These are not blockers for the concept itself, but will matter for product copy:

- How explicitly should Forge name OMC and Superpowers in public comparison copy?
- Should “3rd-generation” be used in marketplace copy, README only, or both?
- How assertive should “hallucination-free” language be in public messaging versus internal aspiration language such as “hallucination-resistant” or “designed to prevent hallucinations”?

## Recommended Next Step

The next step after this concept doc is to write an implementation and messaging plan that maps the approved concept onto concrete updates for README, marketplace copy, plugin descriptions, screenshots, and user-facing positioning.
