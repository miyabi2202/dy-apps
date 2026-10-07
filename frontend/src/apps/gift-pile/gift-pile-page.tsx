import { Column, Grid, Page, Panel, text } from '@dy-apps/ui';
import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { PILE } from './core/config';
import { createPile } from './create-pile';
import { startPileLoop } from './loop';
import { labels } from './messages';
import { sizeStore, type WorldSize } from './settings';
import { ControlPanel } from './ui/control-panel';
import { SizePanel } from './ui/size-panel';
import { Stage } from './ui/stage';
import { useStats } from './use-stats';

/**
 * The 嘉年华堆堆乐 route: the canvas-size panel, then the adding panel (always last), above
 * the stage: the canvas with the bin over it. Each 添加 drops that many icons in from the
 * top; they pile up on the floor and on each other, and can be dragged about or into the
 * bin. The physics runs in a worker that starts when the page mounts and stops when it
 * unmounts (so StrictMode's extra mount in development just restarts it).
 */
export function GiftPilePage() {
  const [{ client, renderer, director, loadImages }] = useState(createPile);
  const [size, setSize] = useState<WorldSize>(() => sizeStore.read());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stats = useStats(client, director);

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

  useEffect(loadImages, [loadImages]);

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
            onAdd={(count) => director.add(count, performance.now())}
            onRemove={(count) => director.remove(count, performance.now())}
            onClear={() => client.clear()}
          />
        </Grid>
        <Panel xstyle={styles.stage}>
          <Stage
            canvasRef={canvasRef}
            renderer={renderer}
            client={client}
            director={director}
            size={size}
          />
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
