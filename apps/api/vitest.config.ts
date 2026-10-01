import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    // Integration suites share the analyzer_test database; run them serially.
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});