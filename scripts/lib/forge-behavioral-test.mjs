/**
 * Forge Behavioral Testing — Playwright/browser MCP integration for QA.
 *
 * Anthropic harness principle: "Evaluators should navigate running applications
 * via browser automation, not just code-review."
 *
 * This module detects running dev servers, builds behavioral test plans from
 * spec acceptance criteria, and structures results for evidence storage.
 * Graceful fallback when no dev server or Playwright MCP is available.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DEV_SERVER_INDICATORS = [
  { file: 'package.json', field: 'scripts.dev', portPattern: /localhost:(\d+)/ },
  { file: 'package.json', field: 'scripts.start', portPattern: /localhost:(\d+)/ },
];

const DEFAULT_PORTS = [3000, 5173, 8080, 4321];

/**
 * Detect if a dev server is likely running by checking package.json scripts.
 * Returns { detected: boolean, url: string, source: string }.
 * @param {string} cwd
 */
export function detectDevServer(cwd = '.') {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return { detected: false, url: '', source: '' };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const scripts = pkg?.scripts || {};

    for (const indicator of DEV_SERVER_INDICATORS) {
      const scriptValue = scripts[indicator.field.replace('scripts.', '')] || '';
      if (!scriptValue) continue;

      const portMatch = scriptValue.match(indicator.portPattern);
      const port = portMatch ? portMatch[1] : '';

      if (scriptValue.includes('next') || scriptValue.includes('vite') || scriptValue.includes('astro')) {
        const detectedPort = port || (scriptValue.includes('next') ? '3000' : '5173');
        return {
          detected: true,
          url: `http://localhost:${detectedPort}`,
          source: indicator.field,
        };
      }
    }
  } catch {
    return { detected: false, url: '', source: '' };
  }

  return { detected: false, url: '', source: '' };
}

/**
 * Extract testable acceptance criteria from spec.md.
 * Returns an array of { id, description, url_path } objects.
 * @param {string} cwd
 */
export function extractTestableAC(cwd = '.') {
  const specPath = join(cwd, '.forge', 'spec.md');
  if (!existsSync(specPath)) return [];

  try {
    const spec = readFileSync(specPath, 'utf8');
    const acPattern = /- \[[ x]\] (AC[\d.]+):\s*(.+)/g;
    const results = [];

    for (const match of spec.matchAll(acPattern)) {
      results.push({
        id: match[1],
        description: match[2].trim(),
        url_path: '/',
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Build a behavioral test plan from detected server + acceptance criteria.
 * @param {{ detected: boolean, url: string }} server
 * @param {{ id: string, description: string }[]} criteria
 * @returns {{ feasible: boolean, steps: object[], reason: string }}
 */
export function buildBehavioralTestPlan(server, criteria = []) {
  if (!server.detected) {
    return {
      feasible: false,
      steps: [],
      reason: 'No dev server detected. Behavioral testing skipped.',
    };
  }

  if (criteria.length === 0) {
    return {
      feasible: false,
      steps: [],
      reason: 'No testable acceptance criteria found in spec.',
    };
  }

  return {
    feasible: true,
    steps: criteria.map(ac => ({
      ac_id: ac.id,
      action: 'navigate_and_verify',
      url: `${server.url}${ac.url_path || '/'}`,
      description: ac.description,
      expected: 'Page loads without errors, AC behavior observable',
    })),
    reason: `${criteria.length} behavioral tests planned against ${server.url}`,
  };
}

/**
 * Structure a behavioral test result for evidence storage.
 * @param {string} acId
 * @param {boolean} passed
 * @param {string} detail
 * @returns {{ ac_id: string, passed: boolean, detail: string, tested_at: string }}
 */
export function createBehavioralResult(acId, passed, detail = '') {
  return {
    ac_id: acId,
    passed,
    detail,
    tested_at: new Date().toISOString(),
  };
}
