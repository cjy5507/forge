# Harness Learning Protocol

The harness improves over time by extracting lessons from each project and making them
available to future projects. This creates a feedback loop: mistakes made once are
prevented structurally, not just remembered.

## Why This Exists

Without learning, the harness repeats the same mistakes across projects:
- The same type of bug appears in every project
- The same estimation errors recur
- The same design patterns cause the same QA failures
- Code-rules that worked well are reinvented from scratch

## Lesson Types

### 1. Pattern Lessons (from QA/Fix)
Recurring bug patterns that the harness should prevent structurally.

```markdown
# LESSON: {short title}
Type: pattern
Source: {project name} / Phase {N} / {hole-id}
Date: {date}
Severity: {how bad was it}

## What happened
{description of the bug/issue}

## Root cause
{why it happened — not the symptom, the structural cause}

## Prevention rule
{what the harness should do differently to prevent this}
- [ ] Add to code-rules.md template: {specific rule}
- [ ] Add to QA checklist: {specific check}
- [ ] Add to design review: {specific verification}

## Applies when
{conditions under which this lesson is relevant — tech stack, project type, etc.}
```

### 2. Process Lessons (from phase transitions)
Improvements to the Forge process itself.

```markdown
# LESSON: {short title}
Type: process
Source: {project name} / Phase {N}
Date: {date}

## What happened
{what went wrong or unexpectedly well in the process}

## Impact
{time wasted, rework caused, or quality gained}

## Process change
{specific change to make in the harness}
- [ ] Modify skill: {skill name} — {what to change}
- [ ] Add to handoff interview: {specific question to add}
- [ ] Modify template: {template name} — {what to add}

## Applies when
{conditions}
```

### 3. Estimation Lessons (from delivery)
Calibration data for future scoping.

```markdown
# LESSON: {short title}
Type: estimation
Source: {project name}
Date: {date}

## Estimated vs actual
- Estimated scope: {what was planned}
- Actual scope: {what was delivered}
- Phases that took longer than expected: {list}
- Phases that were faster than expected: {list}

## Why the gap
{what caused the estimation to be off}

## Calibration rule
{how to adjust future estimates for similar projects}
```

## When Lessons Are Created

### During Fix Phase (Phase 6)
After every COMPLEX fix (triage score 0-2) that required RCA:
1. Troubleshooter extracts the structural cause
2. Lead Dev determines if this is a recurring pattern or one-off
3. If recurring: create a pattern lesson in `.forge/lessons/`
4. If the fix reveals a code-rules gap: add the rule to the lesson's prevention checklist

### During QA Phase (Phase 4)
After QA completes, if more than 3 blockers were found:
1. QA categorizes the blockers by root cause type
2. If a category has 2+ blockers: likely a structural issue
3. Create a pattern lesson identifying the structural gap

### During Delivery Phase (Phase 7)
Before presenting to client:
1. CEO reviews the project timeline and outcomes
2. Compare spec scope vs delivered scope
3. Note phases that took disproportionately long
4. Create estimation and process lessons

## Where Lessons Are Stored

### Per-project (current project)
`.forge/lessons/{lesson-id}.md` — lessons discovered during this project.

### Global (cross-project, persistent)
`~/.claude/forge-lessons/` — curated lessons that apply across projects.

After delivery, CEO selects which lessons should be promoted to global:
- Pattern lessons with `applies_when` matching common project types → promote
- Process lessons that revealed harness bugs → promote (and also fix the harness)
- Estimation lessons → always promote (calibration data is cumulative)

## When Lessons Are Consulted

### At Intake (Phase 0)
CEO loads global lessons and checks:
- Does this project type match any `applies_when` conditions?
- Are there estimation lessons for similar scope?
- Are there pattern lessons for the chosen tech stack?

Relevant lessons are:
1. Summarized in a "Lessons Brief" section of state.json
2. Fed to CTO during design phase (pattern lessons → code-rules.md)
3. Fed to QA during testing (pattern lessons → additional test cases)

### At Design (Phase 2)
CTO checks pattern lessons for the chosen tech stack:
- Known problematic patterns → add preventive rules to code-rules.md
- Known QA-failure patterns → add to contracts as explicit constraints

### At QA (Phase 4)
QA checks pattern lessons:
- Known bug patterns → test explicitly even if not in spec
- Known edge cases for the tech stack → add to edge-case testing

## Lesson Lifecycle

```
Discovery (during project)
    ↓
Local storage (.forge/lessons/)
    ↓
Delivery review (CEO evaluates)
    ↓
Promotion to global (~/.claude/forge-lessons/)
    ↓
Intake of next project (lessons consulted)
    ↓
Prevention (lessons become code-rules, QA checks, design constraints)
```

## Anti-Patterns

- Recording symptoms instead of structural causes
- Lessons that are too vague to be actionable ("be more careful")
- Not promoting lessons to global after delivery
- Not consulting global lessons at intake
- Treating lessons as documentation instead of prevention rules
- Creating lessons for one-off issues that won't recur
- Lesson overload: if global lessons exceed 30, curate — merge similar ones, archive outdated ones

## Express Mode

Express mode creates lessons only if:
- A fix iteration was needed (something went wrong)
- The task was initially underscoped (estimation lesson)

Otherwise, no lessons are created — the project was small enough that lessons are unlikely to generalize.
