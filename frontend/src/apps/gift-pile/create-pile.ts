import { canvasSize, PILE } from './core/config';
import { HotAirBalloon } from './flights/crafts/hot-air-balloon';
import { Hypercar } from './flights/crafts/hypercar';
import { PaperPlane, PLANE_URL } from './flights/crafts/paper-plane';
import { FlightDirector } from './flights/director';
import { PileClient } from './pile-client';
import { PileRenderer } from './render/renderer';
import { createGiftSprite, GIFT_ICON_URL, loadImage } from './render/sprite';

/** Everything the page drives: the worker's client, the flights over the pile, and the renderer. */
export interface Pile {
  client: PileClient;
  renderer: PileRenderer;
  director: FlightDirector;
  /**
   * Loads the gift and plane images and hands them over; drawn stand-ins show until then.
   * Returns a function that stops the hand-over, for when the page goes away first.
   */
  loadImages: () => () => void;
}

/**
 * Wires the real objects together, once, for the page: the client posts frames to the
 * renderer, the director sends the engine its commands through the client and draws its
 * flights as the renderer's overlay, with one of each craft to pick from. The worker itself
 * starts with `client.start()`.
 */
export function createPile(): Pile {
  const client = new PileClient({
    onFrame: (frame) => renderer.pushFrame(frame, performance.now()),
  });
  const plane = new PaperPlane();
  const director = new FlightDirector(client, {
    crafts: [plane, new HotAirBalloon(), new Hypercar()],
  });
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
    void loadImage(PLANE_URL).then((image) => {
      if (wanted) plane.setImage(image);
    });
    return () => {
      wanted = false;
    };
  };
  return { client, renderer, director, loadImages };
}
