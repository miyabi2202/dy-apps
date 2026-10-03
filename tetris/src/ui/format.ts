import { EFFECT_INFO } from '../core/config';
import { levelOf } from '../core/interventions';
import type { EffectNode, EffectType } from '../core/types';

export const percent = (p: number) => `${Math.round(p * 100)}%`;

export const effectName = (type: EffectType) => EFFECT_INFO[type].name;

export const nodeLabel = (node: EffectNode) =>
  `${effectName(node.type)} Lv.${levelOf(node.energy)}`;
