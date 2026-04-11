import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const LOCAL_LESSONS_REL = '.forge/lessons';
const VALID_TYPES = new Set(['pattern', 'process', 'estimation']);
const SECTION_ORDER = [
  'What happened',
  'Root cause',
  'Prevention rule',
  'Impact',
  'Process change',
  'Estimated vs actual',
  'Why the gap',
  'Calibration rule',
  'Applies when',
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'lesson';
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function formatSections(sections) {
  if (!sections || typeof sections !== 'object') return '';
  const written = new Set();
  const lines = [];

  for (const label of SECTION_ORDER) {
    const key = label.toLowerCase();
    if (key in sections && typeof sections[key] === 'string') {
      lines.push(`## ${label}`);
      lines.push(sections[key].trim());
      lines.push('');
      written.add(key);
    }
  }

  for (const [key, value] of Object.entries(sections)) {
    if (written.has(key)) continue;
    if (typeof value !== 'string') continue;
    const prettyLabel = key
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    lines.push(`## ${prettyLabel}`);
    lines.push(value.trim());
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Validate a lesson file's content against the harness-learning protocol.
 * Returns { valid, errors } — valid === true means parseable + complete.
 * @param {string} content
 */
export function validateLessonContent(content) {
  const errors = [];
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { valid: false, errors: ['content is empty'] };
  }

  const titleMatch = content.match(/^#\s*LESSON\s*:\s*(.+)$/im);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push('missing "# LESSON: {title}" header');
  }

  const typeMatch = content.match(/^Type\s*:\s*(\S+)/im);
  if (!typeMatch) {
    errors.push('missing "Type:" metadata line');
  } else if (!VALID_TYPES.has(typeMatch[1].trim().toLowerCase())) {
    errors.push(`Type must be one of: ${[...VALID_TYPES].join(', ')}`);
  }

  if (!/^##\s+Applies when\b/im.test(content)) {
    errors.push('missing "## Applies when" section');
  }

  const hasAnyPrevention = /^##\s+(?:Prevention rule|Process change|Calibration rule)\b/im.test(content);
  if (!hasAnyPrevention) {
    errors.push('missing at least one of: Prevention rule / Process change / Calibration rule');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a lesson markdown file in `.forge/lessons/{id}.md`.
 * Validates before writing — returns { valid, errors } without writing if
 * validation fails.
 *
 * @param {object} options
 * @param {string} [options.cwd] — project root; defaults to '.'
 * @param {string} options.type — one of 'pattern' | 'process' | 'estimation'
 * @param {string} options.title — short title (goes into "# LESSON: {title}")
 * @param {string} [options.id] — explicit file id; defaults to slugified title
 * @param {string} [options.sourceNote] — "Source: ..." metadata line value
 * @param {string} [options.date] — ISO date string; defaults to today
 * @param {string} [options.severity] — optional severity tag
 * @param {Record<string, string>} [options.sections]
 *   Section content keyed by lowercased section name. Unknown keys are
 *   appended after the canonical order. Common keys:
 *   - pattern: 'what happened', 'root cause', 'prevention rule', 'applies when'
 *   - process: 'what happened', 'impact', 'process change', 'applies when'
 *   - estimation: 'estimated vs actual', 'why the gap', 'calibration rule'
 * @param {boolean} [options.overwrite] — allow replacing an existing file
 * @returns {{ ok: true, path: string, id: string } | { ok: false, errors: string[] }}
 */
export function createLesson(options = {}) {
  const {
    cwd = '.',
    type,
    title,
    id: explicitId,
    sourceNote = '',
    date,
    severity = '',
    sections = {},
    overwrite = false,
  } = options;

  const errors = [];
  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push('title is required');
  }
  if (typeof type !== 'string' || !VALID_TYPES.has(type.toLowerCase())) {
    errors.push(`type must be one of: ${[...VALID_TYPES].join(', ')}`);
  }
  if (sections && typeof sections !== 'object') {
    errors.push('sections must be an object keyed by section name');
  }

  const normalizedSections = {};
  for (const [key, value] of Object.entries(sections || {})) {
    if (typeof value === 'string') {
      normalizedSections[key.toLowerCase()] = value;
    }
  }

  if (!('applies when' in normalizedSections)) {
    errors.push('sections["applies when"] is required by protocol');
  }
  const hasPrevention =
    'prevention rule' in normalizedSections ||
    'process change' in normalizedSections ||
    'calibration rule' in normalizedSections;
  if (!hasPrevention) {
    errors.push('sections must include at least one of: "prevention rule", "process change", "calibration rule"');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const lessonId = slugify(explicitId || title);
  const lessonsDir = join(cwd, LOCAL_LESSONS_REL);
  const targetPath = join(lessonsDir, `${lessonId}.md`);

  if (existsSync(targetPath) && !overwrite) {
    return {
      ok: false,
      errors: [`lesson already exists at ${targetPath} (pass overwrite: true to replace)`],
    };
  }

  const metaLines = [
    `Type: ${type.toLowerCase()}`,
    sourceNote ? `Source: ${sourceNote}` : '',
    `Date: ${date || new Date().toISOString().slice(0, 10)}`,
    severity ? `Severity: ${severity}` : '',
  ].filter(Boolean);

  const body = [
    `# LESSON: ${title.trim()}`,
    ...metaLines,
    '',
    formatSections(normalizedSections),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';

  const validation = validateLessonContent(body);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  ensureDir(lessonsDir);
  writeFileSync(targetPath, body, 'utf8');
  return { ok: true, path: targetPath, id: lessonId };
}
