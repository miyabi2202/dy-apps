import { expect, test, type Page } from '@playwright/test';

/** JS/CSS files the page requested, by chunk name without the content hash. */
function trackAssets(page: Page): string[] {
  const assets: string[] = [];
  page.on('request', (r) => {
    const m = /\/assets\/([\w-]+?)-[\w-]{8}\.(js|css)$/.exec(new URL(r.url()).pathname);
    if (m) assets.push(`${m[1]}.${m[2]}`);
  });
  return assets;
}

let consoleErrors: string[] = [];

test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('index lists every app and does not download any app code', async ({ page }) => {
  const assets = trackAssets(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'dy-apps' })).toBeVisible();
  await expect(page.getByRole('link', { name: '方块干预实验室' })).toHaveAttribute(
    'href',
    '/tetris',
  );
  await page.waitForLoadState('networkidle');
  expect(assets).toEqual(expect.arrayContaining(['index.js', 'react.js', 'index.css']));
  expect(assets.filter((a) => a.startsWith('app-'))).toEqual([]);
  expect(assets).not.toContain('stylex.js');
});

test('opening an app fetches its chunk on demand; back returns to the index', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const assets = trackAssets(page);
  await page.getByRole('link', { name: '方块干预实验室' }).click();
  await expect(page).toHaveURL('/tetris');
  await expect(page.getByTestId('board')).toBeVisible();
  expect(assets).toContain('app-tetris.js');
  expect(assets).not.toContain('react.js'); // shared vendor chunk was already loaded

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'dy-apps' })).toBeVisible();
});

test('app routes work as deep links', async ({ page }) => {
  await page.goto('/tetris?seed=1');
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page).toHaveTitle('方块干预实验室');
});

test('unknown paths show a not-found page with a way home', async ({ page }) => {
  await page.goto('/no-such-app');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
  await page.getByRole('link', { name: '返回首页' }).click();
  await expect(page).toHaveURL('/');
});
