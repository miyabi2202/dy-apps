/**
 * The canvas's WebGL2 context, set up for drawing premultiplied colour over a transparent
 * canvas (so the page's, or OBS's, background shows through); null if there is none.
 */
export function getGl(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  });
}

/**
 * Watches the canvas for its context being lost and given back. While it is lost nothing can
 * be drawn; when it comes back every GL object is gone, so `onRestore` has them made again.
 */
export class ContextGuard {
  private lostNow = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onRestore: () => void,
  ) {
    canvas.addEventListener('webglcontextlost', this.lose);
    canvas.addEventListener('webglcontextrestored', this.restore);
  }

  get isLost(): boolean {
    return this.lostNow;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.lose);
    this.canvas.removeEventListener('webglcontextrestored', this.restore);
  }

  private readonly lose = (event: Event): void => {
    // Without this the browser never gives the context back.
    event.preventDefault();
    this.lostNow = true;
  };

  private readonly restore = (): void => {
    this.lostNow = false;
    this.onRestore();
  };
}
