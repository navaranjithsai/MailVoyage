import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // API unit tests run without requiring real credentials.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/api',
      include: ['src/utils/**/*.ts'],
    },
  },
});
