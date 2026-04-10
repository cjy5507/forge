// Forge LSP helpers — symbol detection, context hints, export extraction
// Used by: subagent-start.mjs, lsp-symbol-guard.mjs, grep-tracker.mjs

import { readFileSync } from 'fs';
import { resolve, join } from 'path';

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

// --- Export signature extraction (Lane B) ---

const EXPORT_PATTERN = /^export\s+(default\s+)?(function|const|let|class|async\s+function)\s+(\w+)/;
const MAX_EXPORTS_PER_FILE = 20;
const SMART_CONTEXT_MAX_CHARS = 500;
const CROSS_LANE_MAX_CHARS = 300;

/**
 * Extract export signatures from a JS/TS file.
 * Returns array of { name, line, signature }. Max 20 per file.
 * Returns [] on any failure (non-fatal).
 */
export function extractExportSignatures(filePath) {
  if (typeof filePath !== 'string' || !filePath) return [];
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const exports = [];
    for (let i = 0; i < lines.length && exports.length < MAX_EXPORTS_PER_FILE; i++) {
      const match = lines[i].match(EXPORT_PATTERN);
      if (match) {
        exports.push({
          name: match[3],
          line: i + 1,
          signature: lines[i].trim().slice(0, 80),
        });
      }
    }
    return exports;
  } catch {
    return [];
  }
}

/**
 * Build smart context hint by reading a task brief and extracting file exports.
 * Returns compact string or null. Max 500 chars.
 */
export function buildSmartContextHint(taskFilePath, cwd) {
  if (typeof taskFilePath !== 'string' || !taskFilePath) return null;
  try {
    const fullPath = resolve(cwd || '.', taskFilePath);
    const content = readFileSync(fullPath, 'utf8');

    // Extract file paths from task brief (lines containing .mjs, .ts, .js)
    const fileRefs = [];
    for (const line of content.split('\n')) {
      const matches = line.match(/[\w./\-]+\.(?:mjs|ts|js)\b/g);
      if (matches) {
        for (const m of matches) {
          if (!fileRefs.includes(m) && !m.startsWith('.forge/')) fileRefs.push(m);
        }
      }
    }
    if (!fileRefs.length) return null;

    const parts = [];
    let totalLen = 0;
    for (const ref of fileRefs) {
      const absPath = resolve(cwd || '.', ref);
      const sigs = extractExportSignatures(absPath);
      if (!sigs.length) continue;
      const names = sigs.map(s => `${s.name}(L${s.line})`).join(', ');
      const entry = `${ref} → ${names}`;
      if (totalLen + entry.length > SMART_CONTEXT_MAX_CHARS) break;
      parts.push(entry);
      totalLen += entry.length;
    }

    return parts.length ? `[Exports] ${parts.join(' | ')}` : null;
  } catch {
    return null;
  }
}

/**
 * Build cross-lane dependency context by reading dependency lanes' scope files.
 * Returns compact string or null. Max 300 chars.
 */
export function buildCrossLaneContext(lane, runtime, cwd) {
  if (!lane?.dependencies?.length || !runtime?.lanes) return null;
  try {
    const parts = [];
    let totalLen = 0;

    for (const depId of lane.dependencies) {
      const depLane = runtime.lanes[depId];
      if (!depLane) continue;
      if (depLane.status !== 'done' && depLane.status !== 'merged') continue;

      const scope = Array.isArray(depLane.scope) ? depLane.scope : [];
      for (const scopeFile of scope) {
        const absPath = resolve(cwd || '.', scopeFile);
        const sigs = extractExportSignatures(absPath);
        if (!sigs.length) continue;
        const names = sigs.map(s => s.name).join(', ');
        const entry = `[Dep:${depId}] ${scopeFile} → ${names}`;
        if (totalLen + entry.length > CROSS_LANE_MAX_CHARS) break;
        parts.push(entry);
        totalLen += entry.length;
      }
    }

    return parts.length ? parts.join(' | ') : null;
  } catch {
    return null;
  }
}
