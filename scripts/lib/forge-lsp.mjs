// Forge LSP helpers — symbol detection and LSP context hints
// Used by: subagent-start.mjs (pre-delegation), lsp-symbol-guard.mjs (grep redirect)

// camelCase: starts lowercase, has at least one uppercase letter within
const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/;

// PascalCase: starts uppercase, has at least one lowercase after first char, then another uppercase
const PASCAL_CASE = /^[A-Z][a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/;

// snake_case with 2+ segments
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*)+$/;

// Patterns that look like file paths or regex — exclude these
const PATH_LIKE = /[/\\.].*[/\\.]/;
const REGEX_META = /[.*+?^${}()|[\]\\]/;

const CODE_AGENT_TYPES = new Set([
  'developer', 'analyst', 'troubleshooter',
  'forge:developer', 'forge:analyst', 'forge:troubleshooter',
]);

/**
 * Conservative check: is the pattern likely a code symbol name?
 * Returns true only for unambiguous camelCase, PascalCase, or snake_case.
 * Excludes: single words, ALL_CAPS, file paths, regex patterns.
 */
export function isSymbolPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern) return false;
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length < 3) return false;

  // Exclude file paths
  if (PATH_LIKE.test(trimmed)) return false;

  // Exclude regex metacharacters
  if (REGEX_META.test(trimmed)) return false;

  // Exclude ALL_CAPS (constants/env vars)
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return false;

  return CAMEL_CASE.test(trimmed) || PASCAL_CASE.test(trimmed) || SNAKE_CASE.test(trimmed);
}

/**
 * Check if the agent type is a code-working agent that benefits from LSP hints.
 */
export function isCodeWorkingAgent(agentType) {
  if (typeof agentType !== 'string') return false;
  return CODE_AGENT_TYPES.has(agentType.trim().toLowerCase());
}

/**
 * Build a compact LSP context hint for code-working subagents.
 * Returns null if agent type doesn't benefit from LSP or tier is too low.
 */
export function buildLspContextHint(agentType, tier) {
  if (!isCodeWorkingAgent(agentType)) return null;
  if (!tier || tier === 'off' || tier === 'light') return null;

  return '[LSP] Prefer find_definition / findReferences over grep for symbol navigation. LSP is faster and saves ~70% tokens.';
}

/**
 * Build a soft redirect message suggesting LSP for a symbol-like grep pattern.
 */
export function buildSymbolRedirectHint(pattern) {
  return `Pattern "${pattern}" looks like a code symbol. Consider using LSP find_definition or findReferences for precise, token-efficient navigation.`;
}
