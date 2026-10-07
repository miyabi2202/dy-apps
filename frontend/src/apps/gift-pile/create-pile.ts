import { canvasSize, PILE } from './core/config';
import { RemovalDirector } from './removal/director';
import { allRemovers } from './removal/removers';
import { PileClient } from './pile-client';
import { PileRenderer } from './render/renderer';
import { createGiftSprite, GIFT_ICON_URL, loadImage } from './render/sprite';

/** Everything the page drives: the worker's client, the removals over the pile, and the renderer. */
export interface Pile {
  client: PileClient;
  renderer: PileRenderer;
  director: RemovalDirector;
  /**
   * Loads the gift image and the removers' art and hands them over; the gift's drawn
   * stand-in shows until then.
   * Returns a function that stops the hand-over, for when the page goes away first.
   */
  loadImages: () => () => void;
}

/**
 * Wires the real objects together, once, for the page: the client posts frames to the
 * renderer, the director sends the engine its commands through the client and draws its
 * removals as the renderer's overlay, with one of each remover to deal from. The worker itself starts with `client.start()`.
 */
export function createPile(): Pile {
  const client = new PileClient({
    onFrame: (frame) => renderer.pushFrame(frame, performance.now()),
  });
  const removers = allRemovers();
  const director = new RemovalDirector(client, { removers });
  const renderer = new PileRenderer(
    { ...PILE, world: canvasSize(PILE.world) },
    createGiftSprite,
    director,
  );
  const loadImages = () => {
    let wanted = true;
    void loadImage(GIFT_ICON_URL).then((image) => {
      if (wanted) renderer.setImage(image);
    });
    // The removers keep their images whether or not the page is still here.
    for (const remover of removers) void remover.load?.();
    return () => {
      wanted = false;
    };
  };
  return { client, renderer, director, loadImages };
}
