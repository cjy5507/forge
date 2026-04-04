import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.{mts,mjs,ts,js}'],
    testTimeout: 15000,
    env: {
      FORGE_LLM_TIMEOUT_MS: '3000',
    },
  },
});
