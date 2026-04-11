import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOCAL_LESSONS_REL = '.forge/lessons';
const GLOBAL_LESSONS_ABS = join(homedir(), '.claude', 'forge-lessons');
const DEFAULT_MAX_BRIEF = 10;
const VALID_TYPES = new Set(['pattern', 'process', 'estimation']);

function resolveGlobalDir(override) {
  if (typeof override === 'string' && override.length > 0) return override;
  const fromEnv = process.env.FORGE_LESSONS_GLOBAL_DIR;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return GLOBAL_LESSONS_ABS;
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    files.push(join(dir, entry.name));
  }
  return files;
}

function readFileSafe(path) {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function parseLessonContent(content) {
  const lines = content.split(/\r?\n/);
  const meta = {
    title: '',
    type: 'unknown',
    source_note: '',
    date: '',
    severity: '',
  };
  const sections = {};
  let currentSection = null;
  let sectionBuf = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const titleMatch = line.match(/^#\s*LESSON\s*:\s*(.+)$/i);
    if (titleMatch && !meta.title) {
      meta.title = titleMatch[1].trim();
      continue;
    }

    const metaMatch = line.match(/^(Type|Source|Date|Severity)\s*:\s*(.+)$/i);
    if (metaMatch && currentSection === null) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (key === 'type') {
        meta.type = VALID_TYPES.has(value.toLowerCase()) ? value.toLowerCase() : 'unknown';
      } else if (key === 'source') {
        meta.source_note = value;
      } else if (key === 'date') {
        meta.date = value;
      } else if (key === 'severity') {
        meta.severity = value;
      }
      continue;
    }

    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      if (currentSection !== null) {
        sections[currentSection] = sectionBuf.join('\n').trim();
      }
      currentSection = sectionMatch[1].trim().toLowerCase();
      sectionBuf = [];
      continue;
    }

    if (currentSection !== null) {
      sectionBuf.push(line);
    }
  }

  if (currentSection !== null) {
    sections[currentSection] = sectionBuf.join('\n').trim();
  }

  return { meta, sections };
}

function firstNonEmptyLine(text, maxLen = 240) {
  if (!text) return '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[-*\s]+/, '').trim();
    if (line.length > 0) {
      return line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line;
    }
  }
  return '';
}

function toBriefEntry(filePath, source) {
  const content = readFileSafe(filePath);
  if (content === null) return null;
  const { meta, sections } = parseLessonContent(content);
  const id = filePath.split(/[\\/]/).pop().replace(/\.md$/i, '');
  const title = meta.title || id;
  const applies = firstNonEmptyLine(sections['applies when'] || '', 160);
  const prevention = firstNonEmptyLine(
    sections['prevention rule'] || sections['process change'] || sections['calibration rule'] || '',
    240,
  );

  return {
    id,
    source,
    type: meta.type,
    title,
    applies_when: applies,
    prevention,
    path: filePath,
  };
}

function matchesProject(brief, projectType) {
  if (!projectType) return true;
  if (!brief.applies_when) return true;
  const haystack = brief.applies_when.toLowerCase();
  const needles = String(projectType)
    .toLowerCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (needles.length === 0) return true;
  return needles.some(needle => haystack.includes(needle));
}

export function getLessonDirectories(cwd = '.', { globalDir } = {}) {
  return {
    local: join(cwd, LOCAL_LESSONS_REL),
    global: resolveGlobalDir(globalDir),
  };
}

export function loadAllLessons({ cwd = '.', globalDir } = {}) {
  const dirs = getLessonDirectories(cwd, { globalDir });
  const localFiles = listMarkdownFiles(dirs.local);
  const globalFiles = listMarkdownFiles(dirs.global);

  const local = [];
  const global = [];

  for (const file of localFiles) {
    const entry = toBriefEntry(file, 'local');
    if (entry) local.push(entry);
  }
  for (const file of globalFiles) {
    const entry = toBriefEntry(file, 'global');
    if (entry) global.push(entry);
  }

  return { local, global };
}

export function buildLessonsBrief({
  cwd = '.',
  projectType = '',
  maxItems = DEFAULT_MAX_BRIEF,
  globalDir,
} = {}) {
  const { local, global } = loadAllLessons({ cwd, globalDir });
  const combined = [...local, ...global];
  const filtered = combined.filter(brief => matchesProject(brief, projectType));
  const sorted = filtered.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'local' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return sorted.slice(0, Math.max(0, maxItems));
}

export function initializeLessonsBrief(cwd = '.', { projectType = '', globalDir } = {}) {
  return buildLessonsBrief({ cwd, projectType, globalDir });
}
