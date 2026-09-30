import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000',
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === 'true',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium' } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});
