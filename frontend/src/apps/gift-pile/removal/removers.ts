import type { Remover } from './board';
import { HotAirBalloon } from './balloon/hot-air-balloon';
import { BlackHole } from './black-hole/black-hole';
import { ClawMachine } from './claw/claw-machine';
import { Fireworks } from './fireworks/fireworks';
import { Evanesco } from './evanesco/evanesco';
import { Helicopter } from './helicopter/helicopter';
import { Hypercar } from './hypercar/hypercar';
import { PacMan } from './pac-man/pac-man';
import { Subway } from './subway/subway';
import { Ufo } from './ufo/ufo';

/** One of every remover, each with its own colours: the one place they are listed. */
export const allRemovers = (): Remover[] => [
  new Helicopter(),
  new Ufo(),
  new HotAirBalloon(),
  new Hypercar(),
  new PacMan(),
  new ClawMachine(),
  new Fireworks(),
  new BlackHole(),
  new Evanesco(),
  new Subway(),
];
