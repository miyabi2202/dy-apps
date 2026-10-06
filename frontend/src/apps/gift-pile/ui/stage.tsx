import { text } from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { labels, testIds } from '../messages';
import type { PileClient } from '../pile-client';
import type { PileRenderer } from '../render/renderer';
import type { WorldSize } from '../settings';
import { Bin, BIN_SIZE, type BinPlace } from './bin';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  renderer: PileRenderer;
  client: PileClient;
  size: WorldSize;
}

/** Where the bin starts: near the bottom right. */
const BIN_HOME: BinPlace = { fx: 0.86, fy: 0.9 };

/**
 * The canvas with the bin floating over it. Press on an icon to pick it up; it follows the
 * pointer, lands where it is let go, and is destroyed if that is in the bin.
 */
export function Stage({ canvasRef, renderer, client, size }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [bin, setBin] = useState<BinPlace>(BIN_HOME);
  const [hot, setHot] = useState(false);
  const [holding, setHolding] = useState(false);
  const [box, setBox] = useState({ width: size.width, height: size.height });
  const draggingRef = useRef<number | null>(null);

  // The stage's size on screen, for the bin's position; observing reports it at once.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() =>
      setBox({ width: stage.clientWidth, height: stage.clientHeight }),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  /** A pointer event's place in world pixels, and whether it is over the bin. */
  const locate = (event: PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const half = BIN_SIZE / 2;
    const overBin =
      Math.abs(cx - bin.fx * rect.width) <= half && Math.abs(cy - bin.fy * rect.height) <= half;
    return {
      x: (cx / rect.width) * size.width,
      y: (cy / rect.height) * size.height,
      overBin,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const { x, y } = locate(event);
    const id = renderer.iconAt(x, y);
    if (id === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = id;
    setHolding(true);
    client.grab(id);
    renderer.hold({ id, x, y });
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const id = draggingRef.current;
    if (id === null) return;
    const { x, y, overBin } = locate(event);
    renderer.hold({ id, x, y });
    setHot(overBin);
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const id = draggingRef.current;
    if (id === null) return;
    draggingRef.current = null;
    const { x, y, overBin } = locate(event);
    if (overBin) client.destroy(id);
    else client.release(id, x, y);
    renderer.hold(null);
    setHolding(false);
    setHot(false);
  };

  return (
    <>
      <div ref={stageRef} {...stylex.props(styles.stage, styles.width(size.width))}>
        <canvas
          ref={canvasRef}
          data-testid={testIds.canvas}
          width={size.width}
          height={size.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          {...stylex.props(styles.canvas, holding && styles.dragging)}
        />
        <Bin
          place={bin}
          stageWidth={box.width}
          stageHeight={box.height}
          onMove={setBin}
          hot={hot}
        />
      </div>
      <p {...stylex.props(text.muted, styles.hint)}>{labels.stageHint}</p>
    </>
  );
}

const styles = stylex.create({
  // Centred at its world size, or the panel's width if that is less.
  stage: {
    marginInline: 'auto',
    position: 'relative',
    maxWidth: '100%',
  },
  width: (width: number) => ({ width }),
  // Fills the stage; the height follows from the canvas's own size.
  canvas: {
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    display: 'block',
    touchAction: 'none',
    height: 'auto',
    width: '100%',
  },
  dragging: {
    cursor: 'grabbing',
  },
  hint: {
    margin: 0,
    textAlign: 'center',
    marginTop: space.md,
  },
});
