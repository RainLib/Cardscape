import type { SurfaceImage } from '../../shared/surface-preview';
type Bounds = readonly [number, number, number, number];
const full: Bounds = [0, 0, 1, 1];
const empty: Bounds = [-1, -1, -1, -1];
const cache = new WeakMap<
  HTMLImageElement,
  { source: string; width: number; height: number; bounds: Bounds }
>();
/** Conservative support of a linearly filtered, clamp-to-edge RGBA texture.
 * Two decoded texels of padding retain filtering and UV roundoff at the edge. */
function pixels(image: {
  width: number;
  height: number;
  data: ArrayLike<number>;
}): Bounds {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16 * 1024 * 1024 ||
    data.length < width * height * 4
  )
    return full;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) return empty;
  return [
    Math.max(0, left - 2) / width,
    Math.max(0, top - 2) / height,
    Math.min(width, right + 3) / width,
    Math.min(height, bottom + 3) / height,
  ];
}
/** Mutable canvases/pixels keep the full support. No scans in the draw loop. */
function image(source: SurfaceImage): Bounds {
  if (
    typeof HTMLImageElement === 'undefined' ||
    !(source instanceof HTMLImageElement)
  )
    return full;
  const width = source.naturalWidth,
    height = source.naturalHeight,
    key = source.currentSrc || source.src;
  if (!key || !width || !height || width * height > 16 * 1024 * 1024)
    return full;
  const previous = cache.get(source);
  if (
    previous?.source === key &&
    previous.width === width &&
    previous.height === height
  )
    return previous.bounds;
  let bounds: Bounds = full;
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(source, 0, 0);
      bounds = pixels(ctx.getImageData(0, 0, width, height));
    }
  } catch {
    // CORS-protected or otherwise unreadable artwork still renders normally.
  } finally {
    canvas.width = canvas.height = 0;
  }
  cache.set(source, { source: key, width, height, bounds });
  return bounds;
}
export default { full, empty, pixels, image };
