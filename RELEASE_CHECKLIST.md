# Forge Final Release Checklist

## Verified

These items have been confirmed by running tests or direct inspection.

- [x] Forge remains generic and not repo-specific
- [x] No user-specific absolute paths in shipped plugin files
- [x] Claude and Codex manifests are present and parse as JSON
- [x] Hook scripts are wired and `hooks/hooks.json` parses as JSON
- [x] Asset references in the Codex manifest exist on disk
- [x] Marketplace copy, privacy, terms, and publishing docs exist
- [x] Marketplace icon, logo, and screenshots exist
- [x] Context7 MCP wiring is documented
- [x] `npx --yes vitest run scripts/*.test.mts` — all 139 tests green
- [x] Claude Code installation path works (plugin install via `/plugin`)

## Release artifacts

- [x] `README.md`
- [x] `MARKETPLACE.md`
- [x] `RELEASE_NOTES.md`
- [x] `PUBLISHING.md`
- [x] `PRIVACY.md`
- [x] `TERMS.md`

## Not yet verified

These checks have not been run against a live environment. They are planned but not confirmed.

- [ ] End-to-end install flow in a real Codex plugin host
- [ ] Context7 auth flow on a fresh install where the user has not previously authenticated
- [ ] End-to-end install flow in a Claude marketplace UI outside of the development environment
