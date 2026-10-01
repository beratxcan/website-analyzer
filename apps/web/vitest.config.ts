import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // React 19 + automatic JSX runtime via esbuild (no plugin needed for tests).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    // globals enable @testing-library/react auto-cleanup between tests.
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});