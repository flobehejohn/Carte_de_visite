import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['src/test/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx,js,jsx}',
    ],

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.git/**',
      '**/audit/**',
      '**/artifacts/**',
      '**/_bak*/**',
      '**/_bak_*/**',
      '**/_archive*/**',
    ],

    environment: 'node',
    globals: true,
    passWithNoTests: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default'],
  },
});
