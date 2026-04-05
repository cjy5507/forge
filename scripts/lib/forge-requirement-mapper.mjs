import { readTraceabilitySnapshot } from './forge-traceability.mjs';

const AREA_KEYWORDS = {
  frontend: ['ui', 'ux', 'frontend', 'react', 'page', 'component', 'layout', 'screen', 'view', 'style'],
  backend: ['api', 'backend', 'server', 'route', 'controller', 'endpoint', 'service'],
  database: ['database', 'db', 'schema', 'migration', 'model', 'sql', 'prisma', 'drizzle'],
  auth: ['auth', 'login', 'signup', 'session', 'token', 'permission', 'oauth'],
  testing: ['test', 'testing', 'coverage', 'spec', 'qa', 'regression'],
  infra: ['deploy', 'infra', 'docker', 'vercel', 'aws', 'ci', 'cd', 'k8s'],
  shared: ['shared', 'common', 'type', 'types', 'util', 'utils', 'config', 'library'],
};

function uniq(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function requirementText(req) {
  const acceptance = Array.isArray(req?.acceptanceCriteria)
    ? req.acceptanceCriteria.map(item => item?.text || '').join(' ')
    : '';
  return [req?.title, req?.summary, req?.rationale, acceptance]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
}

function explicitRequirementRefs(description = '') {
  return uniq(Array.from(String(description).matchAll(/\b(?:FR|NFR|UX|OPS)-\d+\b/g)).map(match => match[0]));
}

function requirementMatchesAreas(req, areas = []) {
  const haystack = requirementText(req);
  for (const area of areas) {
    const keywords = AREA_KEYWORDS[area] || [];
    if (keywords.some(keyword => haystack.includes(keyword))) {
      return true;
    }
  }
  return false;
}

function acceptanceRefsForRequirement(req) {
  return uniq(
    (Array.isArray(req?.acceptanceCriteria) ? req.acceptanceCriteria : [])
      .map(item => item?.id)
      .filter(Boolean),
  );
}

export function inferRequirementRefsForComponents(cwd = '.', description = '', components = []) {
  const snapshot = readTraceabilitySnapshot(cwd);
  if (!snapshot || !Array.isArray(snapshot.requirements) || snapshot.requirements.length === 0) {
    return [];
  }

  const explicitRefs = explicitRequirementRefs(description);
  const explicitSet = new Set(explicitRefs);

  return components.map((component, index) => {
    let matched = [];

    if (explicitSet.size > 0) {
      matched = snapshot.requirements.filter(req => explicitSet.has(req.id));
    } else if (components.length === 1) {
      matched = snapshot.requirements;
    } else if (component.id === 'shared') {
      matched = snapshot.requirements.filter(req => {
        const text = requirementText(req);
        return ['shared', 'common', 'integration', 'platform', 'config', 'type', 'types'].some(keyword => text.includes(keyword));
      });
      if (matched.length === 0) {
        matched = snapshot.requirements.filter(req => requirementMatchesAreas(req, ['frontend', 'backend', 'database', 'auth']));
      }
    } else {
      matched = snapshot.requirements.filter(req => requirementMatchesAreas(req, component.areas || []));
    }

    const requirementRefs = uniq(matched.map(req => req.id));
    const acceptanceRefs = uniq(matched.flatMap(req => acceptanceRefsForRequirement(req)));

    return {
      laneId: component.id || `lane-${index + 1}`,
      requirementRefs,
      acceptanceRefs,
    };
  });
}
