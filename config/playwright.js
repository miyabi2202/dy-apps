import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium e2e against a production build: runs `vite build` + `vite preview`
 * in `appRoot`, with tests in `<appRoot>/tests/e2e`.
 */
export function createPlaywrightConfig({ appRoot, port = 4173 }) {
  return defineConfig({
    testDir: path.join(appRoot, 'tests/e2e'),
    outputDir: path.join(appRoot, 'test-results'),
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
      command: `pnpm exec vite build && pnpm exec vite preview --port ${port} --strictPort`,
      cwd: appRoot,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  });
}
