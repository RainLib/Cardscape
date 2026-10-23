import { canvasFor } from './image-assets.ts';

export const maskColors = {
  motion: [78, 214, 187],
  inset: [141, 174, 248],
  emission: [255, 180, 75],
  phase: [205, 136, 242],
  rigid: [244, 119, 132],
  coverage: [112, 190, 236],
  foil: [241, 214, 120],
} as const;
export const maskNames = {
  motion: '运动',
  inset: '框内外',
  emission: '发光',
  phase: '流光进度',
  rigid: '刚性保护',
  coverage: '可见轮廓',
  foil: '盔甲反光',
} as const;
export type MaskId = keyof typeof maskNames;
export interface MaskSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixels: ImageData;
  overlay: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;
  overlayPixels: ImageData;
}
export interface MaskStatistics {
  activePixels: number;
  mean: number;
  bounds: [number, number, number, number] | null;
}

export function createMaskAssets(
  imageFrom: (source: string) => Promise<HTMLImageElement>,
  update: (id: string, pixels: ImageData) => void,
) {
  const masks = new Map<string, MaskSurface>();
  const maskVersions = new WeakMap<HTMLCanvasElement, number>();
  async function registerMask(id: string, source: string | HTMLImageElement) {
    if (!Object.hasOwn(maskNames, id)) throw Error('未知 Mask：' + id);
    const image = typeof source === 'string' ? await imageFrom(source) : source;
    if (image.naturalWidth !== 1024 || image.naturalHeight !== 1536)
      throw Error('Mask 必须与母版同为 1024 × 1536');
    const canvas = canvasFor(),
      ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, 1024, 1536),
      color = maskColors[id as MaskId];
    let display:
      | {
          canvas: HTMLCanvasElement;
          ctx: CanvasRenderingContext2D;
          pixels: ImageData;
        }
      | undefined;
    function overlay() {
      if (!display) {
        const canvas = canvasFor(),
          ctx = canvas.getContext('2d')!,
          data = ctx.createImageData(1024, 1536);
        for (let i = 0; i < pixels.data.length; i += 4) {
          data.data[i] = color[0];
          data.data[i + 1] = color[1];
          data.data[i + 2] = color[2];
          data.data[i + 3] = pixels.data[i]! * 0.65;
        }
        ctx.putImageData(data, 0, 0);
        display = { canvas, ctx, pixels: data };
      }
      return display;
    }
    masks.set(id, {
      canvas,
      ctx,
      pixels,
      get overlay() {
        return overlay().canvas;
      },
      get overlayCtx() {
        return overlay().ctx;
      },
      get overlayPixels() {
        return overlay().pixels;
      },
    });
    maskVersions.set(canvas, 1);
    update(id, pixels);
  }
  function statistics(): Record<string, MaskStatistics> {
    const result: Record<string, MaskStatistics> = {};
    for (const [name, mask] of masks) {
      let count = 0,
        sum = 0,
        minX = 1024,
        minY = 1536,
        maxX = -1,
        maxY = -1;
      for (let i = 0; i < mask.pixels.data.length; i += 4) {
        const value = mask.pixels.data[i];
        sum += value;
        if (value > 10) {
          count++;
          const pixel = i / 4,
            x = pixel % 1024,
            y = Math.floor(pixel / 1024);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      result[name] = {
        activePixels: count,
        mean: sum / (1024 * 1536 * 255),
        bounds: count ? [minX, minY, maxX, maxY] : null,
      };
    }
    return result;
  }
  return { masks, maskVersions, registerMask, statistics };
}
