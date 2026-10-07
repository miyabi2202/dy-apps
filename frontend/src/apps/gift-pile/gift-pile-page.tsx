import { Column, Grid, Page, Panel, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { canvasSize, PILE } from './core/config';
import { startPileLoop } from './loop';
import { labels } from './messages';
import { PileClient } from './pile-client';
import { planRemoval, VacuumFlights } from './render/vacuum-flight';
import { PileRenderer } from './render/renderer';
import { createGiftSprite, GIFT_ICON_URL, loadImage, PLANE_URL } from './render/sprite';
import { sizeStore, type WorldSize } from './settings';
import { ControlPanel, type PileStats } from './ui/control-panel';
import { SizePanel } from './ui/size-panel';
import { Stage } from './ui/stage';

/** How often the counts on the panel refresh; the canvas itself redraws every frame. */
const STATS_INTERVAL_MS = 200;

/** The worker's client, the flights that carry removed icons off, and the renderer they feed. */
function createPile() {
  const client = new PileClient({
    onFrame: (frame) => renderer.pushFrame(frame, performance.now()),
  });
  const flights = new VacuumFlights(client);
  const renderer = new PileRenderer(
    { ...PILE, world: canvasSize(PILE.world) },
    createGiftSprite,
    flights,
  );
  return { client, renderer, flights };
}

/** Remove `count` icons: a plane flies off with them, bar any over what one plane carries. */
function remove(client: PileClient, count: number) {
  const { fly, extra, instant } = planRemoval(count);
  if (fly > 0) client.scoop(fly + extra, extra);
  if (instant > 0) client.remove(instant);
}

const readStats = (client: PileClient): PileStats => ({
  total: client.stats.total,
  falling: client.stats.moving,
  queued: client.stats.queued,
});

/** The counts, polled a few times a second rather than re-rendering React every frame. */
function useStats(client: PileClient): PileStats {
  const [stats, setStats] = useState(() => readStats(client));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readStats(client);
      setStats((prev) =>
        prev.total === next.total && prev.falling === next.falling && prev.queued === next.queued
          ? prev
          : next,
      );
    }, STATS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [client]);
  return stats;
}

/**
 * The 嘉年华堆堆乐 route: the canvas-size panel, then the adding panel (always last), above
 * the stage: the canvas with the bin over it. Each 添加 drops that many icons in from the
 * top; they pile up on the floor and on each other, and can be dragged about or into the
 * bin. The physics runs in a worker that starts when the page mounts and stops when it
 * unmounts (so StrictMode's extra mount in development just restarts it).
 */
export function GiftPilePage() {
  const [{ client, renderer, flights }] = useState(createPile);
  const [size, setSize] = useState<WorldSize>(() => sizeStore.read());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useStats(client);

  // The worker starts with the default size; tell it the saved one (queued until ready).
  useEffect(() => {
    client.start();
    const saved = sizeStore.read();
    if (saved.width !== PILE.world.width || saved.height !== PILE.world.height) {
      client.resize(saved.width, saved.height);
    }
    return () => client.stop();
  }, [client]);

  const resize = (next: WorldSize) => {
    setSize(next);
    sizeStore.write(next);
    client.resize(next.width, next.height);
  };
  useEffect(() => startPileLoop(renderer, () => canvasRef.current), [renderer]);

  // The gift and plane images, once they have loaded; drawn stand-ins show until then.
  useEffect(() => {
    let mounted = true;
    void loadImage(GIFT_ICON_URL).then((image) => {
      if (mounted) renderer.setImage(image);
    });
    void loadImage(PLANE_URL).then((image) => {
      if (mounted) flights.setPlane(image);
    });
    return () => {
      mounted = false;
    };
  }, [renderer, flights]);

  // Test/debug hook for browser tests and manual inspection.
  useEffect(() => {
    const w = window as unknown as { __giftPile?: unknown };
    w.__giftPile = { client, renderer };
    return () => {
      delete w.__giftPile;
    };
  }, [client, renderer]);

  return (
    <Page title={labels.title} subtitle={labels.subtitle} xstyle={styles.page}>
      <Column gap="lg">
        <Grid min={360} gap="lg">
          <SizePanel size={size} onResize={resize} />
          <ControlPanel
            stats={stats}
            maxItems={PILE.maxItems}
            onAdd={(count) => client.add(count)}
            onRemove={(count) => remove(client, count)}
            onClear={() => client.clear()}
          />
        </Grid>
        <Panel xstyle={styles.stage}>
          <Stage canvasRef={canvasRef} renderer={renderer} client={client} size={size} />
          {client.error && (
            <p {...stylex.props(text.muted)}>
              {labels.engineFailed} {client.error}
            </p>
          )}
        </Panel>
      </Column>
    </Page>
  );
}

const styles = stylex.create({
  page: {
    padding: space.xl,
    marginInline: 'auto',
    maxWidth: 1000,
  },
  stage: {
    padding: space.lg,
  },
});
