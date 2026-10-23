import remote from '../../renderer/rendering/remote-assets';
import adaptive from '../../renderer/rendering/adaptive-textures';
import { prepare } from '../../electron/material-maker-project';
import { compileMaterialMaker } from '../../electron/material-maker-compiler';
import { createMaterialMaker } from '../../electron/material-maker-service';
import type { MaterialMakerOptions } from '../../shared/material-maker';

async function contracts(options: MaterialMakerOptions) {
  const client = remote.create({
    cache: remote.memoryCache(1024),
    progress(value) {
      value.downloadedBytes.toFixed();
      // @ts-expect-error Download counters are numeric.
      value.cacheHits.toUpperCase();
    },
  });
  const catalog = await client.open('https://example.com/catalog.json');
  catalog.cards[0].webgl.base.map((id) => id.toUpperCase());
  const content = await client.loadCard('card', { tier: 'large' });
  // @ts-expect-error Expanded remote fields still require a consumer's decoder.
  content.manifest.layers.map(() => null);
  // @ts-expect-error Only supported delivery tiers are accepted.
  await client.loadCard('card', { tier: 'unlimited' });
  // @ts-expect-error Cached objects contain bytes.
  await remote.memoryCache().set('id', 'data');

  const loader = adaptive.create({
    entries: () => [
      { layerId: 'foreground', variants: { large: { asset: 'large.png' } } },
    ],
    load: async () => ({ width: 1024, height: 1536 }),
    apply(batch) {
      batch[0].entry.layerId.toUpperCase();
      batch[0].image.width.toFixed();
      // @ts-expect-error The loader preserves the image result type.
      batch[0].image.src.toUpperCase();
    },
  });
  await loader.set('small');
  const project = prepare(null, { source: '/tmp/source.png' });
  project.nodes[0].parameters = { speed: 2, pluginData: { enabled: true } };
  // @ts-expect-error Plugin properties are opaque until decoded.
  project.nodes[0].pluginData.enabled.valueOf();
  // @ts-expect-error Named node connections cannot target numeric ids.
  project.connections.push({ from: 1, to: 'output' });
  compileMaterialMaker(
    'vec4 csMMEffect(vec2 uv){return vec4(1.);}',
  ).functions[0].toUpperCase();
  const service = createMaterialMaker(options);
  await service.invoke('material-maker-inspect', { id: 'job' });
  service.close();
  createMaterialMaker({
    ...options,
    // @ts-expect-error Image processors must return the resized image payload.
    processImage: async () => ({ image: 123 }),
  });
}
void contracts;
