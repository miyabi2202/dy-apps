import {
  connectionFormText,
  obsLinkText,
  sourcePanelText,
  testIds as uiTestIds,
} from '@dy-apps/ui/messages';
import { expect, test, type Page } from '@playwright/test';
import { CONFIG } from '../core/config';
import { labels, testIds } from '../messages';
import { meta } from '../meta';

interface LabWindow {
  __blockLab: {
    engine: {
      phase: string;
      active: { x: number; y: number } | null;
      lockedPieceCount: number;
      settlementCount: number;
      team: { giftCount: number };
      cutscene: unknown;
      fakeDeath: unknown;
      possession: unknown;
      vote: unknown;
      blockedBy(cmd: string): unknown;
      tick(dtMs: number): void;
      hardDrop(): boolean;
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

const giftCount = (page: Page) =>
  page.evaluate(() => (window as unknown as LabWindow).__blockLab.engine.team.giftCount);

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`${meta.path}?seed=1`);
});

test.afterEach(() => {
  expect(consoleErrors).toEqual([]);
});

test('renders a real canvas board, the curse panel and controls', async ({ page }) => {
  await expect(page.getByRole('heading', { name: meta.title })).toBeVisible();
  await expect(page.getByTestId(testIds.panelTeam)).toBeVisible();
  await page.getByRole('button', { name: labels.start }).click();

  const colours = await page.getByTestId(testIds.board).evaluate((el) => {
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
  await page.getByRole('button', { name: labels.fakeGifts.start }).click();
  await page.waitForTimeout(1000);
  expect(await giftCount(page)).toBe(0);
  await expect(page.getByTestId(testIds.giftHistory).getByRole('article')).toHaveCount(0);

  await page.getByRole('button', { name: labels.start }).click();
  // The first fake gift comes 300 ms after starting the source, the rest every 10 s or so.
  await page.getByRole('button', { name: labels.fakeGifts.stop }).click();
  await page.getByRole('button', { name: labels.fakeGifts.start }).click();
  await expect(page.getByTestId(testIds.giftHistory).getByRole('article')).toHaveCount(1);
  await expect(page.getByTestId(testIds.giftHistory).getByTestId(uiTestIds.detail)).toHaveText(
    /^(触发 .+|未触发诅咒)$/,
  );
  expect(await giftCount(page)).toBeGreaterThan(0);
});

test('the debug panel adds any curse to the pending list once the game has started', async ({
  page,
}) => {
  await page.getByText(labels.debug).click();
  const add = page.getByTestId(testIds.debugCurse('garbage'));
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: labels.start }).click();
  await add.click();
  await add.click();
  await expect(page.getByTestId(testIds.pending)).toContainText('×2');
});

test('likes fill the meter, and a full meter draws a curse', async ({ page }) => {
  await page.getByText(labels.debug).click();
  await page.getByRole('button', { name: labels.start }).click();
  const meter = page.getByTestId(testIds.likeMeter);
  await expect(meter).toContainText(`0 / ${CONFIG.likes.firstThreshold}`);
  const add = page.getByTestId(testIds.debugLikes(50));
  for (let i = 0; i < CONFIG.likes.firstThreshold / 50; i += 1) await add.click();
  await expect(page.getByTestId(testIds.notice('likes'))).toBeVisible();
  await expect(meter).toContainText(`0 / ${CONFIG.likes.firstThreshold * 2}`);
});

test('a vote: chat 1 or 2 puts the viewer under their pick, and the streamer can add time', async ({
  page,
}) => {
  await page.getByText(labels.debug).click();
  await page.getByRole('button', { name: labels.start }).click();
  await page.getByTestId(testIds.debugVote('start')).click();
  const vote = page.getByTestId(testIds.vote);
  await expect(vote).toBeVisible();
  await page.getByTestId(testIds.debugVote('1')).click();
  await expect(page.getByTestId(testIds.voteOption(0))).toContainText('1 票');
  await vote.getByRole('button', { name: labels.extendVote }).click();
  await expect(vote).toBeHidden({ timeout: 15_000 });
});

test('start, pause with P, resume; restart after game over empties the wall', async ({ page }) => {
  await page.getByRole('button', { name: labels.start }).click();
  expect(await sendGift(page, 110)).toBe(true);
  await expect(page.getByTestId(testIds.giftHistory)).toContainText('阿杰');
  await page.keyboard.press('KeyP');
  await expect(page.getByTestId(testIds.overlay('paused'))).toBeVisible();
  expect(await sendGift(page, 1)).toBe(true);
  await page.getByRole('button', { name: labels.resume }).click();
  expect((await engineState(page)).phase).toBe('playing');
  expect(await giftCount(page)).toBe(111);

  for (let i = 0; i < 40 && (await engineState(page)).phase !== 'gameOver'; i += 1) {
    await page.keyboard.press('Space');
    // A cutscene, a 假死, 夺舍 or a vote may be holding play, or a curse blocking hard drop (自转);
    // play it out, or let gravity land and lock the piece instead.
    await page.evaluate(() => {
      const e = (window as unknown as LabWindow).__blockLab.engine;
      if (e.phase === 'playing' && e.cutscene) e.tick(60_000);
      if (e.phase === 'playing' && e.fakeDeath) e.tick(60_000);
      if (e.phase === 'playing' && e.possession) e.tick(60_000);
      // Once to count the votes, once more to show the winner and go on.
      if (e.phase === 'playing' && e.vote) {
        e.tick(60_000);
        e.tick(60_000);
      }
      if (e.phase === 'playing' && e.blockedBy('hardDrop') !== null) {
        e.tick(30_000);
        e.tick(1_000);
      }
    });
  }
  // 阿杰's curses fired, so they top the MVP board.
  await expect(
    page.getByTestId(testIds.overlay('gameOver')).getByTestId(testIds.mvp),
  ).toContainText('阿杰');
  await page
    .getByTestId(testIds.overlay('gameOver'))
    .getByRole('button', { name: labels.restart })
    .click();
  expect((await engineState(page)).phase).toBe('ready');
  await expect(page.getByTestId(testIds.giftHistory).getByRole('article')).toHaveCount(0);
});

test('WASD and space control the board after clicking a button, without scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByRole('button', { name: labels.start }).click();
  await page.getByRole('button', { name: labels.fakeGifts.start }).click();
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
  await expect(page.getByRole('button', { name: labels.fakeGifts.stop })).toBeVisible();
});

test('holding a move key auto-repeats with DAS/ARR', async ({ page }) => {
  await page.getByRole('button', { name: labels.start }).click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(100);
  // Within DAS (150 ms) only the initial move has happened.
  const start = await engineState(page);
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  const end = await engineState(page);
  expect(end.active!.x).toBeGreaterThan(start.active!.x);
  // Against the right wall: the rightmost filled column is the board's last.
  const rightmost = await page.evaluate(() => {
    const e = (
      window as unknown as { __blockLab: { engine: { active: { x: number; matrix: number[][] } } } }
    ).__blockLab.engine;
    const cols = e.active.matrix[0]!.map((_, c) => e.active.matrix.some((row) => row[c]));
    return e.active.x + cols.lastIndexOf(true);
  });
  expect(rightmost).toBe(CONFIG.board.cols - 1);
});

test('rapid hard drops lock once each and settle once per round', async ({ page }) => {
  const round = CONFIG.settlement.everyLocks;
  await page.getByRole('button', { name: labels.start }).click();
  for (let i = 0; i < round * 2; i += 1) await page.keyboard.press('Space');
  const s = await engineState(page);
  expect(s.locks).toBe(round * 2);
  expect(s.settlements).toBe(2);
  expect(s.active).not.toBeNull();
  await expect(page.getByTestId(testIds.countdown)).toContainText(`再落下 ${round} 块`);
});

test('hiding the tab pauses; returning does not resume or catch up', async ({ page }) => {
  await page.getByRole('button', { name: labels.start }).click();
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
  const board = await page.getByTestId(testIds.board).boundingBox();
  const team = await page.getByTestId(testIds.panelTeam).boundingBox();
  expect(board!.y).toBeLessThan(team!.y);
  expect(board!.width).toBeLessThanOrEqual(320);
});

test('desktop layout: board left, curse team right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const board = await page.getByTestId(testIds.board).boundingBox();
  const team = await page.getByTestId(testIds.panelTeam).boundingBox();
  expect(board!.x).toBeLessThan(team!.x);
  expect(Math.abs(board!.y - team!.y)).toBeLessThan(200);
});

test('a text field keeps game keys for itself', async ({ page }) => {
  await page.getByRole('button', { name: labels.start }).click();
  await page.getByRole('combobox', { name: sourcePanelText.title }).selectOption('live');
  const before = await engineState(page);
  await page.getByRole('textbox', { name: connectionFormText.room }).click();
  await page.keyboard.press('KeyA');
  await page.keyboard.press('KeyA');
  expect((await engineState(page)).active!.x).toBe(before.active!.x);
});

test('the OBS page shows the game and gift wall on a transparent page', async ({ page }) => {
  const link = await page.getByRole('textbox', { name: obsLinkText.input }).inputValue();
  expect(link).toContain('obs=1');
  await page.goto(`${link}&seed=1`);
  await expect(page.getByTestId(testIds.board)).toBeVisible();
  await expect(page.getByTestId(testIds.panelTeam)).toBeVisible();
  await expect(page.getByRole('heading', { name: meta.title })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: sourcePanelText.title })).toHaveCount(0);
  await expect(page.getByRole('group', { name: labels.touchControls })).toHaveCount(0);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgba(0, 0, 0, 0)');

  // Played through OBS's 交互 window: Enter starts, and gifts reach the wall.
  await page.keyboard.press('Enter');
  expect((await engineState(page)).phase).toBe('playing');
  expect(await sendGift(page, 5)).toBe(true);
  await expect(page.getByTestId(testIds.giftHistory).getByRole('article')).toHaveCount(1);
});
