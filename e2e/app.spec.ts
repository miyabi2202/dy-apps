import { expect, test } from '@playwright/test';

test('renders and increments the counter', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tetris' })).toBeVisible();

  const button = page.getByRole('button', { name: /Count:/ });
  await expect(button).toHaveText('Count: 0');
  await button.click();
  await expect(button).toHaveText('Count: 1');
});

test('applies StyleX styles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveCSS('display', 'flex');
});
