import { text } from '@dy-apps/ui';
import { colors, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { canvasSize } from '../core/config';
import { labels, testIds } from '../messages';
import type { Pile } from '../pile';
import type { WorldSize } from '../settings';
import { Bin, BIN_DROP_SIZE, BIN_ICON_SIZE, type BinPlace, moveWithView } from './bin';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** What the stage draws and drags icons on; it is told where the bin is, so icons a removal drops into it are destroyed. */
  pile: Pile;
  /** The play area; the canvas is this plus the margin. */
  size: WorldSize;
}

/** Where the bin starts: near the bottom right. */
const BIN_HOME: BinPlace = { fx: 0.86, fy: 0.9 };
/** How long the bin lights up for when it catches a dropped icon. */
const CATCH_FLASH_MS = 250;

/**
 * The canvas with the bin floating over it. Press on an icon to pick it up; it follows the
 * pointer, lands where it is let go, and is destroyed if that is in the bin. Icons a removal
 * drops that fall into the bin are destroyed too, and it lights up for each. As the pile's
 * camera moves up and down the pile, the bin moves with it, kept on the canvas. That is done
 * on the bin's element directly, so the camera easing for a second doesn't render this
 * component sixty times.
 */
export function Stage({ canvasRef, pile, size }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const binRef = useRef<HTMLDivElement>(null);
  // Where the bin is now, as fractions of the stage, and how to tell the pile where that is.
  const placeRef = useRef<BinPlace>(BIN_HOME);
  const tellPileRef = useRef(() => {});
  const [hot, setHot] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const flashRef = useRef(0);
  const [holding, setHolding] = useState(false);
  const canvas = canvasSize(size);
  const [box, setBox] = useState(canvas);
  const draggingRef = useRef<number | null>(null);
  // The world y of the view's top as the bin last heard of it.
  const viewTopRef = useRef(pile.view.top);
  // Where the held icon last was, and whether the bin was lit for it, for finishing a drag
  // from an event that carries no useful position (a lost capture) or one that has already
  // left the bin in the flick of letting go.
  const lastRef = useRef({ x: 0, y: 0, overBin: false });

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

  /** Put the bin at `place`: on its element, and in the pile's reckoning of where it catches icons. */
  const placeBin = useCallback((place: BinPlace) => {
    const bin = binRef.current;
    if (bin && place !== placeRef.current) {
      bin.style.left = `${place.fx * 100}%`;
      bin.style.top = `${place.fy * 100}%`;
    }
    placeRef.current = place;
    tellPileRef.current();
  }, []);

  // When the camera moves, the bin moves with the world, as if it were standing in it, but
  // never off the canvas, so it can always be dragged.
  useEffect(
    () =>
      pile.onCamera((top) => {
        const moved = top - viewTopRef.current;
        viewTopRef.current = top;
        placeBin(
          moveWithView(
            placeRef.current,
            moved,
            canvas.height,
            stageRef.current?.clientHeight || canvas.height,
          ),
        );
      }),
    [pile, placeBin, canvas.height],
  );

  // Where the bin is in world pixels, for the pile; its image's size, scaled to the world.
  useEffect(() => {
    if (!box.width) return;
    const scale = canvas.width / box.width;
    const tell = () => {
      const place = placeRef.current;
      pile.setBin({
        x: place.fx * canvas.width,
        y: place.fy * canvas.height + pile.view.top,
        half: (BIN_ICON_SIZE / 2) * scale,
        onCatch: () => {
          setFlashing(true);
          window.clearTimeout(flashRef.current);
          flashRef.current = window.setTimeout(() => setFlashing(false), CATCH_FLASH_MS);
        },
      });
    };
    tellPileRef.current = tell;
    tell();
    return () => {
      tellPileRef.current = () => {};
      pile.setBin(null);
    };
  }, [pile, box.width, canvas.width, canvas.height]);
  useEffect(() => () => window.clearTimeout(flashRef.current), []);

  /** A pointer event's place in world pixels (the view moved up by the camera), and whether it is over the bin. */
  const locate = (event: PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const half = BIN_DROP_SIZE / 2;
    const bin = placeRef.current;
    const overBin =
      Math.abs(cx - bin.fx * rect.width) <= half && Math.abs(cy - bin.fy * rect.height) <= half;
    return {
      ...pile.toWorld((cx / rect.width) * canvas.width, (cy / rect.height) * canvas.height),
      overBin,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const { x, y } = locate(event);
    const id = pile.iconAt(x, y);
    if (id === null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = id;
    lastRef.current = { x, y, overBin: false };
    setHolding(true);
    pile.grab(id, x, y);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const id = draggingRef.current;
    if (id === null) return;
    const at = locate(event);
    lastRef.current = at;
    pile.move(id, at.x, at.y);
    setHot(at.overBin);
  };
  /** The drag ends: into the bin if it is over it now or was lit a moment ago, else dropped. */
  const finish = (at: { x: number; y: number; overBin: boolean }) => {
    const id = draggingRef.current;
    if (id === null) return;
    draggingRef.current = null;
    if (at.overBin || lastRef.current.overBin) pile.destroy(id);
    else pile.release(id, at.x, at.y);
    setHolding(false);
    setHot(false);
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => finish(locate(event));
  // Capture went away without a pointerup reaching us (it can, when the pointer leaves the
  // window mid-flick): finish where the icon last was, so nothing stays stuck to the pointer.
  const onLostPointerCapture = () => finish(lastRef.current);

  return (
    <>
      <div ref={stageRef} {...stylex.props(styles.stage, styles.width(canvas.width))}>
        <canvas
          ref={canvasRef}
          data-testid={testIds.canvas}
          width={canvas.width}
          height={canvas.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onLostPointerCapture}
          {...stylex.props(styles.canvas, holding && styles.dragging)}
        />
        <Bin
          ref={binRef}
          home={BIN_HOME}
          stageWidth={box.width}
          stageHeight={box.height}
          onMove={placeBin}
          hot={hot || flashing}
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
