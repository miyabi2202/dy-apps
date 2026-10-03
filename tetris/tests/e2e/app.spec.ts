import { expect, test, type Page } from '@playwright/test';

interface LabWindow {
  __blockLab: {
    engine: {
      phase: string;
      active: { x: number; y: number } | null;
      lockedPieceCount: number;
      settlementCount: number;
      teams: Record<
        'bless' | 'curse',
        {
          giftCount: number;
          hitCount: number;
          missCount: number;
          overflowEnergy: number;
          spentEnergy: number;
          queue: { energy: number }[];
          reserve: Record<string, { energy: number }>;
        }
      >;
    };
  };
}

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
    return (['bless', 'curse'] as const).map((side) => {
      const t = e.teams[side];
      const queue = t.queue.reduce((s, n) => s + n.energy, 0);
      const reserve = Object.values(t.reserve).reduce((s, r) => s + r.energy, 0);
      return {
        gifts: t.giftCount,
        okGifts: t.giftCount === t.hitCount + t.missCount,
        okEnergy: t.hitCount === queue + reserve + t.spentEnergy + t.overflowEnergy,
        queueLen: t.queue.length,
        reserve,
      };
    });
  });

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto('/?seed=1');
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('renders a real canvas board, both teams and controls', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '方块干预实验室' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /祝福队/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /诅咒队/ })).toBeVisible();
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

test('gift buttons, start, pause, resume and restart with confirmation', async ({ page }) => {
  await page.getByRole('button', { name: '祝福队送 10 份星光' }).click();
  await page.getByRole('button', { name: '诅咒队送 100 份星光' }).click();
  await expect(page.getByTestId('totals-bless')).toContainText('10');
  await expect(page.getByTestId('totals-curse')).toContainText('100');

  await page.getByRole('button', { name: '开始游戏' }).click();
  expect((await engineState(page)).phase).toBe('playing');
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(page.getByTestId('overlay-paused')).toBeVisible();
  await page.getByRole('button', { name: '诅咒队送 1 份星光' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  expect((await engineState(page)).phase).toBe('playing');

  await page.getByRole('button', { name: '重新开始' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  expect((await engineState(page)).phase).toBe('playing');
  await page.getByRole('button', { name: '重新开始' }).click();
  await page.getByRole('button', { name: '确认重开' }).click();
  expect((await engineState(page)).phase).toBe('ready');
  await expect(page.getByTestId('totals-bless')).not.toContainText('10');
});

test('arrow keys and space control the board after clicking a gift button, without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: '祝福队送 1 份星光' }).click();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const before = await engineState(page);

  await page.keyboard.press('ArrowLeft');
  expect((await engineState(page)).active!.x).toBe(before.active!.x - 1);
  await page.keyboard.press('ArrowDown');
  expect((await engineState(page)).active!.y).toBeGreaterThan(before.active!.y);
  await page.keyboard.press('ArrowUp');

  await page.keyboard.press('Space');
  const after = await engineState(page);
  expect(after.locks).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  // Space was consumed by the game, not by the focused gift button.
  await expect(page.getByTestId('totals-bless')).toContainText('礼物份数1');
});

test('holding an arrow key auto-repeats with DAS/ARR', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);
  // Within DAS (150 ms) only the initial move has happened.
  const start = await engineState(page);
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
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
  const bless = await page.getByTestId('panel-bless').boundingBox();
  expect(board!.y).toBeLessThan(bless!.y);
  expect(board!.width).toBeLessThanOrEqual(320);
});

test('desktop layout: bless left, board centre, curse right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bless = await page.getByTestId('panel-bless').boundingBox();
  const board = await page.getByTestId('board').boundingBox();
  const curse = await page.getByTestId('panel-curse').boundingBox();
  expect(bless!.x).toBeLessThan(board!.x);
  expect(board!.x).toBeLessThan(curse!.x);
});

test('30,000 gifts through the UI stay bounded and the game keeps working', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  for (const side of ['祝福队', '诅咒队'] as const) {
    const input = page.getByRole('spinbutton', { name: `${side}自定义份数` });
    await input.fill('10000');
  }
  const started = Date.now();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: '祝福队送出自定义份数' }).click();
    await page.getByRole('button', { name: '诅咒队送出自定义份数' }).click();
    await page.keyboard.press('Space');
  }
  const elapsed = Date.now() - started;
  const teams = await conservation(page);
  for (const t of teams) {
    expect(t.gifts).toBe(30_000);
    expect(t.okGifts).toBe(true);
    expect(t.okEnergy).toBe(true);
    expect(t.queueLen).toBeLessThanOrEqual(3);
    expect(t.reserve).toBeLessThanOrEqual(21);
  }
  const s = await engineState(page);
  if (s.phase === 'playing') {
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('KeyX');
    await page.keyboard.press('KeyC');
    await page.keyboard.press('Space');
    expect((await engineState(page)).locks).toBe(s.locks + 1);
  } else {
    // Garbage may legitimately top the board out; the game-over screen must work.
    await expect(page.getByTestId('game-over-summary')).toBeVisible();
  }
  test
    .info()
    .annotations.push({ type: 'timing', description: `60,000 gifts + 3 drops: ${elapsed} ms` });
});

test('custom count input keeps arrow keys for itself', async ({ page }) => {
  await page.getByRole('button', { name: '开始游戏' }).click();
  const before = await engineState(page);
  await page.getByRole('spinbutton', { name: '诅咒队自定义份数' }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await engineState(page)).active!.x).toBe(before.active!.x);
});
