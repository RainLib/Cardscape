import type { CardDocument } from '../../shared/document';

interface AssetPreparation {
  imageFrom(src: string): Promise<HTMLImageElement>;
  fallbackBack(): string;
  fallbackMask(): string;
  maskNames: Record<string, string>;
  progress(completed: number, total: number): void;
}

/** Decode and validate everything before replacing the active document. */
export async function prepare(doc: CardDocument, options: AssetPreparation) {
  const requests: Array<[string, string]> = [];
  for (const layer of doc.layers) {
    for (const variant of layer.titleArt?.variants || [])
      if (variant.src) requests.push(['title:' + variant.src, variant.src]);
    if (layer.src) requests.push(['layer:' + layer.id, layer.src]);
    if (layer.master) requests.push(['master:' + layer.id, layer.master]);
  }
  const backSource = doc.back || doc.backScene?.src || options.fallbackBack();
  requests.push(['back', backSource]);
  for (const id of Object.keys(options.maskNames)) {
    const source =
      doc.masks[id] || (id === 'foil' ? options.fallbackMask() : null);
    if (id === 'subject' && !source) continue;
    if (!source) throw Error('工程缺少 ' + options.maskNames[id] + ' Mask');
    requests.push(['mask:' + id, source]);
  }
  const prepared = new Map<string, HTMLImageElement>();
  let completed = 0;
  await Promise.all(
    requests.map(async ([id, src]) => {
      const image = await options.imageFrom(src);
      if (
        image.naturalWidth > 8192 ||
        image.naturalHeight > 8192 ||
        image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024
      )
        throw Error('图像超过 16 MP / 8192 px 上限');
      if (
        id.startsWith('mask:') &&
        (image.naturalWidth !== 1024 || image.naturalHeight !== 1536)
      )
        throw Error('Mask 与母版尺寸不一致');
      prepared.set(id, image);
      options.progress(++completed, requests.length);
    }),
  );
  return { prepared, backSource };
}
