import { canvasSize, PILE } from './core/config';
import { Pile } from './pile';
import { PileClient } from './pile-client';
import { allRemovers } from './removal/removers';
import { Camera } from './render/camera';
import { PileState, pileStateOptions } from './render/pile-state';
import { GlRenderer } from './render/gl-renderer';
import { GIFT_ICON_URL, loadImage } from './render/sprite';
import { prefersReducedMotion, readEffects } from './settings';
import { CUT_IN_MS } from './ui/cut-in';

/**
 * Wires the real objects together, once, for the page: the client posts frames to the pile,
 * which keeps them in a state, steers a camera, and has the renderer draw them, with one of
 * each remover to deal from. The worker itself starts with `pile.start()`.
 */
export function createPile(): Pile {
  const world = canvasSize(PILE.world);
  const client = new PileClient({
    onFrame: (frame) => pile.onFrame(frame, performance.now()),
  });
  const state = new PileState(PILE, pileStateOptions(PILE, world));
  const camera = new Camera({ radius: PILE.radius, headroom: PILE.headroom, height: world.height });
  const effects = readEffects();
  const removers = allRemovers();
  const renderer = new GlRenderer(PILE, {
    quality: effects.quality,
    shaders: removers.flatMap((remover) => remover.shaders ?? []),
  });
  const pile = new Pile({
    client,
    state,
    camera,
    renderer,
    removers,
    radius: PILE.radius,
    loadGiftImage: () => loadImage(GIFT_ICON_URL),
    effects,
    reducedMotion: prefersReducedMotion(),
    cutInMs: CUT_IN_MS,
  });
  return pile;
}
