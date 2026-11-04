import type { CardLayer } from '../../shared/document';

/** Restore the original card registration after decoding either export tier. */
function registered(
  layer: CardLayer | undefined,
  image: HTMLImageElement,
  sourceSize?: readonly number[],
): HTMLImageElement | HTMLCanvasElement {
  if (
    !layer?.sourceWindow ||
    layer.kind === 'background' ||
    layer.role === 'background-candidate'
  )
    return image;
  const window = layer.sourceWindow;
  const sx = image.width / (sourceSize?.[0] || image.width);
  const sy = image.height / (sourceSize?.[1] || image.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(1024 * sx));
  canvas.height = Math.max(1, Math.round(1536 * sy));
  canvas
    .getContext('2d')!
    .drawImage(
      image,
      window.x * sx,
      window.y * sy,
      window.width * sx,
      window.height * sy,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas;
}

export default { registered };
