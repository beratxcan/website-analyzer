import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration suites share one test database; run them serially.
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});