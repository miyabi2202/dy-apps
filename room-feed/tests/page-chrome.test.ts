import type { Locator, Page } from 'playwright-core';
import { PAGE_WAIT } from '../src/douyin/page-map';
import { PageChrome } from '../src/page/page-chrome';

/** A page whose every locator is the same fake one, which reads `text`, shows or not, and logs its clicks. */
function fakePage(options: { text?: string; visible?: boolean; fails?: boolean } = {}) {
  const clicks: { timeout?: number }[] = [];
  const reads: { timeout?: number }[] = [];
  const locator: Record<string, unknown> = {
    filter: () => locator,
    first: () => locator,
    isVisible: () =>
      options.fails ? Promise.reject(new Error('detached')) : Promise.resolve(!!options.visible),
    click: (o: { timeout?: number }) => {
      clicks.push(o);
      return Promise.resolve();
    },
    innerText: (o: { timeout?: number }) => {
      reads.push(o);
      return options.fails
        ? Promise.reject(new Error('gone'))
        : Promise.resolve(options.text ?? '');
    },
  };
  const page = { locator: () => locator as unknown as Locator } as unknown as Page;
  return { page, clicks, reads };
}

describe('PageChrome', () => {
  it('reads the balance as the number the 充值 slot shows, and null for anything else', async () => {
    expect(await new PageChrome(fakePage({ text: ' 128 ' }).page).balance()).toBe(128);
    expect(await new PageChrome(fakePage({ text: '充值' }).page).balance()).toBeNull();
    expect(await new PageChrome(fakePage({ text: '1.5万' }).page).balance()).toBeNull();
    expect(await new PageChrome(fakePage({ fails: true }).page).balance()).toBeNull();
  });

  it('waits the page map’s time to read the balance and to click a ×', async () => {
    const fake = fakePage({ text: '3' });
    const chrome = new PageChrome(fake.page);
    await chrome.balance();
    await chrome.clickClose();
    await chrome.clickGuideClose();
    expect(fake.reads).toEqual([{ timeout: PAGE_WAIT.balance }]);
    expect(fake.clicks).toEqual([{ timeout: PAGE_WAIT.close }, { timeout: PAGE_WAIT.close }]);
  });

  it('says whether the ×s show, and no when asking fails', async () => {
    expect(await new PageChrome(fakePage({ visible: true }).page).closeShown()).toBe(true);
    expect(await new PageChrome(fakePage({ visible: false }).page).guideShown()).toBe(false);
    expect(await new PageChrome(fakePage({ fails: true }).page).closeShown()).toBe(false);
  });
});
