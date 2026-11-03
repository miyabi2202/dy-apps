import { CONFIG } from '../core/config';
import type { TheftView } from '../core/theft-clock';
import { theftPose } from '../ui/theft';

const { cols } = CONFIG.board;

describe('小偷 pose', () => {
  const view = (x: number, stage: TheftView['stage'], progress: number): TheftView => ({
    stage,
    progress,
    sender: null,
    x,
    y: 10,
    cell: 'G',
  });

  it('comes in from the right for a cell in the left half, and leaves to the left', () => {
    const start = theftPose(view(1, 'sneak', 0));
    expect(start.x).toBeGreaterThan(cols);
    expect(start.facing).toBe(-1);
    const flee = theftPose(view(1, 'flee', 0.5));
    expect(flee.facing).toBe(-1);
    expect(theftPose(view(1, 'flee', 0.99)).x).toBeLessThan(0);
  });

  it('comes in from the left for a cell in the right half, mirrored', () => {
    const start = theftPose(view(cols - 2, 'sneak', 0));
    expect(start.x).toBeLessThan(0);
    expect(start.facing).toBe(1);
    expect(theftPose(view(cols - 2, 'flee', 0.5)).facing).toBe(1);
    expect(theftPose(view(cols - 2, 'flee', 0.99)).x).toBeGreaterThan(cols);
    // The mirror of the same cell on the left.
    const left = theftPose(view(1, 'grab', 1)).carry!;
    expect(theftPose(view(cols - 2, 'grab', 1)).carry).toEqual({ x: cols - 1 - left.x, y: left.y });
  });
});
