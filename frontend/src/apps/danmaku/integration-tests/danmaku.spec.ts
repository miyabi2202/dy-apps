import { expect, test } from '@playwright/test';

test('the OBS link plays fake messages at the preview interval', async ({ page }) => {
  await page.goto('/danmaku');
  await page.getByRole('combobox', { name: '数据来源' }).selectOption({ label: '模拟数据' });
  await page.getByRole('button', { name: '开始预览' }).click();
  await page.getByLabel('平均间隔').fill('200');

  const obsUrl = await page.getByLabel('OBS 链接').inputValue();
  expect(new URL(obsUrl).searchParams.get('demo')).toBe('200');
  await page.goto(obsUrl);

  await page.waitForTimeout(1000);
  const count = await page.getByTestId('danmaku-list').locator('[data-index]').count();
  expect(count).toBeGreaterThanOrEqual(2);
});
