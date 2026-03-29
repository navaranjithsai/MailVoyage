import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep unit tests fully local and credential-free by default.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage/frontend',
      include: ['src/lib/**/*.ts'],
    },
  },
});
