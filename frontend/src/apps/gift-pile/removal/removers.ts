import type { Remover } from './board';
import { HotAirBalloon } from './balloon/hot-air-balloon';
import { ClawMachine } from './claw/claw-machine';
import { Fireworks } from './fireworks/fireworks';
import { Helicopter } from './helicopter/helicopter';
import { Hypercar } from './hypercar/hypercar';
import { Ufo } from './ufo/ufo';

/** One of every remover, each with its own colours: the one place they are listed. */
export const allRemovers = (): Remover[] => [
  new Helicopter(),
  new Ufo(),
  new HotAirBalloon(),
  new Hypercar(),
  new ClawMachine(),
  new Fireworks(),
];
