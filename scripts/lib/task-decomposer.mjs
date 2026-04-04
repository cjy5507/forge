// Task Decomposition Engine — breaks work into parallelizable lanes
// Matches /batch baseline: analyze → identify components → assign ownership → calculate order

import { existsSync } from 'fs';
import { join } from 'path';

// ── Task Type Detection ──

const TASK_PATTERNS = {
  'fullstack-app': /\b(full.?stack|app|application|website|web app|SaaS|dashboard)\b/i,
  'feature': /\b(add|implement|create|build|new feature|기능|만들어|추가)\b/i,
  'refactoring': /\b(refactor|restructure|reorganize|clean.?up|리팩토링|정리)\b/i,
  'bug-fix': /\b(fix|bug|error|broken|안 ?돼|고쳐|오류|에러|crash)\b/i,
  'testing': /\b(test|spec|coverage|테스트)\b/i,
  'documentation': /\b(doc|readme|guide|문서)\b/i,
  'migration': /\b(migrat|upgrade|convert|이전|마이그레이션)\b/i,
  'optimization': /\b(optimi[sz]|perf|speed|빠르게|최적화)\b/i,
};

const AREA_PATTERNS = {
  frontend: /(\bui\b|\bux\b|component|page|layout|style|css|react|vue|svelte|next|frontend|프론트)/i,
  backend: /(api|server|route|controller|endpoint|express|fastapi|backend|백엔드|서버)/i,
  database: /(\bdb\b|database|schema|migration|model|prisma|drizzle|\bsql\b|디비|데이터베이스)/i,
  auth: /(auth|login|signup|session|token|permission|인증|로그인)/i,
  testing: /(test|spec|e2e|unit|integration|테스트)/i,
  infra: /(deploy|\bci\b|\bcd\b|docker|k8s|vercel|\baws\b|infra|인프라|배포)/i,
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

// ── Analysis ──

export function analyzeTask(description, cwd = '.') {
  const taskType = detectTaskType(description);
  const areas = detectAreas(description, cwd);
  const complexity = estimateComplexity(description, areas);
  const parallelizable = complexity >= 0.3 && areas.length >= 2;
  return { taskType, areas, complexity, parallelizable, estimatedComponents: parallelizable ? Math.min(areas.length, 6) : 1 };
}

function detectTaskType(description) {
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(description)) return type;
  }
  return 'feature';
}

function detectAreas(description, cwd = '.') {
  const areas = [];
  for (const [area, pattern] of Object.entries(AREA_PATTERNS)) {
    if (pattern.test(description)) areas.push(area);
  }
  if (areas.length === 0) areas.push(...detectAreasFromCodebase(cwd));
  return [...new Set(areas)];
}

function detectAreasFromCodebase(cwd) {
  const areas = [];
  const checks = [
    ['frontend', ['src/components', 'src/pages', 'src/app', 'pages', 'app']],
    ['backend', ['src/api', 'src/routes', 'src/controllers', 'server', 'api']],
    ['database', ['src/db', 'src/models', 'prisma', 'drizzle', 'migrations']],
  ];
  for (const [area, dirs] of checks) {
    if (dirs.some(d => existsSync(join(cwd, d)))) areas.push(area);
  }
  return areas.length > 0 ? areas : ['backend'];
}

function estimateComplexity(description, areas) {
  let score = 0;
  if (description.length > 200) score += 0.2;
  else if (description.length > 100) score += 0.1;
  score += Math.min(areas.length * 0.15, 0.45);
  if (/\b(integrat|architect|system|pipeline|workflow|multi|complex|전체|시스템|아키텍처)\b/i.test(description)) score += 0.2;
  if (/\b(simple|quick|small|trivial|간단|빠르게|하나만)\b/i.test(description)) score -= 0.3;
  return Math.max(0, Math.min(1, score));
}

// ── Component Identification ──

export function identifyComponents(analysis) {
  const { taskType, areas } = analysis;
  if (!analysis.parallelizable) {
    return [{ id: 'main', title: 'Main task', areas: [...areas], filePatterns: areas.flatMap(a => AREA_FILE_PATTERNS[a] || []), dependencies: [], modelHint: 'sonnet' }];
  }
  switch (taskType) {
    case 'fullstack-app': return fullstackStrategy(areas);
    case 'refactoring': return refactoringStrategy(areas);
    case 'bug-fix': return [{ id: 'fix', title: 'Bug fix', areas: [...areas], filePatterns: areas.flatMap(a => AREA_FILE_PATTERNS[a] || []), dependencies: [], modelHint: 'sonnet' }];
    default: return featureStrategy(areas);
  }
}

function fullstackStrategy(areas) {
  const c = [];
  c.push({ id: 'shared', title: 'Shared types and utilities', areas: ['shared'], filePatterns: AREA_FILE_PATTERNS.shared, dependencies: [], modelHint: 'sonnet' });
  if (areas.includes('database')) c.push({ id: 'database', title: 'Database schema and models', areas: ['database'], filePatterns: AREA_FILE_PATTERNS.database, dependencies: ['shared'], modelHint: 'sonnet' });
  if (areas.includes('auth')) c.push({ id: 'auth', title: 'Authentication and authorization', areas: ['auth'], filePatterns: AREA_FILE_PATTERNS.auth, dependencies: ['shared', ...(areas.includes('database') ? ['database'] : [])], modelHint: 'sonnet' });
  if (areas.includes('backend')) { const deps = ['shared']; if (areas.includes('database')) deps.push('database'); if (areas.includes('auth')) deps.push('auth'); c.push({ id: 'backend', title: 'API routes and controllers', areas: ['backend'], filePatterns: AREA_FILE_PATTERNS.backend, dependencies: deps, modelHint: 'sonnet' }); }
  if (areas.includes('frontend')) c.push({ id: 'frontend', title: 'UI components and pages', areas: ['frontend'], filePatterns: AREA_FILE_PATTERNS.frontend, dependencies: ['shared'], modelHint: 'sonnet' });
  if (areas.includes('testing')) c.push({ id: 'testing', title: 'Integration tests', areas: ['testing'], filePatterns: AREA_FILE_PATTERNS.testing, dependencies: c.map(x => x.id), modelHint: 'opus' });
  return c;
}

function featureStrategy(areas) {
  const order = ['shared', 'database', 'auth', 'backend', 'frontend', 'testing'];
  const c = areas.map(a => ({ id: a, title: `${a.charAt(0).toUpperCase() + a.slice(1)} implementation`, areas: [a], filePatterns: AREA_FILE_PATTERNS[a] || [], dependencies: [], modelHint: 'sonnet' }));
  for (const comp of c) { const idx = order.indexOf(comp.id); if (idx > 0) comp.dependencies = c.filter(x => x.id !== comp.id && order.indexOf(x.id) < idx).map(x => x.id); }
  return c;
}

function refactoringStrategy(areas) {
  return areas.map(a => ({ id: a, title: `Refactor ${a}`, areas: [a], filePatterns: AREA_FILE_PATTERNS[a] || [], dependencies: [], modelHint: 'sonnet' }));
}

// ── Execution Order (Kahn's Algorithm) ──

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

// ── Cycle Detection ──

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

// ── Full Pipeline ──

export function decomposeTask(description, { cwd = '.', spec = '' } = {}) {
  const analysis = analyzeTask(description, cwd);
  const components = identifyComponents(analysis);
  const cycles = detectCycles(components);
  if (cycles.length > 0) for (const cycle of cycles) { const src = cycle[cycle.length - 2], tgt = cycle[cycle.length - 1]; const comp = components.find(c => c.id === src); if (comp) comp.dependencies = comp.dependencies.filter(d => d !== tgt); }
  const executionOrder = calculateExecutionOrder(components);
  return { analysis, components, executionOrder, cycles, summary: formatSummary(analysis, components, executionOrder) };
}

function formatSummary(analysis, components, executionOrder) {
  const lines = [`Task: ${analysis.taskType} (complexity: ${(analysis.complexity * 100).toFixed(0)}%)`, `Areas: ${analysis.areas.join(', ')}`, `Components: ${components.length} (parallel: ${analysis.parallelizable ? 'yes' : 'no'})`, '', 'Execution order:'];
  for (let i = 0; i < executionOrder.length; i++) {
    const batch = executionOrder[i].map(id => { const c = components.find(comp => comp.id === id); return `${id} [${c?.modelHint || 'sonnet'}]`; });
    lines.push(`  Batch ${i + 1}: ${batch.join(' | ')}`);
  }
  return lines.join('\n');
}
