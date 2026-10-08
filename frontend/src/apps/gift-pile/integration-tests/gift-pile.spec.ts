import { expect, test, type Locator, type Page } from '@playwright/test';
import { labels, testIds } from '../messages';
import { meta } from '../meta';

const REMOVERS = Object.keys(labels.removers.names);
const ICONS = 60;
const REMOVED = 30;
/** How long to watch a removal: the slowest runs about this long on the software renderer. */
const WATCH_MS = 12_000;
/** A removal changes at least this many sampled pixels (of ~18000) from the bare pile's. */
const MIN_CHANGED = 200;

interface SamplerWindow {
  __sampler: { mode: 'off' | 'base' | 'watch'; max: number };
}

/**
 * Samples the pile's canvas, shrunk, in each frame right after the page has drawn it (a WebGL
 * canvas can only be read then), where the bare pile shows only the dark background: `base` takes that picture, `watch` records
 * the most pixels that have lit up there since.
 */
const installSampler = (page: Page) =>
  page.evaluate((canvasId) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="${canvasId}"]`)!;
    const w = 104;
    const h = 177;
    const rows = h;
    const probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    let base: Uint8ClampedArray | null = null;
    const state: SamplerWindow['__sampler'] = { mode: 'off', max: 0 };
    (window as unknown as SamplerWindow).__sampler = state;
    const frame = () => {
      requestAnimationFrame(frame);
      if (state.mode === 'off') return;
      ctx.drawImage(canvas, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, rows);
      if (state.mode === 'base') {
        base = data;
        return;
      }
      if (!base) return;
      let changed = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Only where the bare pile showed the background: what leaves the pile doesn't count.
        if (base[i]! + base[i + 1]! + base[i + 2]! > 90) continue;
        const d = data[i]! + data[i + 1]! + data[i + 2]! - (base[i]! + base[i + 1]! + base[i + 2]!);
        if (d > 30) changed++;
      }
      state.max = Math.max(state.max, changed);
    };
    requestAnimationFrame(frame);
  }, testIds.canvas);

const sample = (page: Page, mode: 'base' | 'watch') =>
  page.evaluate((m) => ((window as unknown as SamplerWindow).__sampler.mode = m), mode);

const total = (page: Page): Locator => page.getByTestId(testIds.stats).locator('dd').first();

/** Only `name` is dealt: check it, then clear the rest (the last one on can't be turned off). */
async function dealOnly(page: Page, name: string) {
  const list = page.getByTestId(testIds.removers);
  await list.getByText(labels.removers.summary).click();
  await list.getByLabel(labels.removers.names[name]!, { exact: true }).check();
  for (const other of REMOVERS) {
    if (other === name) continue;
    await list.getByLabel(labels.removers.names[other]!, { exact: true }).uncheck();
  }
}

for (const remover of REMOVERS) {
  test(`${remover}: a removal draws and logs no GL or shader error`, async ({ page }) => {
    test.setTimeout(90_000);
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));

    await page.goto(meta.path);
    await expect(page.getByText(labels.webglMissing)).toHaveCount(0);
    await dealOnly(page, remover);
    // The banner pauses the removal and covers the canvas; this is about the remover itself.
    await page.getByTestId(testIds.effects).getByText(labels.effects.summary).click();
    await page.getByLabel(labels.effects.cutIns).uncheck();

    await page.getByTestId(testIds.count).fill(String(ICONS));
    await page.getByRole('button', { name: labels.add, exact: true }).click();
    await expect(total(page)).toHaveText(String(ICONS), { timeout: 20_000 });
    // Let the pile settle, so the top of the canvas is bare.
    await page.waitForTimeout(2500);
    await installSampler(page);
    await sample(page, 'base');
    await page.waitForTimeout(300);

    await page.getByTestId(testIds.count).fill(String(REMOVED));
    await sample(page, 'watch');
    await page.getByRole('button', { name: labels.remove, exact: true }).click();
    await page.waitForTimeout(WATCH_MS);
    const drawn = await page.evaluate(() => (window as unknown as SamplerWindow).__sampler.max);

    expect(problems).toEqual([]);
    await expect(page.getByText(labels.engineFailed)).toHaveCount(0);
    await expect(page.getByText(labels.webglMissing)).toHaveCount(0);
    // Its icons left the pile.
    expect(Number(await total(page).innerText())).toBeLessThan(ICONS);
    // Something of it was drawn: a remover that draws nothing is a shader that failed quietly.
    expect(drawn).toBeGreaterThan(MIN_CHANGED);
  });
}
