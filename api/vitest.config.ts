import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API unit tests run without requiring real credentials.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // API tests load shared Express, dotenv, and service modules. Serialize
    // files so those module-level resources cannot initialize concurrently;
    // this is deterministic across Windows, macOS, Linux, and CI runners.
    // It affects test speed only, never the deployed API or its users.
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/api',
      include: ['src/utils/**/*.ts'],
    },
  },
});
