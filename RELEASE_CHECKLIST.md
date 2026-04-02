# Forge Final Release Checklist

## Scope

- [x] Forge remains generic and not repo-specific
- [x] No user-specific absolute paths in shipped plugin files
- [x] Claude and Codex manifests are present
- [x] Hook scripts are wired and JSON-valid
- [x] Marketplace copy, privacy, terms, and publishing docs exist
- [x] Marketplace icon, logo, and screenshots exist
- [x] Context7 MCP wiring is documented

## Validation

- [x] `npx --yes vitest run scripts/*.test.mts`
- [x] Plugin manifests parse as JSON
- [x] `hooks/hooks.json` parses as JSON
- [x] Asset references in the Codex manifest exist

## Remaining operational checks

- [ ] Verify end-to-end install flow in a real Claude marketplace UI
- [ ] Verify end-to-end install flow in a real Codex plugin host
- [ ] Confirm Context7 auth flow in target clients if auth is required

## Release artifacts

- [x] `README.md`
- [x] `MARKETPLACE.md`
- [x] `RELEASE_NOTES.md`
- [x] `PUBLISHING.md`
- [x] `PRIVACY.md`
- [x] `TERMS.md`
