import { describe, expect, it } from 'vitest';
import { normalizeRuntimeState } from './lib/forge-session.mjs';
import {
  initLaneRecordWith,
  setLaneStatusWith,
  markLaneMergeStateWith,
} from './lib/forge-lane-control.mjs';

describe('lane-control with DAG validation', () => {
  it('initializes a lane record and preserves dependencies', () => {
    const runtime = initLaneRecordWith(normalizeRuntimeState, {}, {
      laneId: 'api',
      title: 'API Lane',
      dependencies: ['shared'],
    });
    expect(runtime.lanes.api).toBeDefined();
    expect(runtime.lanes.api.title).toBe('API Lane');
    expect(runtime.lanes.api.dependencies).toEqual(['shared']);
  });

  it('sets lane status through mutateLane', () => {
    let runtime = initLaneRecordWith(normalizeRuntimeState, {}, {
      laneId: 'ui',
      title: 'UI Lane',
    });
    runtime = setLaneStatusWith(normalizeRuntimeState, runtime, {
      laneId: 'ui',
      status: 'in_progress',
    });
    expect(runtime.lanes.ui.status).toBe('in_progress');
  });

  it('handles merge state transition', () => {
    let runtime = initLaneRecordWith(normalizeRuntimeState, {}, {
      laneId: 'core',
      title: 'Core Lane',
    });
    runtime = markLaneMergeStateWith(normalizeRuntimeState, runtime, {
      laneId: 'core',
      mergeState: 'merged',
    });
    expect(runtime.lanes.core.merge_state).toBe('merged');
    expect(runtime.lanes.core.status).toBe('merged');
  });

  it('applies single normalization pass (no double normalization)', () => {
    let callCount = 0;
    const countingNormalize = (rt: any) => {
      callCount++;
      return normalizeRuntimeState(rt);
    };
    initLaneRecordWith(countingNormalize, {}, {
      laneId: 'test',
      title: 'Test',
    });
    // Should be called exactly once (output normalization only)
    expect(callCount).toBe(1);
  });
});
