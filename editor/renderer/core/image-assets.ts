import { ResourceCache } from './resource-cache.ts';
import type { EmbeddedFont } from '../../shared/document';

export type RasterSource = HTMLImageElement | HTMLCanvasElement;

export function createFontRegistry() {
  const fonts = new Map<string, Promise<FontFace>>();
  return function registerFont(font: EmbeddedFont): Promise<FontFace> {
    const existing = fonts.get(font.family);
    if (existing) return existing;
    const flight = new FontFace(font.family, `url(${font.src})`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        return face;
      })
      .catch((error) => {
        fonts.delete(font.family);
        throw error;
      });
    fonts.set(font.family, flight);
    return flight;
  };
}

export function canvasFor(width = 1024, height = 1536): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function pngFromImage(image: RasterSource): string {
  const canvas = canvasFor(
    image instanceof HTMLImageElement
      ? image.naturalWidth || image.width
      : image.width,
    image instanceof HTMLImageElement
      ? image.naturalHeight || image.height
      : image.height,
  );
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** A bounded shared decoder keeps preview/export requests for one source in flight once. */
export function createImageAssets() {
  let decoded = 0;
  const cache = new ResourceCache<HTMLImageElement>({
    maxEntries: 32,
    maxBytes: 96 * 1024 * 1024,
    concurrency: 4,
    size: (image) => image.naturalWidth * image.naturalHeight * 4,
    keyBytes: (source) => source.length * 2,
    load: (source) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        decoded++;
        const image = new Image();
        const fail = (message: string) => {
          clearTimeout(timer);
          image.onload = image.onerror = null;
          image.src = '';
          reject(Error(message));
        };
        const timer = setTimeout(
          () => fail('图像解码超时，请重试或检查素材'),
          15000,
        );
        image.onload = () => {
          clearTimeout(timer);
          image.onload = image.onerror = null;
          resolve(image);
        };
        image.onerror = () =>
          fail(
            '图像载入失败：' +
              (source.startsWith('data:') ? '内嵌 PNG' : source),
          );
        image.src = source;
      }),
  });
  return {
    imageFrom: (source: string) => cache.get(source),
    stats: () => ({ ...cache.stats, decoded }),
  };
}
