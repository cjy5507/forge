/**
 * Lane DAG validation utilities.
 * Validates acyclicity, detects orphan dependencies, and cleans up merged lanes.
 */

/**
 * Validate that the lane dependency graph is a valid DAG.
 * @param {Record<string, { deps?: string[], status?: string }>} lanes
 * @returns {{ valid: boolean, cycles: string[][], orphans: string[] }}
 */
export function validateLaneDag(lanes) {
  if (!lanes || typeof lanes !== 'object') {
    return { valid: true, cycles: [], orphans: [] };
  }

  const laneIds = new Set(Object.keys(lanes));
  const orphans = [];
  const cycles = [];

  // Detect orphan dependencies and self-references
  for (const [id, lane] of Object.entries(lanes)) {
    const deps = Array.isArray(lane.deps) ? lane.deps : [];
    for (const dep of deps) {
      if (dep === id) {
        orphans.push(`${id} (self-reference)`);
      } else if (!laneIds.has(dep)) {
        orphans.push(`${id} → ${dep} (not found)`);
      }
    }
  }

  // DFS cycle detection (white=0, gray=1, black=2)
  const color = {};
  for (const id of laneIds) color[id] = 0;

  function dfs(node, path) {
    color[node] = 1;
    path.push(node);

    const deps = Array.isArray(lanes[node]?.deps) ? lanes[node].deps : [];
    for (const dep of deps) {
      if (!laneIds.has(dep)) continue;
      if (color[dep] === 1) {
        const cycleStart = path.indexOf(dep);
        cycles.push([...path.slice(cycleStart), dep]);
      } else if (color[dep] === 0) {
        dfs(dep, path);
      }
    }

    path.pop();
    color[node] = 2;
  }

  for (const id of laneIds) {
    if (color[id] === 0) {
      dfs(id, []);
    }
  }

  return {
    valid: cycles.length === 0 && orphans.length === 0,
    cycles,
    orphans,
  };
}

/**
 * Remove merged lanes from other lanes' dependency lists.
 * @param {Record<string, { deps?: string[], status?: string, worktree?: string }>} lanes
 * @returns {Record<string, object>} cleaned lanes
 */
export function cleanupMergedLanes(lanes) {
  if (!lanes || typeof lanes !== 'object') {
    return {};
  }

  const mergedIds = new Set(
    Object.entries(lanes)
      .filter(([, lane]) => lane.status === 'merged' || lane.status === 'done')
      .map(([id]) => id),
  );

  const cleaned = {};
  for (const [id, lane] of Object.entries(lanes)) {
    const deps = Array.isArray(lane.deps) ? lane.deps : [];
    cleaned[id] = {
      ...lane,
      deps: deps.filter((dep) => !mergedIds.has(dep)),
    };

    if (mergedIds.has(id)) {
      cleaned[id].worktree = '';
    }
  }

  return cleaned;
}
