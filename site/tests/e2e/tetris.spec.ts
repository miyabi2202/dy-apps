import { expect, test, type Page } from '@playwright/test';

interface LabWindow {
  __blockLab: {
    engine: {
      phase: string;
      active: { x: number; y: number } | null;
      lockedPieceCount: number;
      settlementCount: number;
      team: {
        giftCount: number;
        hitCount: number;
        missCount: number;
        firedCount: number;
        pending: Record<string, number>;
      };
    };
    feed: { send(message: unknown): { ok: boolean } };
  };
}

/** One viewer's gift worth `diamonds`, straight into the gift feed: one draw per diamond. */
const sendGift = (page: Page, diamonds: number, id = String(Math.random())) =>
  page.evaluate(
    ({ diamonds, id }) =>
      (window as unknown as LabWindow).__blockLab.feed.send({
        id,
        user: { id: 'u1', nickname: '阿杰' },
        text: '',
        gift: { name: '玫瑰', count: 1, diamonds },
        ts: 0,
      }).ok,
    { diamonds, id },
  );

const engineState = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as LabWindow).__blockLab.engine;
    return {
      phase: e.phase,
      active: e.active ? { x: e.active.x, y: e.active.y } : null,
      locks: e.lockedPieceCount,
      settlements: e.settlementCount,
    };
  });

const conservation = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as LabWindow).__blockLab.engine;
    const t = e.team;
    const pending = Object.values(t.pending).reduce((s, n) => s + n, 0);
    return {
      gifts: t.giftCount,
      okGifts: t.giftCount === t.hitCount + t.missCount,
      okCurses: t.hitCount === pending + t.firedCount,
    };
  });

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto('/tetris?seed=1');
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('renders a real canvas board, the curse panel and controls', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '方块干预实验室' })).toBeVisible();
  await expect(page.getByTestId('panel-team')).toBeVisible();
  await expect(page.getByText(/诅咒队|祝福/)).toHaveCount(0);
  await page.getByRole('button', { name: '开始游戏' }).click();

  const colours = await page.getByTestId('board').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4 * 97)
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return { distinct: seen.size, width: c.width, cssWidth: c.clientWidth, dpr: devicePixelRatio };
  });
  expect(colours.distinct).toBeGreaterThan(2);
  expect(colours.width).toBe(Math.round(colours.cssWidth * colours.dpr));
});

test('fake gifts reach the wall only once the game has started', async ({ page }) => {
  await page.getByRole('button', { name: '开始模拟送礼' }).click();
  await page.waitForTimeout(1000);
  expect((await conservation(page)).gifts).toBe(0);
  await expect(page.getByTestId('gift-history').getByRole('article')).toHaveCount(0);

  await page.getByRole('button', { name: '开始游戏' }).click();
  // The first fake gift comes 300 ms after starting the source, the rest every 10 s or so.
  await page.getByRole('button', { name: '停止模拟送礼' }).click();
  await page.getByRole('button', { name: '开始模拟送礼' }).click();
  await expect(page.getByTestId('gift-history').getByRole('article')).toHaveCount(1);
  await expect(page.getByTestId('gift-history').getByTestId('detail')).toHaveText(
    /^(触发 .+|未触发诅咒)$/,
  );
  expect((await conservation(page)).gifts).toBeGreaterThan(0);
});

test('start, pause with P, resume; restart after game over empties the wall', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  expect(await sendGift(page, 110)).toBe(true);
  await expect(page.getByTestId('gift-history')).toContainText('阿杰');
  await page.keyboard.press('KeyP');
  await expect(page.getByTestId('overlay-paused')).toBeVisible();
  expect(await sendGift(page, 1)).toBe(true);
  await page.getByRole('button', { name: '继续游戏' }).click();
  expect((await engineState(page)).phase).toBe('playing');
  expect((await conservation(page)).gifts).toBe(111);

  for (let i = 0; i < 40 && (await engineState(page)).phase !== 'gameOver'; i += 1) {
    await page.keyboard.press('Space');
  }
  await page.getByTestId('overlay-gameOver').getByRole('button', { name: '重新开始' }).click();
  expect((await engineState(page)).phase).toBe('ready');
  await expect(page.getByTestId('gift-history').getByRole('article')).toHaveCount(0);
});

test('WASD and space control the board after clicking a button, without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: '开始模拟送礼' }).click();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const before = await engineState(page);

  await page.keyboard.press('KeyA');
  expect((await engineState(page)).active!.x).toBe(before.active!.x - 1);
  await page.keyboard.press('KeyS');
  expect((await engineState(page)).active!.y).toBeGreaterThan(before.active!.y);
  await page.keyboard.press('KeyW');

  await page.keyboard.press('Space');
  const after = await engineState(page);
  expect(after.locks).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  // Space was consumed by the game, not by the focused button.
  await expect(page.getByRole('button', { name: '停止模拟送礼' })).toBeVisible();
});

test('holding a move key auto-repeats with DAS/ARR', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(100);
  // Within DAS (150 ms) only the initial move has happened.
  const start = await engineState(page);
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  const end = await engineState(page);
  expect(end.active!.x).toBeGreaterThan(start.active!.x);
  // Against the right wall: rightmost filled column is 9.
  const rightmost = await page.evaluate(() => {
    const e = (
      window as unknown as { __blockLab: { engine: { active: { x: number; matrix: number[][] } } } }
    ).__blockLab.engine;
    const cols = e.active.matrix[0]!.map((_, c) => e.active.matrix.some((row) => row[c]));
    return e.active.x + cols.lastIndexOf(true);
  });
  expect(rightmost).toBe(9);
});

test('rapid hard drops lock once each and settle every third piece', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Space');
  const s = await engineState(page);
  expect(s.locks).toBe(6);
  expect(s.settlements).toBe(2);
  expect(s.active).not.toBeNull();
  await expect(page.getByTestId('countdown')).toContainText('再落下 3 块');
});

test('hiding the tab pauses; returning does not resume or catch up', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  await setVisibility('hidden');
  const hidden = await engineState(page);
  expect(hidden.phase).toBe('paused');
  await page.waitForTimeout(1500);
  await setVisibility('visible');
  await page.waitForTimeout(300);
  const back = await engineState(page);
  expect(back.phase).toBe('paused');
  expect(back.active).toEqual(hidden.active);
});

test('narrow layout puts the board first and never scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const board = await page.getByTestId('board').boundingBox();
  const team = await page.getByTestId('panel-team').boundingBox();
  expect(board!.y).toBeLessThan(team!.y);
  expect(board!.width).toBeLessThanOrEqual(320);
});

test('desktop layout: board left, curse team right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const board = await page.getByTestId('board').boundingBox();
  const team = await page.getByTestId('panel-team').boundingBox();
  expect(board!.x).toBeLessThan(team!.x);
  expect(Math.abs(board!.y - team!.y)).toBeLessThan(200);
});

test('30,000 diamonds of gifts stay bounded and the game keeps working', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  const started = Date.now();
  for (let i = 0; i < 3; i += 1) {
    expect(await sendGift(page, 10_000)).toBe(true);
    await page.keyboard.press('Space');
  }
  const elapsed = Date.now() - started;
  const t = await conservation(page);
  expect(t.gifts).toBe(30_000);
  expect(t.okGifts).toBe(true);
  expect(t.okCurses).toBe(true);
  const s = await engineState(page);
  if (s.phase === 'playing') {
    await page.keyboard.press('KeyD');
    await page.keyboard.press('KeyW');
    await page.keyboard.press('KeyC');
    await page.keyboard.press('Space');
    expect((await engineState(page)).locks).toBe(s.locks + 1);
  } else {
    // Garbage may legitimately top the board out; the game-over screen must work.
    await expect(page.getByTestId('game-over-summary')).toBeVisible();
  }
  test
    .info()
    .annotations.push({ type: 'timing', description: `30,000 draws + 3 drops: ${elapsed} ms` });
});

test('a text field keeps game keys for itself', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('combobox', { name: '数据来源' }).selectOption('live');
  const before = await engineState(page);
  await page.getByRole('textbox', { name: '直播间号' }).click();
  await page.keyboard.press('KeyA');
  await page.keyboard.press('KeyA');
  expect((await engineState(page)).active!.x).toBe(before.active!.x);
});

test('the OBS page shows the game and gift wall on a transparent page', async ({ page }) => {
  const link = await page.getByRole('textbox', { name: 'OBS 链接' }).inputValue();
  expect(link).toContain('obs=1');
  await page.goto(`${link}&seed=1`);
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('panel-team')).toBeVisible();
  await expect(page.getByRole('heading', { name: '方块干预实验室' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: '数据来源' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '鼠标/触屏操作' })).toHaveCount(0);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgba(0, 0, 0, 0)');

  // Played through OBS's 交互 window: Enter starts, and the link's fake gifts arrive.
  await page.keyboard.press('Enter');
  expect((await engineState(page)).phase).toBe('playing');
  expect(await sendGift(page, 5)).toBe(true);
  await expect(page.getByTestId('gift-history').getByRole('article')).toHaveCount(1);
});
