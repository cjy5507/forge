# Forge Positioning Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Forge's user-facing messaging with the approved concept doc without changing the underlying security, workflow, or harness behavior.

**Architecture:** Update top-level positioning copy first, then propagate the same message into marketplace surfaces and plugin manifests, then refresh visual/demo collateral so all public-facing surfaces tell a consistent story. Keep the current repository identity intact while introducing the “emerging 3rd-generation harness” language carefully and consistently. Use that phrase explicitly in README and marketplace long-form copy first; keep manifest/storefront short fields more conservative unless they can phrase it as emerging positioning without sounding like an already-proven repo-wide identity.

**Tech Stack:** Markdown docs, JSON plugin manifests, static HTML asset preview, Node.js scripts, Vitest, git

---

## File Structure Map

### Existing files to modify
- `README.md` — primary product explanation and installation overview
- `MARKETPLACE.md` — marketplace-facing short/long copy and starter prompts
- `.codex-plugin/plugin.json` — Codex plugin metadata, descriptions, default prompts
- `.claude-plugin/plugin.json` — Claude plugin metadata, descriptions, default prompts
- `assets/marketplace-preview.html` — visual preview copy shown in generated marketplace assets
- `PUBLISHING.md` — publishing guidance if positioning language changes must be reflected in release prep
- `RELEASE_NOTES.md` — release-summary wording if user-facing positioning is materially updated

### Existing files to read for context
- `docs/superpowers/specs/2026-04-03-forge-concept-design.md` — approved concept source of truth
- `README.md` — baseline current copy
- `MARKETPLACE.md` — current marketplace positioning
- `.codex-plugin/plugin.json` — current Codex-facing manifest copy
- `.claude-plugin/plugin.json` — current Claude-facing manifest copy
- `assets/marketplace-preview.html` — current visual preview copy
- `scripts/render-marketplace-assets.mjs` — marketplace asset generation script

### Existing files to verify
- `package.json` — test command surface
- `scripts/*.test.mts` — regression tests covering setup/render/hook behavior
- `scripts/render-marketplace-assets.mjs` — currently imports `playwright`, so asset regeneration must be treated as conditional

### New files to create only if necessary
- None by default. Prefer editing existing messaging surfaces.

---

### Task 1: Lock the messaging source of truth

**Files:**
- Read: `docs/superpowers/specs/2026-04-03-forge-concept-design.md`
- Read: `README.md`
- Read: `MARKETPLACE.md`
- Read: `.codex-plugin/plugin.json`
- Read: `.claude-plugin/plugin.json`

- [ ] **Step 1: Re-read the approved concept spec and extract the non-negotiable messaging pillars**

Capture these exact pillars in working notes before editing anything:

- current repository identity = harness-engineering plugin + phase-gated virtual software company
- emerging positioning = 3rd-generation harness engineering system
- preserve build-vs-repair routing
- preserve adaptive intervention tiers
- preserve evidence/security/verification posture
- emphasize long-context stability, session continuity, and multi-agent quality consistency

- [ ] **Step 2: Re-read each public-facing copy surface and note mismatches against the approved spec**

Check specifically for:

- missing harness-engineering emphasis
- overemphasis on generic workflow language
- missing session continuity/context reinjection story
- missing build-vs-repair or adaptive-tier language
- wording that accidentally implies security/evidence are optional

- [ ] **Step 3: Write a short copy alignment checklist in your scratchpad before editing**

Checklist must include:

- keep “plugin” identity where required
- introduce “3rd-generation harness” as emerging/stronger positioning, not historical fact everywhere
- use “3rd-generation harness” explicitly only in README and marketplace long-form copy unless another surface can frame it as emerging positioning
- avoid changing behavioral claims the repo cannot yet prove
- keep security, QA, evidence, and recovery visible

- [ ] **Step 4: Confirm the repo is still clean before editing**

Run:
```bash
git status --short
```
Expected: no product-copy files changed yet

Do **not** commit at this stage. This plan uses a single final Lore-format integration commit.

---

### Task 2: Refresh README positioning

**Files:**
- Modify: `README.md`
- Read: `docs/superpowers/specs/2026-04-03-forge-concept-design.md`
- Test: `README.md` rendered review in terminal or editor preview

- [ ] **Step 1: Write the failing review checklist for the README**

Before editing, define these pass conditions in your notes:

- intro clearly says Forge is a harness-engineering plugin
- virtual software company language remains
- long-context/session continuity story is present
- build/repair and adaptive tiers remain visible
- evidence/security/recovery are still visible
- copy is tighter and more differentiated from generic workflow tools
- any use of “3rd-generation harness” reads as positioning, not historical repo fact

- [ ] **Step 2: Rewrite the README opening section minimally**

Update the title-adjacent introduction so it communicates:

- current identity: harness-engineering plugin
- operating model: virtual software company
- differentiator: stronger harness for long-running, multi-session, multi-agent work
- emerging positioning: beyond ad-hoc prompting / 2nd-generation workflow systems

Do not remove installation instructions or existing structure.

- [ ] **Step 3: Update the “What Forge does” section**

Ensure the bullet list includes all of:

- build/repair routing
- adaptive tiering
- context continuity / session recovery
- tracked subagents and failure history
- evidence/fact gates
- QA/security/delivery workflow coverage

- [ ] **Step 4: Update suggested prompts only if they reinforce the clarified concept**

Prefer prompts that demonstrate:

- starting a harness
- resuming safely after interruption
- showing current phase/status
- comparing harnessed execution with baseline if appropriate

- [ ] **Step 5: Run a manual readability review**

Run:
```bash
sed -n '1,220p' README.md
```
Expected: opening sections read coherently without contradicting the concept spec

- [ ] **Step 6: Stage-check the README change without committing yet**

Run:
```bash
git diff -- README.md
```
Expected: only README positioning copy changed

---

### Task 3: Refresh marketplace copy

**Files:**
- Modify: `MARKETPLACE.md`
- Read: `docs/superpowers/specs/2026-04-03-forge-concept-design.md`
- Test: `MARKETPLACE.md` rendered review in terminal or editor preview

- [ ] **Step 1: Write the failing review checklist for marketplace copy**

Pass conditions:

- tagline differentiates Forge from generic workflow plugins
- short description mentions harness + continuity/guardrails
- long description includes build/repair, adaptive tiers, fact-based execution, recovery, and multi-agent consistency
- wording remains credible for marketplace claims
- “3rd-generation harness” appears only where there is enough room to frame it as a positioning layer

- [ ] **Step 2: Rewrite tagline and short description conservatively**

Keep them concise enough for storefront use. Avoid over-claiming “hallucination-free” if the repo cannot prove it externally.

- [ ] **Step 3: Rewrite the long description around the approved concept hierarchy**

Sequence the copy as:

1. harness identity
2. virtual software company operating model
3. context/session continuity
4. build/repair + adaptive tiers
5. evidence/security/recovery controls
6. result quality consistency

- [ ] **Step 4: Review starter prompts and categories**

Starter prompts should reflect the clarified concept. Categories/capabilities should still fit marketplace expectations.

- [ ] **Step 5: Run a manual review**

Run:
```bash
sed -n '1,220p' MARKETPLACE.md
```
Expected: copy matches README direction while staying marketplace-friendly

- [ ] **Step 6: Stage-check the marketplace change without committing yet**

Run:
```bash
git diff -- MARKETPLACE.md
```
Expected: only marketplace-facing copy changed

---

### Task 4: Update plugin manifests consistently

**Files:**
- Modify: `.codex-plugin/plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Read: `docs/superpowers/specs/2026-04-03-forge-concept-design.md`
- Test: `.codex-plugin/plugin.json`
- Test: `.claude-plugin/plugin.json`

- [ ] **Step 1: Define the manifest copy constraints before editing**

Constraints:

- descriptions must remain short enough for plugin UIs
- Codex and Claude variants should stay aligned except where host names differ
- preserve relative asset/hook paths
- do not change structural manifest keys unless required
- do not present Forge as fully rebranded to “3rd-generation harness” in short manifest/storefront fields unless the wording clearly says it is emerging positioning

- [ ] **Step 2: Update top-level `description` fields**

Make the wording consistent with:

- harness engineering
- virtual software company
- continuity / guardrails / evidence

- [ ] **Step 3: Update `interface.shortDescription` and `interface.longDescription`**

Ensure each long description mentions:

- phase-gated execution
- build/repair workflows
- runtime guardrails
- tracked subagents
- recovery/session continuity
- evidence-driven execution

- [ ] **Step 4: Review `defaultPrompt` suggestions**

Prompts should demonstrate:

- starting a harness
- resuming or checking status
- using Forge for diagnosis/fix or build flow

- [ ] **Step 5: Validate JSON syntax**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.codex-plugin/plugin.json','utf8')); JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 6: Stage-check the manifest change without committing yet**

Run:
```bash
git diff -- .codex-plugin/plugin.json .claude-plugin/plugin.json
```
Expected: only wording changes; no structural key/path breakage

---

### Task 5: Refresh visual marketplace collateral text

**Files:**
- Modify: `assets/marketplace-preview.html`
- Read: `MARKETPLACE.md`
- Read: `scripts/render-marketplace-assets.mjs`
- Test: regenerated preview assets if copy in screenshot surfaces changes

- [ ] **Step 1: Inspect the current HTML preview copy and its data flow**

Run:
```bash
sed -n '1,240p' assets/marketplace-preview.html
sed -n '1,240p' scripts/render-marketplace-assets.mjs
```
Expected: understand whether preview text is hard-coded or derived

- [ ] **Step 2: Update preview copy to match the approved messaging direction**

Ensure preview text visually reinforces:

- harness engineering
- virtual software company
- continuity across sessions
- evidence/guardrails/recovery

- [ ] **Step 3: Decide whether screenshot regeneration is actually available in this repo environment**

Run:
```bash
node -e "import('playwright').then(()=>console.log('playwright-ok')).catch(()=>console.log('playwright-missing'))"
```
Expected: either `playwright-ok` or `playwright-missing`

- [ ] **Step 4: If Playwright is available, regenerate marketplace assets; otherwise skip image regeneration and document the gap**

If available, run:
```bash
node scripts/render-marketplace-assets.mjs
```
Expected: asset generation completes without error

If missing, do not add a new dependency in this task. Record that visual assets were not regenerated because Playwright is not currently installed in the repo.

- [ ] **Step 5: Review changed assets before accepting them**

Run:
```bash
git status --short assets
```
Expected: only intentionally changed preview/screenshot assets are modified

- [ ] **Step 6: Stage-check the asset/copy change without committing yet**

Run:
```bash
git diff -- assets/marketplace-preview.html assets/screenshot-overview.png assets/screenshot-console.png
```
Expected: HTML change is present; screenshots only change if regeneration actually ran

---

### Task 6: Update release/publishing support docs if needed

**Files:**
- Modify: `PUBLISHING.md`
- Modify: `RELEASE_NOTES.md`
- Read: `MARKETPLACE.md`
- Read: `README.md`

- [ ] **Step 1: Check whether publishing/release docs mention outdated positioning**

Run:
```bash
rg -n "workflow|harness|virtual software company|marketplace|description|tagline" PUBLISHING.md RELEASE_NOTES.md
```
Expected: identify lines that must track the messaging refresh

- [ ] **Step 2: Apply only minimal wording changes**

Do not broaden scope. Only update copy guidance that would otherwise drift from the new approved language.

- [ ] **Step 3: Review docs after editing**

Run:
```bash
sed -n '1,220p' PUBLISHING.md
sed -n '1,220p' RELEASE_NOTES.md
```
Expected: support docs remain concise and consistent

- [ ] **Step 4: Stage-check any support-doc updates without committing yet**

Run:
```bash
git diff -- PUBLISHING.md RELEASE_NOTES.md
```
Expected: only minimal wording alignment if this task was needed

Skip this task entirely if no wording drift exists.

---

### Task 7: Run verification and produce handoff summary

**Files:**
- Verify: `README.md`
- Verify: `MARKETPLACE.md`
- Verify: `.codex-plugin/plugin.json`
- Verify: `.claude-plugin/plugin.json`
- Verify: `assets/marketplace-preview.html`
- Verify: generated assets if changed

- [ ] **Step 1: Run repository tests to confirm the messaging refresh did not break existing tooling**

Run:
```bash
npm test
```
Expected: all Vitest suites pass

- [ ] **Step 2: Run targeted asset/render validation only if Playwright is available and preview assets were intentionally regenerated**

If available, run:
```bash
node scripts/render-marketplace-assets.mjs
```
Expected: completes successfully

If not available, verify instead that the HTML preview file changed as intended and record the missing Playwright prerequisite in the handoff summary.

- [ ] **Step 3: Review the final diff holistically**

Run:
```bash
git status --short
git diff -- README.md MARKETPLACE.md .codex-plugin/plugin.json .claude-plugin/plugin.json assets/marketplace-preview.html PUBLISHING.md RELEASE_NOTES.md
```
Expected: every change supports the approved concept doc; no accidental behavior changes

- [ ] **Step 4: Write the delivery summary for the next executor**

Summary must include:

- files changed
- which concept pillars were strengthened
- what was intentionally left unchanged
- verification evidence
- any remaining follow-up items

- [ ] **Step 5: Create one final Lore-format integration commit**

Run:
```bash
git add README.md MARKETPLACE.md .codex-plugin/plugin.json .claude-plugin/plugin.json assets/marketplace-preview.html PUBLISHING.md RELEASE_NOTES.md assets/*.png
git commit
```

Use a Lore-format commit message with:

- an intent line about aligning Forge's public story
- constraints covering current plugin identity, build/repair, adaptive tiers, and preserved verification posture
- a rejected alternative noting why full immediate 3rd-generation rebranding was not used everywhere
- tested / not-tested entries that accurately reflect whether Playwright-based screenshots were regenerated

Only include files actually changed.
