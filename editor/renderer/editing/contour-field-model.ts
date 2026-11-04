import type { CardContour, Vec2 } from '../../shared/render-models';
import G from './contour-geometry.ts';
import DT from './contour-distance-transform.ts';
import Coordinates from './contour-coordinate-model.ts';
const padding = 160,
  range = 192;
export interface ContourField {
  width: number;
  height: number;
  domainWidth: number;
  data: Uint8Array;
  key: string;
  padding: number;
  step: number;
  range: number;
}
const cache = new Map<string, ContourField>();
const key = (shape: CardContour, step = 1) => step + ':' + G.key(shape);
function raster(
  rings: Vec2[][],
  xor: boolean,
  width: number,
  height: number,
  step: number,
) {
  const stride = width + 2,
    mask = new Uint8Array(stride * (height + 2));
  for (const ring of rings)
    for (let y = 0; y < height; y++) {
      const at = (y + 0.5) * step - padding,
        xs: number[] = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j],
          b = ring[i];
        if (a[1] > at !== b[1] > at)
          xs.push(
            (a[0] + ((b[0] - a[0]) * (at - a[1])) / (b[1] - a[1]) + padding) /
              step,
          );
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const start = Math.max(0, Math.ceil(xs[k] - 0.5)),
          end = Math.min(width, Math.ceil(xs[k + 1] - 0.5)),
          offset = (y + 1) * stride + 1;
        if (xor) for (let x = start; x < end; x++) mask[offset + x] ^= 1;
        else mask.fill(1, offset + start, offset + end);
      }
    }
  return mask;
}
function quantize(
  mask: Uint8Array,
  width: number,
  height: number,
  step: number,
) {
  const outside = DT.transform(mask, width + 2, height + 2, 0).distance,
    inside = DT.transform(mask, width + 2, height + 2, 1).distance,
    result = new Uint16Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y + 1) * (width + 2) + x + 1,
        signed =
          (mask[i] ? Math.sqrt(outside[i]) - 0.5 : 0.5 - Math.sqrt(inside[i])) *
          step;
      result[y * width + x] = Math.round(
        ((Math.max(-range, Math.min(range, signed)) + range) / (2 * range)) *
          4095,
      );
    }
  return result;
}
/** One opaque atlas contains RGB12 distances and a separate RGB16 arc/ring map.
 * Both dimensions stay below WebGL 1's 2048-pixel minimum texture limit. */
function create(shape: CardContour, step: 1 | 2 | 4 = 1): ContourField {
  if (![1, 2, 4].includes(step)) throw Error('轮廓采样步长无效');
  const id = key(shape, step),
    cached = cache.get(id);
  if (cached) {
    cache.delete(id);
    cache.set(id, cached);
    return cached;
  }
  G.validate(shape);
  const domainWidth = (1024 + 2 * padding) / step,
    height = (1536 + 2 * padding) / step,
    width = domainWidth * 1.5,
    outer = raster(
      G.regions(shape).map((r) => r.outline),
      false,
      domainWidth,
      height,
      step,
    ),
    solid = raster(G.rings(shape), true, domainWidth, height, step),
    aperture = new Uint8Array(outer.length);
  for (let i = 0; i < outer.length; i++)
    aperture[i] = outer[i] && !solid[i] ? 1 : 0;
  const a = quantize(outer, domainWidth, height, step),
    b = quantize(aperture, domainWidth, height, step),
    phase = Coordinates.create(shape, domainWidth / 2, height, padding, step),
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < domainWidth; x++) {
      const i = y * domainWidth + x,
        k = (y * width + x) * 4;
      data[k] = a[i] >> 4;
      data[k + 1] = (a[i] & 15) * 16 + (b[i] >> 8);
      data[k + 2] = b[i] & 255;
      data[k + 3] = 255;
    }
    data.set(
      phase.subarray(y * domainWidth * 2, (y + 1) * domainWidth * 2),
      (y * width + domainWidth) * 4,
    );
  }
  const field = {
    width,
    height,
    domainWidth,
    data,
    key: id,
    padding,
    step,
    range,
  };
  cache.set(id, field);
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
  return field;
}
function texel(field: ContourField, x: number, y: number): [number, number] {
  x = Math.max(0, Math.min(field.domainWidth - 1, x));
  y = Math.max(0, Math.min(field.height - 1, y));
  const k = (y * field.width + x) * 4,
    r = field.data[k],
    g = field.data[k + 1],
    b = field.data[k + 2];
  return [
    ((r * 16 + (g >> 4)) / 4095) * range * 2 - range,
    (((g & 15) * 256 + b) / 4095) * range * 2 - range,
  ];
}
function decode(field: ContourField, x: number, y: number): [number, number] {
  return texel(
    field,
    Math.floor((x + field.padding) / field.step),
    Math.floor((y + field.padding) / field.step),
  );
}
function sample(field: ContourField, x: number, y: number) {
  const px = (x + padding) / field.step - 0.5,
    py = (y + padding) / field.step - 0.5,
    ix = Math.floor(px),
    iy = Math.floor(py),
    fx = px - ix,
    fy = py - iy,
    a = texel(field, ix, iy),
    b = texel(field, ix + 1, iy),
    c = texel(field, ix, iy + 1),
    d = texel(field, ix + 1, iy + 1);
  return a.map(
    (v, i) =>
      (v * (1 - fx) + b[i] * fx) * (1 - fy) +
      (c[i] * (1 - fx) + d[i] * fx) * fy,
  ) as [number, number];
}
function path(field: ContourField, x: number, y: number) {
  const px = Math.max(
      0,
      Math.min(
        field.domainWidth / 2 - 1,
        Math.floor((x + padding) / (2 * field.step)),
      ),
    ),
    py = Math.max(
      0,
      Math.min(field.height - 1, Math.floor((y + padding) / field.step)),
    ),
    k = (py * field.width + field.domainWidth + px) * 4;
  return {
    phase: (field.data[k] * 256 + field.data[k + 1]) / 65536,
    ring: field.data[k + 2] >> 1,
    window: !!(field.data[k + 2] & 1),
  };
}
function material(field: ContourField, x: number, y: number) {
  const px = (x + padding) / field.step - 0.5,
    py = (y + padding) / field.step - 0.5,
    ix = Math.floor(px),
    iy = Math.floor(py),
    fx = px - ix,
    fy = py - iy;
  function value(dx: number, dy: number, channel: number) {
    const tx = Math.max(0, Math.min(field.domainWidth - 1, ix + dx)),
      ty = Math.max(0, Math.min(field.height - 1, iy + dy)),
      k = (ty * field.width + tx) * 4;
    const g = field.data[k + 1];
    return (
      ((channel === 0
        ? field.data[k] * 16 + (g >> 4)
        : (g & 15) * 256 + field.data[k + 2]) /
        4095) *
        384 -
      192
    );
  }
  if (fx === 0 && fy === 0) return Math.min(value(0, 0, 0), -value(0, 0, 1));
  function interpolate(channel: number) {
    return (
      (value(0, 0, channel) * (1 - fx) + value(1, 0, channel) * fx) * (1 - fy) +
      (value(0, 1, channel) * (1 - fx) + value(1, 1, channel) * fx) * fy
    );
  }
  return Math.min(interpolate(0), -interpolate(1));
}
export default { create, key, decode, sample, path, material, padding, range };
