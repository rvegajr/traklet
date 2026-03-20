import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@contracts': resolve(__dirname, 'src/contracts'),
      '@core': resolve(__dirname, 'src/core'),
      '@adapters': resolve(__dirname, 'src/adapters'),
      '@presenters': resolve(__dirname, 'src/presenters'),
      '@models': resolve(__dirname, 'src/models'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/core/*.ts',
        'src/adapters/*.ts',
        'src/presenters/*.ts',
        'src/builder/*.ts',
        'src/Traklet.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.integration.ts',
        '**/index.ts',
        'src/presenters/IPresenter.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
    reporters: ['verbose'],
    testTimeout: 10000,
  },
});
