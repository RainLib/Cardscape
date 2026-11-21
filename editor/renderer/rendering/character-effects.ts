import type { CardLayer, CharacterEffects } from '../../shared/document';
import stats from '../editing/card-stats.ts';
import spatial from './spatial-model.ts';

export const motionTypes = ['sash', 'hair', 'cape'] as const;
export type MotionType = (typeof motionTypes)[number];

export const nerisVale: CharacterEffects = {
  breakout: { enabled: true },
  wordmark: { enabled: true },
  sash: { enabled: true, strength: 1, speed: 1 },
  hair: { enabled: true, strength: 0.42, speed: 1 },
  cape: { enabled: true, strength: 0.58, speed: 1 },
  glow: { enabled: true, strength: 1, speed: 1, color: '#73c4ff' },
};

const isWordmark = (layer: CardLayer) =>
  (layer.kind === 'text' && !stats.isStat(layer)) ||
  (layer.kind === 'image' && layer.role === 'wordmark');

const isOccluder = (layer: CardLayer) =>
  layer.kind === 'image' && spatial.role(layer) === 'front';

function wordmarks(layers: readonly CardLayer[]) {
  return layers.filter(isWordmark);
}

function occluders(layers: readonly CardLayer[]) {
  return layers.filter(isOccluder);
}

/** Layers arrive in their current painter order, back to front. Move the
 * chosen wordmark across just the chosen part, including on animated cards. */
function order(layers: CardLayer[], setting?: CharacterEffects['wordmark']) {
  if (!setting) return layers;
  const marks = wordmarks(layers).filter((l) => l.visible !== false);
  const parts = occluders(layers).filter((l) => l.visible !== false);
  const mark = setting.layerId
    ? marks.find((l) => l.id === setting.layerId)
    : marks.find((l) => l.titleArt || l.role === 'wordmark') ||
      marks.find((l) => l.id === 'title') ||
      marks[marks.length - 1];
  const part = setting.occluderId
    ? parts.find((l) => l.id === setting.occluderId)
    : parts.find((l) => l.anatomy?.part === 'skirt') || parts[parts.length - 1];
  if (!mark || !part) return layers;
  const result = layers.filter((l) => l !== mark);
  result.splice(result.indexOf(part) + Number(!setting.enabled), 0, mark);
  return result;
}

function motionType(layer: CardLayer, effects?: CharacterEffects): MotionType {
  if (layer.kind === 'foreground' && effects?.bodyMotion)
    return effects.bodyMotion;
  const part = layer.anatomy?.part;
  return part === 'hair' || part === 'cape' ? part : 'sash';
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toggle(
  value: unknown,
): value is Record<string, unknown> & { enabled: boolean } {
  return object(value) && typeof value.enabled === 'boolean';
}

function motion(value: unknown): boolean {
  return (
    object(value) &&
    toggle(value) &&
    typeof value.strength === 'number' &&
    value.strength >= 0 &&
    value.strength <= 2 &&
    typeof value.speed === 'number' &&
    value.speed >= 0.1 &&
    value.speed <= 3
  );
}

function validate(value: unknown) {
  if (value === undefined) return;
  if (
    !object(value) ||
    !toggle(value.breakout) ||
    !object(value.wordmark) ||
    !toggle(value.wordmark) ||
    !['layerId', 'occluderId'].every((key) => {
      const id = (value.wordmark as Record<string, unknown>)[key];
      return (
        id === undefined ||
        (typeof id === 'string' && /^[\w-]{1,100}$/.test(id))
      );
    }) ||
    !motionTypes.every((key) => motion(value[key])) ||
    (value.bodyMotion !== undefined &&
      !motionTypes.some((part) => part === value.bodyMotion)) ||
    !object(value.glow) ||
    !motion(value.glow) ||
    typeof value.glow.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(value.glow.color)
  )
    throw Error('人物动效参数无效');
}

export default {
  nerisVale,
  motionTypes,
  motionType,
  wordmarks,
  occluders,
  order,
  validate,
};
