import type { CardDocument, CardLayer, TextStyle } from '../../shared/document';
import { canvasFor, type RasterSource } from '../core/image-assets.ts';
import importedCardTitle from '../editing/title-model.ts';
import importedCardStats from '../editing/card-stats.ts';
import importedCardComponents from '../workshop/component-model.ts';

/** Caches belong to one editor document renderer, not to the application window. */
export function createDocumentRenderer(
  getDocument: () => CardDocument,
  titleImages: Map<string, HTMLImageElement>,
) {
  const rasterCache = new Map<
    string,
    { key: string; canvas: HTMLCanvasElement }
  >();
  const alphaCache = new WeakMap<RasterSource, Uint8Array>();
  const registeredCache = new WeakMap<
    RasterSource,
    { key: string; canvas: HTMLCanvasElement }
  >();
  const adjustedCache = new WeakMap<
    RasterSource,
    { key: string; canvas: HTMLCanvasElement }
  >();
  function textStyle(
    layer: Partial<CardLayer>,
    document = getDocument(),
  ): TextStyle {
    return {
      fontFamily: 'STKaiti',
      fontSize: 92,
      fontWeight: '800',
      italic: true,
      color: '#f0debb',
      stroke: '#171c23',
      strokeWidth: 9,
      align: 'center',
      ...importedCardTitle.resolve(layer, document?.locale).style,
    };
  }

  function drawText(
    context: CanvasRenderingContext2D,
    layer: CardLayer,
    document = getDocument(),
  ) {
    const s = textStyle(layer, document),
      title = importedCardTitle.resolve(layer, document?.locale);
    if (importedCardStats.isStat(layer)) {
      importedCardStats.draw(context, layer, s);
      return;
    }
    if (title.src && titleImages.has(title.src)) {
      context.drawImage(titleImages.get(title.src), 0, 0, 1024, 1536);
      return;
    }
    context.font = `${s.italic ? 'italic ' : ''}${s.fontWeight} ${s.fontSize}px "${s.fontFamily}",serif`;
    context.textAlign = s.align;
    context.lineJoin = 'round';
    const x = s.align === 'left' ? 60 : s.align === 'right' ? 964 : 512;
    context.strokeStyle = s.stroke;
    context.lineWidth = s.strokeWidth;
    if (s.strokeWidth > 0) context.strokeText(title.text, x, 1480);
    context.fillStyle = s.color;
    context.fillText(title.text, x, 1480);
  }

  function textRaster(layer: CardLayer, document = getDocument()) {
    const key = JSON.stringify([
      layer.text,
      layer.textStyle,
      layer.role,
      layer.titleArt,
      document?.locale,
    ]);
    if (rasterCache.get(layer.id)?.key === key)
      return rasterCache.get(layer.id).canvas;
    const c = canvasFor();
    drawText(c.getContext('2d'), layer, document);
    rasterCache.set(layer.id, { key, canvas: c });
    return c;
  }

  function imageAlpha(image: RasterSource) {
    if (alphaCache.has(image)) return alphaCache.get(image);
    const c = canvasFor(),
      cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(image, 0, 0, 1024, 1536);
    const data = cc.getImageData(0, 0, 1024, 1536).data,
      alpha = new Uint8Array(1024 * 1536);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    alphaCache.set(image, alpha);
    return alpha;
  }

  function registeredImage(layer: CardLayer, image: RasterSource) {
    if (!layer.sourceWindow) return image;
    const r = layer.sourceWindow,
      key = JSON.stringify(r);
    let entry = registeredCache.get(image);
    if (entry?.key === key) return entry.canvas;
    const c = canvasFor();
    c.getContext('2d').drawImage(
      image,
      r.x,
      r.y,
      r.width,
      r.height,
      0,
      0,
      1024,
      1536,
    );
    registeredCache.set(image, { key, canvas: c });
    return c;
  }

  function adjustedImage(layer: CardLayer, image: RasterSource) {
    const adj = importedCardComponents.adjustments(
      layer.componentAdjustments,
      layer.adjustments,
    );
    if (
      !adj ||
      (!adj.brightness &&
        !adj.contrast &&
        adj.saturation === 100 &&
        adj.gamma === 1)
    )
      return image;
    const key = JSON.stringify(adj),
      cached = adjustedCache.get(image);
    if (cached?.key === key) return cached.canvas;
    const c = canvasFor(image.width, image.height),
      cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(image, 0, 0);
    const data = cc.getImageData(0, 0, c.width, c.height),
      pixels = data.data,
      table = new Float32Array(256),
      brightness = adj.brightness / 100,
      contrast = 1 + adj.contrast / 100,
      saturation = adj.saturation / 100;
    for (let i = 0; i < 256; i++)
      table[i] =
        Math.max(
          0,
          Math.min(1, (i / 255 - 0.5) * contrast + 0.5 + brightness),
        ) **
        (1 / adj.gamma);
    for (let i = 0; i < pixels.length; i += 4) {
      if (!pixels[i + 3]) continue;
      const r = table[pixels[i]],
        g = table[pixels[i + 1]],
        b = table[pixels[i + 2]],
        y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixels[i] = Math.round(
        Math.max(0, Math.min(1, y + (r - y) * saturation)) * 255,
      );
      pixels[i + 1] = Math.round(
        Math.max(0, Math.min(1, y + (g - y) * saturation)) * 255,
      );
      pixels[i + 2] = Math.round(
        Math.max(0, Math.min(1, y + (b - y) * saturation)) * 255,
      );
    }
    cc.putImageData(data, 0, 0);
    adjustedCache.set(image, { key, canvas: c });
    return c;
  }

  function titleRasterBounds(canvas: HTMLCanvasElement): [number, number] {
    const pixels = canvas
      .getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let min = canvas.width,
      max = -1;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] > 20) {
        const x = ((i - 3) / 4) % canvas.width;
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    return max >= min ? [min / canvas.width, (max + 1) / canvas.width] : [0, 1];
  }
  return {
    textStyle,
    drawText,
    textRaster,
    imageAlpha,
    registeredImage,
    adjustedImage,
    titleRasterBounds,
  };
}
