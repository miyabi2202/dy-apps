import { Column, Page, Panel } from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { PILE } from './core/config';
import { PileWorld } from './core/world';
import { startPileLoop } from './loop';
import { labels, testIds } from './messages';
import { PileRenderer } from './render/renderer';
import { loadGiftIcon } from './render/sprite';
import { ControlPanel, type PileStats } from './ui/control-panel';

/** How often the counts on the panel refresh; the canvas itself redraws every frame. */
const STATS_INTERVAL_MS = 200;

function createPile() {
  const world = new PileWorld();
  return { world, renderer: new PileRenderer(world) };
}

const readStats = (world: PileWorld): PileStats => ({
  total: world.count,
  falling: world.fallingCount,
  queued: world.queued,
});

/** The counts, polled a few times a second rather than re-rendering React every frame. */
function useStats(world: PileWorld): PileStats {
  const [stats, setStats] = useState(() => readStats(world));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readStats(world);
      setStats((prev) =>
        prev.total === next.total && prev.falling === next.falling && prev.queued === next.queued
          ? prev
          : next,
      );
    }, STATS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [world]);
  return stats;
}

/**
 * The 嘉年华堆堆乐 route: a control panel above a canvas. Each 添加 drops that many icons in
 * from the top; they pile up on the floor and on each other. The world is created when the
 * page mounts and lives for as long as it stays open.
 */
export function GiftPilePage() {
  const [{ world, renderer }] = useState(createPile);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useStats(world);

  useEffect(() => startPileLoop(world, renderer, () => canvasRef.current), [world, renderer]);

  // The gift image, once it has loaded; the drawn stand-in shows until then.
  useEffect(() => {
    let mounted = true;
    void loadGiftIcon().then((image) => {
      if (mounted) renderer.setImage(image);
    });
    return () => {
      mounted = false;
    };
  }, [renderer]);

  // Test/debug hook for browser tests and manual inspection.
  useEffect(() => {
    const w = window as unknown as { __giftPile?: unknown };
    w.__giftPile = { world };
    return () => {
      delete w.__giftPile;
    };
  }, [world]);

  return (
    <Page
      title={labels.title}
      subtitle={labels.subtitle}
      xstyle={[styles.page, styles.width(PILE.world.width + 2 * PAGE_INSET)]}
    >
      <Column gap="lg">
        <ControlPanel
          stats={stats}
          maxItems={world.maxItems}
          onAdd={(count) => world.add(count)}
          onClear={() => world.clear()}
        />
        <Panel xstyle={styles.stage}>
          <canvas
            ref={canvasRef}
            data-testid={testIds.canvas}
            width={PILE.world.width}
            height={PILE.world.height}
            {...stylex.props(styles.canvas)}
          />
        </Panel>
      </Column>
    </Page>
  );
}

/** Page padding plus the stage panel's padding and border, each side, in px. */
const PAGE_INSET = 16 + 12 + 1;

const styles = stylex.create({
  page: {
    padding: space.xl,
    marginInline: 'auto',
  },
  // The canvas at its world size and no wider; StyleX can't read the number from PILE.
  width: (maxWidth: number) => ({ maxWidth }),
  stage: {
    padding: space.lg,
  },
  // Fills the panel's width; the height follows from the canvas's own size.
  canvas: {
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    display: 'block',
    height: 'auto',
    width: '100%',
  },
});
