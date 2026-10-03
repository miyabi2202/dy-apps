import { EFFECT_INFO } from '../core/config';
import type { EffectType } from '../core/types';

export const percent = (p: number) => `${Math.round(p * 100)}%`;

export const effectName = (type: EffectType) => EFFECT_INFO[type].name;
