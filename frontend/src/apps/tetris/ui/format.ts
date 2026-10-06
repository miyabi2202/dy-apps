import { EFFECT_INFO, type EffectType } from '../core/curses';

export const percent = (p: number) => `${Math.round(p * 100)}%`;

export const effectName = (type: EffectType) => EFFECT_INFO[type].name;
