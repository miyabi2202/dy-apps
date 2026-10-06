import { fakeMessageAt } from '@dy-apps/services';
import { obsLinkText, sourcePanelText, testIds } from '@dy-apps/ui/messages';
import { expect, test } from '@playwright/test';
import { meta } from '../meta';

test('the OBS link plays the fake messages in order at the preview interval', async ({ page }) => {
  // `?random=0`: the fake list in order at a fixed interval, so the messages are known.
  await page.goto(`${meta.path}?random=0`);
  await page.getByRole('combobox', { name: sourcePanelText.title }).selectOption({
    label: sourcePanelText.sources.fake,
  });
  await page.getByRole('button', { name: sourcePanelText.fake.start }).click();
  await page.getByLabel(sourcePanelText.interval).fill('200');

  const obsUrl = await page.getByLabel(obsLinkText.input).inputValue();
  const params = new URL(obsUrl).searchParams;
  expect(params.get('demo')).toBe('200');
  expect(params.get('random')).toBe('0');
  await page.goto(obsUrl);

  // One card every 200 ms. The list is virtual: it keeps only on-screen rows plus 6 overscan
  // in the DOM, and drops old ones as it follows the newest. At 720 px tall that's about 13
  // rows, so card 0 leaves the DOM roughly 2.6 s in. Checking each card as it lands finishes
  // by about 1.4 s, well before then. If a check ever stalls past that (a very slow machine),
  // make the viewport taller so all 7 cards fit on screen.
  const list = page.getByTestId(testIds.danmakuList);
  for (let i = 0; i < 7; i += 1) {
    const expected = fakeMessageAt(i);
    const card = list.locator(`[data-index="${i}"]`);
    await expect(card.getByText(expected.user.nickname, { exact: true })).toBeVisible();
    if (expected.gift) {
      await expect(card.getByText(expected.gift.name, { exact: true })).toBeVisible();
      await expect(card.getByText(`×${expected.gift.count}`, { exact: true })).toBeVisible();
    } else if (expected.likes) {
      await expect(card.getByText(`×${expected.likes}`, { exact: true })).toBeVisible();
    } else {
      await expect(card.getByText(expected.text, { exact: true })).toBeVisible();
    }
  }
});
