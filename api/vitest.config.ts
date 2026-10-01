import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API unit tests run without requiring real credentials.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // Vitest 5 fork workers intermittently fail to start under Node 26 on
    // Windows. Threads keep the API suite deterministic without changing
    // test isolation semantics for this credential-free suite.
    pool: 'threads',
    maxWorkers: 1,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/api',
      include: ['src/utils/**/*.ts'],
    },
  },
});
