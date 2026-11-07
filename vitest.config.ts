import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'scripts/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/locale.ts', 'src/recordingPolicy.ts', 'electron/history.ts', 'electron/hudState.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 85,
        functions: 90,
        branches: 70,
        statements: 85,
      },
    },
  },
});
