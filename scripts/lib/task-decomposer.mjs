// Task Decomposition Engine v2 — scan + LLM/heuristic + Kahn's ordering
// Three-phase pipeline: SCAN -> ANALYZE -> ORDER

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative, extname } from 'path';
import { spawnSync } from 'child_process';
import { TASK_PATTERNS_I18N, AREA_PATTERNS_I18N, mergeIntoRegex } from './i18n-patterns.mjs';

// ── Constants ──

const MAX_FILES = 50;
const SCAN_TIMEOUT_MS = 3000;
const LLM_TIMEOUT_MS = Number(process.env.FORGE_LLM_TIMEOUT_MS) || 12000;
const MAX_LINES_PER_FILE = 200;
const MAX_SPEC_EXCERPT = 2000;
const MAX_COMPONENTS = 8;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '.turbo', 'coverage']);

// Task type detection patterns — i18n-aware (EN/KO/JA/ZH) via centralized registry
// ⚠️ Evaluation order matters: first-match-wins. Most specific types first,
// broadest ('optimization') last. 'fullstack-app' precedes 'feature' because
// fullstack signals (dashboard, web app) are more specific than generic creation verbs.
const TASK_PATTERNS = {
  'fullstack-app': mergeIntoRegex(/\b(full.?stack|app|application|website|web app|SaaS|dashboard)\b/i, TASK_PATTERNS_I18N['fullstack-app']),
  'feature': mergeIntoRegex(/\b(add|implement|create|build|new feature)\b/i, TASK_PATTERNS_I18N['feature']),
  'refactoring': mergeIntoRegex(/\b(refactor|restructure|reorganize|clean.?up)\b/i, TASK_PATTERNS_I18N['refactoring']),
  'bug-fix': mergeIntoRegex(/\b(fix|bug|error|broken|crash)\b/i, TASK_PATTERNS_I18N['bug-fix']),
  'testing': mergeIntoRegex(/\b(test|spec|coverage)\b/i, TASK_PATTERNS_I18N['testing']),
  'documentation': mergeIntoRegex(/\b(docs?|documentation|readme|guide)\b/i, TASK_PATTERNS_I18N['documentation']),
  'migration': mergeIntoRegex(/\b(migrat|upgrade|convert)\b/i, TASK_PATTERNS_I18N['migration']),
  'optimization': mergeIntoRegex(/\b(optimi[sz]|perf|speed)\b/i, TASK_PATTERNS_I18N['optimization']),
};

const VALID_TASK_TYPES = new Set(Object.keys(TASK_PATTERNS));

// Area detection patterns — i18n-aware (EN/KO/JA/ZH) via centralized registry
const AREA_PATTERNS = {
  frontend: mergeIntoRegex(/(\bui\b|\bux\b|component|page|layout|style|css|react|vue|svelte|next|frontend)/i, AREA_PATTERNS_I18N.frontend),
  backend: mergeIntoRegex(/(api|server|route|controller|endpoint|express|fastapi|backend)/i, AREA_PATTERNS_I18N.backend),
  database: mergeIntoRegex(/(\bdb\b|database|schema|migration|model|prisma|drizzle|\bsql\b)/i, AREA_PATTERNS_I18N.database),
  auth: mergeIntoRegex(/(auth|login|signup|session|token|permission)/i, AREA_PATTERNS_I18N.auth),
  testing: mergeIntoRegex(/(test|spec|e2e|unit|integration)/i, AREA_PATTERNS_I18N.testing),
  infra: mergeIntoRegex(/(deploy|\bci\b|\bcd\b|docker|k8s|vercel|\baws\b|infra)/i, AREA_PATTERNS_I18N.infra),
};

export const AREA_FILE_PATTERNS = {
  frontend: ['src/components/**', 'src/pages/**', 'src/app/**', 'src/styles/**', 'public/**'],
  backend: ['src/api/**', 'src/routes/**', 'src/controllers/**', 'src/services/**', 'server/**'],
  database: ['src/db/**', 'src/models/**', 'migrations/**', 'prisma/**', 'drizzle/**'],
  auth: ['src/auth/**', 'src/middleware/auth*'],
  testing: ['tests/**', '**/*.test.*', '**/*.spec.*'],
  infra: ['Dockerfile', 'docker-compose.*', '.github/**', 'vercel.*'],
  shared: ['src/types/**', 'src/utils/**', 'src/lib/**', 'src/config/**'],
};

const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const EXPORT_PATTERNS = [
  /export\s+(default\s+)?(function|class|const|let|var)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
  /module\.exports\s*=/g,
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

const ENTRY_POINT_PATTERNS = [
  'src/index', 'src/app', 'src/main', 'app/layout', 'pages/_app',
];

const FRAMEWORK_MAP = [
  ['next', 'next'],
  ['@angular/core', 'angular'],
  ['@sveltejs/kit', 'svelte'],
  ['svelte', 'svelte'],
  ['vue', 'vue'],
  ['react', 'react'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['hono', 'hono'],
];

const VALID_MODEL_HINTS = new Set(['haiku', 'sonnet', 'opus']);

// ── Scan Phase ──

function scanDirectoryTree(cwd, maxDepth = 2) {
  const dirs = [];
  const deadline = Date.now() + SCAN_TIMEOUT_MS;

  function walk(dir, depth) {
    if (depth > maxDepth || Date.now() > deadline) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.forge') continue;
        const rel = relative(cwd, join(dir, entry.name));
        dirs.push(rel);
        walk(join(dir, entry.name), depth + 1);
      }
    } catch {
      // permission denied or similar -- skip
    }
  }

  walk(cwd, 0);
  return dirs;
}

function readFileSafe(filePath, maxLines = MAX_LINES_PER_FILE) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(0, maxLines).join('\n');
  } catch {
    return null;
  }
}

function extractImports(content) {
  const refs = [];
  for (const pattern of IMPORT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const source = match[1];
      refs.push({ source, isLocal: source.startsWith('.') || source.startsWith('..') });
    }
  }
  return refs;
}

function extractExports(content) {
  const names = [];
  // Named exports: export (default)? (function|class|const|let|var) Name
  const namedRegex = /export\s+(default\s+)?(function|class|const|let|var)\s+(\w+)/g;
  let match;
  while ((match = namedRegex.exec(content)) !== null) {
    names.push(match[3]);
  }
  // Re-exports: export { A, B, C }
  const reExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    const inner = match[1];
    for (const part of inner.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.push(name);
    }
  }
  // CJS default
  if (/module\.exports\s*=/.test(content)) {
    names.push('default');
  }
  return names;
}

function detectFramework(deps) {
  if (!deps || typeof deps !== 'object') return null;
  for (const [key, framework] of FRAMEWORK_MAP) {
    if (key in deps) return framework;
  }
  return null;
}

function sampleSourceFiles(cwd, dirs, fileCount, deadline) {
  const modules = [];
  const entryPoints = [];

  // Priority 5: entry points
  for (const base of ENTRY_POINT_PATTERNS) {
    if (fileCount.n >= MAX_FILES || Date.now() > deadline) break;
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
      const candidate = join(cwd, base + ext);
      if (existsSync(candidate)) {
        const content = readFileSafe(candidate);
        if (content !== null) {
          const rel = relative(cwd, candidate);
          entryPoints.push(rel);
          modules.push({ path: rel, imports: extractImports(content), exports: extractExports(content) });
          fileCount.n++;
        }
        break; // found one extension for this base
      }
    }
  }

  // Priority 6: first source file in each src/ subdirectory
  const srcSubdirs = dirs.filter(d => d.startsWith('src/') || d.startsWith('src\\'));
  for (const subdir of srcSubdirs) {
    if (fileCount.n >= MAX_FILES || Date.now() > deadline) break;
    try {
      const fullDir = join(cwd, subdir);
      const entries = readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
        const filePath = join(fullDir, entry.name);
        const content = readFileSafe(filePath);
        if (content !== null) {
          const rel = relative(cwd, filePath);
          modules.push({ path: rel, imports: extractImports(content), exports: extractExports(content) });
          fileCount.n++;
        }
        break; // only first source file per subdir
      }
    } catch {
      // skip
    }
  }

  // Priority 7: config files
  const configFiles = [
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'vite.config.js', 'vite.config.ts', 'vite.config.mjs',
    'drizzle.config.ts', 'drizzle.config.js',
    'prisma/schema.prisma',
    '.env.example',
  ];
  for (const cf of configFiles) {
    if (fileCount.n >= MAX_FILES || Date.now() > deadline) break;
    const filePath = join(cwd, cf);
    if (existsSync(filePath)) {
      const content = readFileSafe(filePath);
      if (content !== null) {
        const rel = relative(cwd, filePath);
        modules.push({ path: rel, imports: extractImports(content), exports: extractExports(content) });
        fileCount.n++;
      }
    }
  }

  // Priority 8: route/API files
  const apiDirs = ['src/api', 'src/routes', 'app/api', 'server'];
  for (const apiDir of apiDirs) {
    if (fileCount.n >= MAX_FILES || Date.now() > deadline) break;
    const fullDir = join(cwd, apiDir);
    if (!existsSync(fullDir)) continue;
    try {
      const entries = readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (fileCount.n >= MAX_FILES || Date.now() > deadline) break;
        if (!entry.isFile()) continue;
        if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
        const filePath = join(fullDir, entry.name);
        const content = readFileSafe(filePath);
        if (content !== null) {
          const rel = relative(cwd, filePath);
          modules.push({ path: rel, imports: extractImports(content), exports: extractExports(content) });
          fileCount.n++;
        }
      }
    } catch {
      // skip
    }
  }

  return { modules, entryPoints };
}

function scanCodebase(cwd) {
  const fingerprint = {
    projectName: '',
    language: 'javascript',
    framework: null,
    directories: [],
    entryPoints: [],
    dependencies: {},
    modules: [],
    hasSpec: false,
    specExcerpt: '',
  };

  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  const fileCount = { n: 0 };

  try {
    // Priority 1: package.json
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      fileCount.n++;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        fingerprint.projectName = pkg.name || '';
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        fingerprint.dependencies = allDeps;
        fingerprint.framework = detectFramework(allDeps);
      } catch {
        // invalid JSON -- skip
      }
    }

    // Priority 2: tsconfig.json / jsconfig.json
    if (existsSync(join(cwd, 'tsconfig.json'))) {
      fingerprint.language = 'typescript';
      fileCount.n++;
    } else if (existsSync(join(cwd, 'jsconfig.json'))) {
      fileCount.n++;
    }

    // Priority 3: .forge/spec.md
    const specPath = join(cwd, '.forge', 'spec.md');
    if (existsSync(specPath)) {
      fingerprint.hasSpec = true;
      fileCount.n++;
      const specContent = readFileSafe(specPath, MAX_LINES_PER_FILE);
      if (specContent !== null) {
        fingerprint.specExcerpt = specContent.slice(0, MAX_SPEC_EXCERPT);
      }
    }

    // Priority 4: directory tree
    if (Date.now() < deadline) {
      fingerprint.directories = scanDirectoryTree(cwd, 2);
    }

    // Priority 5-8: source file samples
    if (Date.now() < deadline) {
      const { modules, entryPoints } = sampleSourceFiles(cwd, fingerprint.directories, fileCount, deadline);
      fingerprint.modules = modules;
      fingerprint.entryPoints = entryPoints;
    }
  } catch (err) {
    console.error(`[task-decomposer] scan: ${err.message}`);
  }

  return fingerprint;
}

// ── Analyze Phase: LLM ──

function buildPrompt(description, fingerprint, specExcerpt) {
  return `You are a task decomposition engine for a software project.

Given:
- Task description
- Codebase fingerprint (directories, dependencies, file samples, import graph)
- Spec excerpt (if available)

Produce a JSON object with this exact schema:
{
  "taskType": "fullstack-app" | "feature" | "refactoring" | "bug-fix" | "testing" | "documentation" | "migration" | "optimization",
  "components": [
    {
      "id": "<kebab-case identifier>",
      "title": "<human-readable title>",
      "areas": ["<area names matching actual directories/modules>"],
      "filePatterns": ["<glob patterns matching real files in this codebase>"],
      "dependencies": ["<ids of components this depends on>"],
      "modelHint": "haiku" | "sonnet" | "opus",
      "rationale": "<one sentence explaining why this is a separate component>"
    }
  ],
  "complexity": <0.0 to 1.0>,
  "parallelizable": <true|false>
}

Rules:
1. Components MUST map to actual directories and files visible in the fingerprint.
2. Dependencies MUST reflect actual import relationships from the fingerprint, not assumptions.
3. Maximize parallelism: only add a dependency edge if component A genuinely imports from or builds on component B.
4. Use "opus" modelHint for components requiring architectural decisions or complex integration.
5. Use "haiku" for config-only, docs, or simple scaffold components.
6. Use "sonnet" for standard implementation components.
7. Keep component count between 1 and 8.
8. Every filePattern glob must match at least one real path from the fingerprint.
9. Output ONLY valid JSON, no markdown fences, no explanation.

---

Task description:
${description}

Codebase fingerprint:
${JSON.stringify(fingerprint, null, 2)}

Spec excerpt:
${specExcerpt || '(no spec available)'}`;
}

function callLLM(prompt) {
  try {
    // Use text output format to avoid JSON envelope wrapping
    const result = spawnSync(
      'claude',
      ['-p', '-', '--model', 'sonnet', '--output-format', 'text'],
      {
        input: prompt,
        timeout: LLM_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `exit ${result.status}`);

    let output = (result.stdout || '').trim();

    // Try direct parse first
    try {
      return JSON.parse(output);
    } catch {
      // Try extracting from markdown code fences
      const fenceMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (fenceMatch) {
        return JSON.parse(fenceMatch[1].trim());
      }
      throw new Error('Could not parse LLM output as JSON');
    }
  } catch (err) {
    console.error(`[task-decomposer] llm: ${err.message}`);
    return null;
  }
}

export function validateLLMResponse(response) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object'] };
  }

  // taskType
  if (!response.taskType || !VALID_TASK_TYPES.has(response.taskType)) {
    errors.push(`Invalid taskType: ${response.taskType}`);
  }

  // complexity
  if (typeof response.complexity !== 'number' || response.complexity < 0 || response.complexity > 1) {
    errors.push(`Invalid complexity: ${response.complexity}`);
  }

  // parallelizable
  if (typeof response.parallelizable !== 'boolean') {
    errors.push(`Invalid parallelizable: ${response.parallelizable}`);
  }

  // components
  if (!Array.isArray(response.components) || response.components.length === 0) {
    errors.push('Components must be a non-empty array');
    return { valid: false, errors };
  }

  // Validate each component
  for (let i = 0; i < response.components.length; i++) {
    const c = response.components[i];
    if (!c || typeof c !== 'object') { errors.push(`Component ${i} is not an object`); continue; }
    if (typeof c.id !== 'string' || !c.id) errors.push(`Component ${i} missing id`);
    if (typeof c.title !== 'string' || !c.title) errors.push(`Component ${i} missing title`);
    if (!Array.isArray(c.areas)) errors.push(`Component ${i} missing areas array`);
    if (!Array.isArray(c.filePatterns)) errors.push(`Component ${i} missing filePatterns array`);
    if (!Array.isArray(c.dependencies)) errors.push(`Component ${i} missing dependencies array`);
    if (!VALID_MODEL_HINTS.has(c.modelHint)) errors.push(`Component ${i} invalid modelHint: ${c.modelHint}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Auto-correct: truncate to MAX_COMPONENTS
  let components = response.components.slice(0, MAX_COMPONENTS);

  // Deduplicate by id (keep first)
  const seenIds = new Set();
  components = components.filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // Referential integrity: remove dependency edges pointing to non-existent IDs
  const validIds = new Set(components.map(c => c.id));
  for (const c of components) {
    c.dependencies = c.dependencies.filter(d => validIds.has(d));
  }

  return {
    valid: true,
    data: {
      taskType: response.taskType,
      components,
      complexity: response.complexity,
      parallelizable: response.parallelizable,
    },
  };
}

// ── Analyze Phase: Heuristic Fallback ──

function detectTaskType(description) {
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(description)) return type;
  }
  return 'feature';
}

function detectAreasFromFingerprint(description, fingerprint) {
  const areas = [];

  // Check description against area patterns
  for (const [area, pattern] of Object.entries(AREA_PATTERNS)) {
    if (pattern.test(description)) areas.push(area);
  }

  // Also check fingerprint directories for area signals
  if (fingerprint && Array.isArray(fingerprint.directories)) {
    const dirStr = fingerprint.directories.join(' ').toLowerCase();
    const dirAreaMap = {
      frontend: /(components|pages|app|styles|ui|views)/,
      backend: /(api|routes|controllers|services|server)/,
      database: /(db|models|migrations|prisma|drizzle)/,
      auth: /(auth|middleware)/,
      testing: /(tests|test|__tests__|spec)/,
      infra: /(\.github|deploy|docker|infra)/,
    };
    for (const [area, pattern] of Object.entries(dirAreaMap)) {
      if (!areas.includes(area) && pattern.test(dirStr)) {
        areas.push(area);
      }
    }
  }

  // Fallback to codebase directory existence check
  if (areas.length === 0 && fingerprint && Array.isArray(fingerprint.directories)) {
    if (fingerprint.directories.length > 0) {
      areas.push('backend'); // minimal fallback
    }
  }

  if (areas.length === 0) areas.push('backend');

  return [...new Set(areas)];
}

function assignModelHint(component, fingerprint) {
  // Cross-cutting or multi-area = opus
  if (component.areas && component.areas.length > 1) return 'opus';

  // Count files that might match this component
  if (fingerprint && Array.isArray(fingerprint.modules)) {
    let matchCount = 0;
    for (const mod of fingerprint.modules) {
      for (const area of (component.areas || [])) {
        if (mod.path.toLowerCase().includes(area.toLowerCase())) {
          matchCount++;
        }
      }
    }
    if (matchCount > 10) return 'opus';
  }

  // Config/docs = haiku
  const configAreas = new Set(['infra', 'documentation']);
  if (component.areas && component.areas.every(a => configAreas.has(a))) return 'haiku';

  return 'sonnet';
}

function heuristicDecompose(description, fingerprint) {
  const taskType = detectTaskType(description);
  const areas = detectAreasFromFingerprint(description, fingerprint);
  const complexity = estimateComplexity(description, areas);
  const parallelizable = complexity >= 0.3 && areas.length >= 2;

  if (!parallelizable) {
    const comp = {
      id: 'main',
      title: 'Main task',
      areas: [...areas],
      filePatterns: areas.flatMap(a => AREA_FILE_PATTERNS[a] || []),
      dependencies: [],
      modelHint: 'sonnet',
    };
    comp.modelHint = assignModelHint(comp, fingerprint);
    return { taskType, components: [comp], complexity, parallelizable };
  }

  // Build components from detected areas, using fingerprint for dependency edges
  const components = [];
  const importGraph = buildImportGraph(fingerprint);

  // For fullstack/feature tasks with 2+ areas, prepend a shared component
  if ((taskType === 'fullstack-app' || taskType === 'feature') && areas.length >= 2 && !areas.includes('shared')) {
    components.push({
      id: 'shared',
      title: 'Shared types and utilities',
      areas: ['shared'],
      filePatterns: AREA_FILE_PATTERNS.shared || [],
      dependencies: [],
      modelHint: 'sonnet',
    });
  }

  for (const area of areas) {
    const deps = components.length > 0 && components[0].id === 'shared' ? ['shared'] : [];
    const comp = {
      id: area,
      title: `${area.charAt(0).toUpperCase() + area.slice(1)} implementation`,
      areas: [area],
      filePatterns: AREA_FILE_PATTERNS[area] || [],
      dependencies: deps,
      modelHint: 'sonnet',
    };
    components.push(comp);
  }

  // Assign dependencies from import graph (if available)
  const areaPathMap = buildAreaPathMap(fingerprint, areas);
  let hasAnyImportEdges = false;
  for (const comp of components) {
    if (comp.id === 'shared') continue;
    const thisFiles = areaPathMap.get(comp.id) || new Set();
    for (const other of components) {
      if (other.id === comp.id) continue;
      if (other.id === 'shared') continue; // shared dep already set above
      const otherFiles = areaPathMap.get(other.id) || new Set();
      if (hasImportEdge(importGraph, thisFiles, otherFiles)) {
        if (!comp.dependencies.includes(other.id)) comp.dependencies.push(other.id);
        hasAnyImportEdges = true;
      }
    }
  }

  // Fallback: if no import edges found (e.g. empty workspace), use direct dependency only
  // NOT transitive — frontend depends on shared, not on database/auth/backend
  if (!hasAnyImportEdges && (taskType === 'fullstack-app' || taskType === 'feature')) {
    const DIRECT_DEPS = {
      database: ['shared'],
      auth: ['shared', 'database'],
      backend: ['shared', 'database', 'auth'],
      frontend: ['shared'],
      testing: ['shared'],
      infra: [],
    };
    const compIds = new Set(components.map(c => c.id));
    for (const comp of components) {
      if (comp.id === 'shared') continue;
      const directDeps = DIRECT_DEPS[comp.id] || [];
      for (const depId of directDeps) {
        if (compIds.has(depId) && !comp.dependencies.includes(depId)) {
          comp.dependencies.push(depId);
        }
      }
    }
  }

  // Assign model hints
  for (const comp of components) {
    comp.modelHint = assignModelHint(comp, fingerprint);
  }

  // Truncate to MAX_COMPONENTS
  const truncated = components.slice(0, MAX_COMPONENTS);

  return { taskType, components: truncated, complexity, parallelizable };
}

function buildImportGraph(fingerprint) {
  // Map from file path -> set of local import targets
  const graph = new Map();
  if (!fingerprint || !Array.isArray(fingerprint.modules)) return graph;
  for (const mod of fingerprint.modules) {
    const localImports = mod.imports
      .filter(i => i.isLocal)
      .map(i => i.source);
    graph.set(mod.path, localImports);
  }
  return graph;
}

function buildAreaPathMap(fingerprint, areas) {
  const map = new Map();
  for (const area of areas) map.set(area, new Set());
  if (!fingerprint || !Array.isArray(fingerprint.modules)) return map;

  const areaKeywords = {
    frontend: /(components|pages|app|styles|ui|views)/i,
    backend: /(api|routes|controllers|services|server)/i,
    database: /(db|models|migrations|prisma|drizzle)/i,
    auth: /(auth|middleware)/i,
    testing: /(tests?|spec|__tests__)/i,
    infra: /(\.github|deploy|docker|infra)/i,
    shared: /(types|utils|lib|config|shared)/i,
  };

  for (const mod of fingerprint.modules) {
    for (const area of areas) {
      const pattern = areaKeywords[area];
      if (pattern && pattern.test(mod.path)) {
        map.get(area).add(mod.path);
      }
    }
  }
  return map;
}

function hasImportEdge(importGraph, fromFiles, toFiles) {
  for (const fromFile of fromFiles) {
    const imports = importGraph.get(fromFile);
    if (!imports) continue;
    for (const imp of imports) {
      // Normalize: strip leading ./ or ../ and file extension
      const impNorm = imp.replace(/^(?:\.\.?\/)+/, '').replace(/\.[^.]+$/, '');
      if (!impNorm || impNorm.length < 3) continue; // skip very short matches to avoid false positives
      for (const toFile of toFiles) {
        const toNorm = toFile.replace(/\.[^.]+$/, '');
        // Path-segment match: check that import aligns with directory boundary
        // e.g. "utils/db" matches "src/utils/db.ts" but "utils" alone doesn't match "src/shared/myutils.ts"
        if (toNorm === impNorm || toNorm.endsWith('/' + impNorm)) {
          return true;
        }
      }
    }
  }
  return false;
}

function estimateComplexity(description, areas) {
  let score = 0;
  if (description.length > 200) score += 0.2;
  else if (description.length > 100) score += 0.1;
  score += Math.min(areas.length * 0.15, 0.45);
  if (/\b(integrat|architect|system|pipeline|workflow|multi|complex)\b/i.test(description)) score += 0.2;
  if (/\b(simple|quick|small|trivial)\b/i.test(description)) score -= 0.3;
  return Math.max(0, Math.min(1, score));
}

// ── Public API ──

export function analyzeTask(description, cwd = '.') {
  let fingerprint = null;
  let llmUsed = false;

  try {
    fingerprint = scanCodebase(cwd);
  } catch (err) {
    console.error(`[task-decomposer] scan: ${err.message}`);
  }

  const specExcerpt = fingerprint ? fingerprint.specExcerpt : '';

  // Try LLM
  let llmResult = null;
  try {
    const prompt = buildPrompt(description, fingerprint || {}, specExcerpt);
    const raw = callLLM(prompt);
    if (raw) {
      const validation = validateLLMResponse(raw);
      if (validation.valid) {
        llmResult = validation.data;
        llmUsed = true;
      } else {
        console.error(`[task-decomposer] llm-validation: ${validation.errors.join('; ')}`);
      }
    }
  } catch (err) {
    console.error(`[task-decomposer] llm: ${err.message}`);
  }

  if (llmResult) {
    return {
      taskType: llmResult.taskType,
      areas: [...new Set(llmResult.components.flatMap(c => c.areas))],
      complexity: llmResult.complexity,
      parallelizable: llmResult.parallelizable,
      estimatedComponents: llmResult.components.length,
      fingerprint,
      llmUsed,
      _components: llmResult.components,
    };
  }

  // Heuristic fallback
  const heuristic = heuristicDecompose(description, fingerprint);
  return {
    taskType: heuristic.taskType,
    areas: [...new Set(heuristic.components.flatMap(c => c.areas))],
    complexity: heuristic.complexity,
    parallelizable: heuristic.parallelizable,
    estimatedComponents: heuristic.components.length,
    fingerprint,
    llmUsed: false,
    _components: heuristic.components,
  };
}

export function identifyComponents(analysis) {
  // If LLM-generated components are attached, use them
  if (analysis._components && Array.isArray(analysis._components) && analysis._components.length > 0) {
    return analysis._components;
  }

  // Fallback: fingerprint-based heuristic
  if (analysis.fingerprint) {
    const heuristic = heuristicDecompose(
      analysis.areas.join(' '),
      analysis.fingerprint
    );
    return heuristic.components;
  }

  // Last resort: description-only regex (v1 behavior)
  const { areas } = analysis;
  if (!analysis.parallelizable) {
    return [{
      id: 'main',
      title: 'Main task',
      areas: [...areas],
      filePatterns: areas.flatMap(a => AREA_FILE_PATTERNS[a] || []),
      dependencies: [],
      modelHint: 'sonnet',
    }];
  }

  return areas.map(a => ({
    id: a,
    title: `${a.charAt(0).toUpperCase() + a.slice(1)} implementation`,
    areas: [a],
    filePatterns: AREA_FILE_PATTERNS[a] || [],
    dependencies: [],
    modelHint: 'sonnet',
  }));
}

// ── Execution Order (Kahn's Algorithm) — UNCHANGED ──

export function calculateExecutionOrder(components) {
  const inDeg = new Map(), adj = new Map();
  for (const c of components) { inDeg.set(c.id, 0); adj.set(c.id, []); }
  for (const c of components) for (const d of c.dependencies) if (adj.has(d)) { adj.get(d).push(c.id); inDeg.set(c.id, (inDeg.get(c.id) || 0) + 1); }
  const batches = [], visited = new Set();
  while (visited.size < components.length) {
    const batch = [];
    for (const [id, deg] of inDeg) if (!visited.has(id) && deg === 0) batch.push(id);
    if (batch.length === 0) { batches.push(components.filter(c => !visited.has(c.id)).map(c => c.id)); break; }
    batches.push(batch);
    for (const id of batch) { visited.add(id); for (const n of adj.get(id) || []) inDeg.set(n, inDeg.get(n) - 1); }
  }
  return batches;
}

// ── Cycle Detection — UNCHANGED ──

export function detectCycles(components) {
  const visited = new Set(), recStack = new Set(), cycles = [];
  function dfs(id, path) {
    visited.add(id); recStack.add(id);
    const comp = components.find(c => c.id === id);
    if (!comp) { recStack.delete(id); return; }
    for (const dep of comp.dependencies) {
      if (!visited.has(dep)) dfs(dep, [...path, id]);
      else if (recStack.has(dep)) { const s = path.indexOf(dep); cycles.push([...path.slice(s >= 0 ? s : 0), id, dep]); }
    }
    recStack.delete(id);
  }
  for (const c of components) if (!visited.has(c.id)) dfs(c.id, []);
  return cycles;
}

// ── Decomposition Safety Gate ──
// Decomposition is for control/safety/recoverability, NOT capability showcase.
// If splitting is unsafe, fall back to a single component.

function checkDecompositionSafety(components) {
  if (components.length <= 1) return { safe: true, warnings: [] };
  const warnings = [];

  // Warn: components without file ownership (hard to isolate in worktree)
  const noScope = components.filter(c => !c.filePatterns || c.filePatterns.length === 0);
  if (noScope.length > 0) {
    warnings.push(`${noScope.length} component(s) have no file scope: ${noScope.map(c => c.id).join(', ')}`);
  }

  // Warn: high coupling (component depends on >60% of others)
  const maxDeps = Math.ceil(components.length * 0.6);
  const overCoupled = components.filter(c => c.dependencies.length > maxDeps);
  if (overCoupled.length > 0) {
    warnings.push(`High coupling: "${overCoupled[0].id}" depends on ${overCoupled[0].dependencies.length}/${components.length - 1} others`);
  }

  // Only unsafe if ALL components lack scope (total collapse warranted)
  const safe = noScope.length < components.length;
  return { safe, warnings };
}

// ── Full Pipeline ──

export function decomposeTask(description, { cwd = '.', spec = '' } = {}) {
  try {
    const analysis = analyzeTask(description, cwd);
    let components = identifyComponents(analysis);

    // Safety gate: warn on risky decomposition, collapse only if truly unsafe
    if (components.length > 1) {
      const safety = checkDecompositionSafety(components);
      for (const w of safety.warnings) {
        console.error(`[task-decomposer] safety-warning: ${w}`);
      }
      if (!safety.safe) {
        console.error(`[task-decomposer] safety-gate: all components lack scope — collapsing to single component`);
        components = [{
          id: 'main',
          title: 'Main task (safety-collapsed)',
          areas: [...new Set(components.flatMap(c => c.areas))],
          filePatterns: [...new Set(components.flatMap(c => c.filePatterns))],
          dependencies: [],
          modelHint: 'opus',
        }];
        analysis.parallelizable = false;
      }
    }

    const cycles = detectCycles(components);

    // Break cycles by removing the last edge
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        const src = cycle[cycle.length - 2];
        const tgt = cycle[cycle.length - 1];
        const comp = components.find(c => c.id === src);
        if (comp) comp.dependencies = comp.dependencies.filter(d => d !== tgt);
      }
    }

    const executionOrder = calculateExecutionOrder(components);

    // Strip internal _components from analysis before returning (HOLE-002)
    const { _components, ...cleanAnalysis } = analysis;

    return {
      analysis: cleanAnalysis,
      components,
      executionOrder,
      cycles,
      summary: formatSummary(analysis, components, executionOrder),
    };
  } catch (err) {
    console.error(`[task-decomposer] pipeline: ${err.message}`);
    // Absolute last resort: return minimal valid result
    const fallbackComponent = {
      id: 'main',
      title: 'Main task',
      areas: ['backend'],
      filePatterns: [],
      dependencies: [],
      modelHint: 'sonnet',
    };
    return {
      analysis: {
        taskType: 'feature',
        areas: ['backend'],
        complexity: 0.5,
        parallelizable: false,
        estimatedComponents: 1,
        fingerprint: null,
        llmUsed: false,
      },
      components: [fallbackComponent],
      executionOrder: [['main']],
      cycles: [],
      summary: 'Task: feature (complexity: 50%)\nAreas: backend\nComponents: 1 (parallel: no)\n\nExecution order:\n  Batch 1: main [sonnet]',
    };
  }
}

function formatSummary(analysis, components, executionOrder) {
  const lines = [
    `Task: ${analysis.taskType} (complexity: ${(analysis.complexity * 100).toFixed(0)}%)`,
    `Areas: ${analysis.areas.join(', ')}`,
    `Components: ${components.length} (parallel: ${analysis.parallelizable ? 'yes' : 'no'})`,
    '',
    'Execution order:',
  ];
  for (let i = 0; i < executionOrder.length; i++) {
    const batch = executionOrder[i].map(id => {
      const c = components.find(comp => comp.id === id);
      return `${id} [${c?.modelHint || 'sonnet'}]`;
    });
    lines.push(`  Batch ${i + 1}: ${batch.join(' | ')}`);
  }
  return lines.join('\n');
}
