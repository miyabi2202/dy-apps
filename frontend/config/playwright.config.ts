import { defineConfig, devices } from '@playwright/test';

const port = 4173;

/** Chromium integration tests against the production build: `vite build` + `vite preview`. */
export default defineConfig({
  // Each app's own integration-tests/ folder.
  testDir: '../src/apps',
  testMatch: '*/integration-tests/**/*.spec.ts',
  outputDir: '../test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite build -c config/vite.config.ts && pnpm exec vite preview -c config/vite.config.ts --port ${port} --strictPort`,
    cwd: '..',
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
