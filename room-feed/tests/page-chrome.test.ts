import type { Locator, Page } from 'playwright-core';
import { PAGE_WAIT } from '../src/douyin/page-map';
import { PageChrome } from '../src/page/page-chrome';

/** A page whose every locator is the same fake one, which reads `text`, shows or not, and logs its clicks. */
function fakePage(
  options: {
    text?: string;
    visible?: boolean;
    fails?: boolean;
    box?: { x: number; y: number; width: number; height: number } | null;
  } = {},
) {
  const clicks: { timeout?: number }[] = [];
  const mouseClicks: [number, number][] = [];
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
    boundingBox: () => Promise.resolve(options.box ?? null),
    innerText: (o: { timeout?: number }) => {
      reads.push(o);
      return options.fails
        ? Promise.reject(new Error('gone'))
        : Promise.resolve(options.text ?? '');
    },
  };
  const page = {
    locator: () => locator as unknown as Locator,
    viewportSize: () => ({ width: 1440, height: 900 }),
    mouse: {
      click: (x: number, y: number) => {
        mouseClicks.push([x, y]);
        return Promise.resolve();
      },
    },
  } as unknown as Page;
  return { page, clicks, reads, mouseClicks };
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

  it('closes a streamer’s card by a click at the page’s edge beside it, level with its middle', async () => {
    const middle = fakePage({ box: { x: 720, y: 14, width: 320, height: 441 } });
    await new PageChrome(middle.page).clickOffCard();
    const nearLeft = fakePage({ box: { x: 5, y: 100, width: 320, height: 400 } });
    await new PageChrome(nearLeft.page).clickOffCard();
    const gone = fakePage({ box: null });
    await new PageChrome(gone.page).clickOffCard();
    expect([middle.mouseClicks, nearLeft.mouseClicks, gone.mouseClicks]).toEqual([
      [[10, 234.5]],
      [[1430, 300]],
      [],
    ]);
  });
});
