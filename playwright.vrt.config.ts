import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/vrt',
  testMatch: '**/*.vrt.spec.ts',
  timeout: 300_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  expect: {
    timeout: 90_000,
  },

  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: {
      width: 960,
      height: 540,
    },
    launchOptions: {
      args: [
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
        '--use-gl=swiftshader',
        '--disable-gpu-vsync',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
    },
  },

  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});