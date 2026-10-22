// Compile-only regressions. An interface that degrades to `any` makes the
// corresponding @ts-expect-error unused and fails the strict type check.
import { NativeWorker } from '../../electron/native-client';
import { normalize, options } from '../../electron/agent-options';
import type { LayerNode } from '../../shared/layer-tree';
import type { ExportSettings } from '../../shared/export-policy';
import type { CardLayer } from '../../shared/document';
import titles from '../../renderer/editing/title-model';
import profile from '../../renderer/rendering/export-profile';

async function workerContract(worker: NativeWorker) {
  const mesh = await worker.call('mesh');
  const coordinate: number = mesh.uv[0];
  // @ts-expect-error A mesh response does not contain an image.
  const image: string = mesh.image;
  const underpaint = await worker.call('underpaint');
  const addedMask: string = underpaint.addedMask;
  // @ts-expect-error Pixel counts are numbers.
  const count: string = underpaint.filled_pixels;
  const extension = await worker.call('external-operation');
  // @ts-expect-error An extension response must be narrowed before use.
  const unverified: string = extension.image;
  return { coordinate, image, addedMask, count, unverified };
}

function layerContract(node: LayerNode, layer: CardLayer) {
  if (node.type === 'group')
    node.children.push({ type: 'layer', id: layer.id });
  else {
    // @ts-expect-error Only groups own children.
    node.children;
  }
  titles.upsert(layer, {
    locale: 'zh-CN',
    text: '标题',
    style: { align: 'center' },
  });
  titles.upsert(layer, {
    locale: 'en',
    text: 'Title',
    // @ts-expect-error Localized text uses the same alignment contract as text layers.
    style: { align: 'middle' },
  });
}

const cfg = normalize({});
const choice: string = options(cfg).model;
// @ts-expect-error Agent arguments are strings.
cfg.profiles[0].args = [123];
// @ts-expect-error Effort values use the supported literal union.
cfg.codexReasoning = 'infinite';
const settings: ExportSettings = profile.config({ preset: 'mobile-detail' });
// @ts-expect-error Presets must come from the export policy.
settings.preset = 'unknown';
// @ts-expect-error Texture detail only has small/large tiers.
profile.visible(settings, 'layer', 'medium');

void workerContract;
void layerContract;
void choice;
