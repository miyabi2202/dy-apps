import { topKeeping } from '../removal/board';
import { moveWithView } from '../ui/bin';

describe('topKeeping', () => {
  const view = { top: -200, height: 100 };

  it('leaves the view where it is for a point already on screen, margins and all', () => {
    expect(topKeeping(view, -150, 10)).toBe(-200);
    // Exactly at either margin still counts as on screen.
    expect(topKeeping(view, -190, 10)).toBe(-200);
    expect(topKeeping(view, -110, 10)).toBe(-200);
  });

  it('moves the view just far enough for a point below it, or above it, to sit at the margin', () => {
    expect(topKeeping(view, -50, 10)).toBe(-140);
    expect(topKeeping(view, -250, 10)).toBe(-260);
  });
});

describe('moveWithView', () => {
  // A stage 700 CSS px tall over a canvas 700 world px tall: the bin's half is 25 px, about 0.036 of it.
  const place = { fx: 0.8, fy: 0.5 };
  const margin = 25 / 700;

  it('moves the bin with the world: down the stage as the view goes up, and up as it comes down', () => {
    expect(moveWithView(place, -70, 700, 700).fy).toBeCloseTo(0.6);
    expect(moveWithView(place, 70, 700, 700).fy).toBeCloseTo(0.4);
    expect(moveWithView(place, -70, 700, 700).fx).toBe(0.8);
  });

  it('keeps the bin all on the stage however far the view goes, so it can still be dragged', () => {
    expect(moveWithView(place, -5000, 700, 700).fy).toBeCloseTo(1 - margin);
    expect(moveWithView(place, 5000, 700, 700).fy).toBeCloseTo(margin);
  });

  it('gives back the same place when the bin stays put, so nothing re-renders for it', () => {
    expect(moveWithView(place, 0, 700, 700)).toBe(place);
    const atBottom = { fx: 0.8, fy: 1 - margin };
    expect(moveWithView(atBottom, -100, 700, 700)).toBe(atBottom);
  });
});
