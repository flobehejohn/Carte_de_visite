import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000, // Laisse 60s max au test total
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    // FORCE L'ACCÉLÉRATION GPU EN MODE HEADLESS
    launchOptions: {
      args: [
        '--ignore-gpu-blocklist',
        '--use-gl=angle',
        '--use-angle=gl',
      ]
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
