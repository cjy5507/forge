#!/usr/bin/env node

import { runHook } from '../lib/hook-runner.mjs';
import {
  getJsonReadCacheStats,
  readJsonFileDetailed,
  resetJsonReadCacheStats,
} from '../lib/forge-io.mjs';

runHook(async (input) => {
  const path = input?.path;
  resetJsonReadCacheStats();
  readJsonFileDetailed(path, null);
  readJsonFileDetailed(path, null);
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'FixtureHook',
      cacheStats: getJsonReadCacheStats(),
    },
  }));
}, { name: 'cache-hook' });
