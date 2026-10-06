import { obsLinkText, sourcePanelText, testIds } from '@dy-apps/ui/messages';
import { expect, test } from '@playwright/test';
import { meta } from '../meta';

test('the OBS link plays fake messages at the preview interval', async ({ page }) => {
  await page.goto(meta.path);
  await page
    .getByRole('combobox', { name: sourcePanelText.title })
    .selectOption({ label: sourcePanelText.sources.fake });
  await page.getByRole('button', { name: sourcePanelText.fake.start }).click();
  await page.getByLabel(sourcePanelText.interval).fill('200');

  const obsUrl = await page.getByLabel(obsLinkText.input).inputValue();
  expect(new URL(obsUrl).searchParams.get('demo')).toBe('200');
  await page.goto(obsUrl);

  await page.waitForTimeout(1000);
  const count = await page.getByTestId(testIds.danmakuList).locator('[data-index]').count();
  expect(count).toBeGreaterThanOrEqual(2);
});
