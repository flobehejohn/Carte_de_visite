import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 15000, // Attente par défaut robuste
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined, // 1 seul worker en CI pour éviter les crash GPU/WebGL concurrents
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // LE CŒUR DU SPRINT 5.1 : Playwright démarre et éteint Vite lui-même
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // Laisse 2 minutes à Vite pour démarrer (sécurité)
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
