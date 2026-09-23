import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Resolve the @/ alias used throughout src/ so transitive imports transform
  // cleanly in Node, and inject __APP_VERSION__ so versionCheck.ts doesn't
  // reference an undefined global at module evaluation time.
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    // Keep unit tests fully local and credential-free by default.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    pool: 'forks',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/frontend',
      include: ['src/lib/**/*.ts'],
    },
  },
});
