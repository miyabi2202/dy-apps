import { canvasSize, PILE } from './core/config';
import { RemovalDirector } from './removal/director';
import { Helicopter, HELICOPTER_SCHEMES } from './removal/flyover/crafts/helicopter';
import { BALLOON_PALETTES, HotAirBalloon } from './removal/flyover/crafts/hot-air-balloon';
import { CAR_PALETTES, Hypercar } from './removal/flyover/crafts/hypercar';
import { Ufo, UFO_SCHEMES } from './removal/flyover/crafts/ufo';
import { Flyover } from './removal/flyover/flyover';
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
 * removals as the renderer's overlay, with one of each remover, and its colours, to deal
 * from. The worker itself starts with `client.start()`.
 */
export function createPile(): Pile {
  const client = new PileClient({
    onFrame: (frame) => renderer.pushFrame(frame, performance.now()),
  });
  // Each removal deals a remover, then it picks one of its colours from these.
  const helicopter = new Helicopter({ schemes: HELICOPTER_SCHEMES });
  const ufo = new Ufo({ schemes: UFO_SCHEMES });
  const crafts = [
    helicopter,
    ufo,
    new HotAirBalloon({ palettes: BALLOON_PALETTES }),
    new Hypercar({ palettes: CAR_PALETTES }),
  ];
  const director = new RemovalDirector(client, {
    removers: crafts.map((craft) => new Flyover(craft)),
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
    // The crafts keep their art whether or not the page is still here.
    for (const craft of [helicopter, ufo]) void craft.art.load();
    return () => {
      wanted = false;
    };
  };
  return { client, renderer, director, loadImages };
}
