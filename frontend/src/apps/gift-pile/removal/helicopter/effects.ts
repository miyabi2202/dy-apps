// The helicopter's air and light: the rotor's downwash, the searchlight down to the winchman,
// the vortex at his nozzle and the sparks of what it throws out. Times in ms, geometry in
// world pixels.

import type { Gfx, Point } from '../board';
import { Frames } from '../kit/clock';
import { sparkBurst } from '../kit/fx';
import { Emitter } from '../kit/particles';
import { BELLY, ROTOR, ROTOR_REACH } from './chopper';

const SEARCHLIGHT = '#fff7d6';
/** A flash where something is thrown out lasts this long. */
const FLASH_MS = 40;
const FLASH_FADE_MS = 160;

/** What is going on this frame, for the effects to show. */
export interface Scene {
  /** The cabin's middle. */
  chopper: Point;
  tilt: number;
  /** Time since the mission began. */
  t: number;
  /** Where the winchman is (his feet) and whether he is on the pile; null while the helicopter flies alone. */
  man: Point | null;
  onPile: boolean;
  /** His nozzle while he is vacuuming, else null. */
  nozzle: Point | null;
  /** The top of the pile under the helicopter, where the downwash kicks up dust. */
  groundY: number;
  /** Where the dust is raised: within this far either side of x. */
  hoverX: number;
}

export class Effects {
  private readonly frames = new Frames();
  private readonly wash: Emitter;
  private readonly dust: Emitter;
  private readonly vortex: Emitter;
  private readonly sparks: Emitter;
  private readonly flashes: { x: number; y: number; at: number }[] = [];

  constructor(private readonly rng: () => number) {
    this.wash = new Emitter(
      {
        capacity: 160,
        colorFrom: '#ffffff',
        sizeOverLife: (u) => 0.5 + u,
        alphaOverLife: (u) => 0.25 * (1 - u),
        drag: 2,
      },
      rng,
    );
    this.dust = new Emitter(
      {
        capacity: 160,
        colorFrom: '#fecdd3',
        colorTo: '#ffffff',
        sizeOverLife: (u) => 0.6 + u,
        alphaOverLife: (u) => 0.3 * (1 - u),
        drag: 1.5,
      },
      rng,
    );
    this.vortex = new Emitter(
      { capacity: 160, shape: 'spark', colorFrom: '#e0f2fe', colorTo: '#38bdf8' },
      rng,
    );
    this.sparks = new Emitter(
      {
        capacity: 200,
        shape: 'spark',
        colorFrom: '#fff7d6',
        colorTo: '#fb923c',
        gravity: 500,
        drag: 0.8,
      },
      rng,
    );
  }

  /** Something thrown out of the door at `at`, `now` ms in. */
  thrown(at: Point, now: number): void {
    sparkBurst(this.sparks, at.x, at.y, '#fff7d6', 6, { speed: 220, life: 450, size: 6 });
    this.flashes.push({ x: at.x, y: at.y, at: now });
  }

  /** Draw it all behind the helicopter. */
  draw(gfx: Gfx, now: number, s: Scene): void {
    const { rng } = this;
    const dt = this.frames.dt(now);
    const hub = { x: s.chopper.x + ROTOR.x, y: s.chopper.y + ROTOR.y };

    // The downwash, thrown out from under the rotor, harder with the winchman down.
    this.wash.stream(s.onPile ? 120 : 60, dt, () => {
      const side = rng() < 0.5 ? -1 : 1;
      return {
        x: hub.x + side * ROTOR_REACH * (0.2 + 0.7 * rng()),
        y: hub.y + 4 + 6 * rng(),
        vx: side * (40 + 80 * rng()),
        vy: 30 + 40 * rng(),
        life: 500,
        size: 12,
      };
    });
    // Dust off the pile where the air meets it.
    if (s.onPile) {
      this.dust.stream(70, dt, () => {
        const side = rng() < 0.5 ? -1 : 1;
        return {
          x: s.hoverX + (rng() - 0.5) * 120,
          y: s.groundY + 4,
          vx: side * (30 + 80 * rng()),
          vy: -(10 + 50 * rng()),
          life: 700,
          size: 14,
        };
      });
    }
    // Air spiralling in to the nozzle.
    if (s.nozzle) {
      const nozzle = s.nozzle;
      this.vortex.stream(90, dt, () => {
        const angle = Math.PI / 2 + (rng() - 0.5) * 2.2;
        const r = 12 + 20 * rng();
        const life = 300;
        const speed = r / (life / 1000);
        const tangent = 110;
        return {
          x: nozzle.x + Math.cos(angle) * r,
          y: nozzle.y + Math.sin(angle) * r,
          vx: -Math.cos(angle) * speed - Math.sin(angle) * tangent,
          vy: -Math.sin(angle) * speed + Math.cos(angle) * tangent,
          life,
          size: 5,
          rotation: angle,
        };
      });
    }

    for (const e of [this.wash, this.dust, this.vortex, this.sparks]) {
      e.step(dt);
      e.draw(gfx);
    }

    // Heat over the engine.
    if (s.t > 0) gfx.haze(hub.x - 22, hub.y - 14, 44, 26, 0.5);

    // The searchlight, from the belly to where he is.
    if (s.man) {
      const from = {
        x: s.chopper.x + BELLY.x,
        y: s.chopper.y + BELLY.y,
      };
      const to = { x: s.man.x, y: s.man.y - 10 };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      // Sideways of the beam, to give it width.
      const nx = -dy / length;
      const ny = dx / length;
      const top = 3;
      const bottom = 26 + (0.5 + 0.5 * Math.sin(s.t / 260)) * 4;
      gfx.quad(
        [
          from.x - nx * top,
          from.y - ny * top,
          from.x + nx * top,
          from.y + ny * top,
          to.x + nx * bottom,
          to.y + ny * bottom,
          to.x - nx * bottom,
          to.y - ny * bottom,
        ],
        [
          'rgba(255, 247, 214, 0.35)',
          'rgba(255, 247, 214, 0.35)',
          'rgba(255, 247, 214, 0)',
          'rgba(255, 247, 214, 0)',
        ],
        { blend: 'add' },
      );
      gfx.glow(to.x, to.y + 8, 40, SEARCHLIGHT, { intensity: 0.5 });
    }
    // Where something was thrown out.
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k]!;
      const age = now - f.at;
      if (age > FLASH_MS + FLASH_FADE_MS) this.flashes.splice(k, 1);
      else {
        const fade = age < FLASH_MS ? 1 : 1 - (age - FLASH_MS) / FLASH_FADE_MS;
        gfx.glow(f.x, f.y, 26, '#ffffff', { intensity: 1.5 * fade });
      }
    }
  }
}
