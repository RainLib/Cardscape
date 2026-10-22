/* Image inventory and independent render/editor-source budgets. */
import { isRecord } from './validation';
function byteInventory(
  doc: unknown,
  stripEditorSources: Set<string> | null = null,
) {
  const assets = new Map<string, number>();
  const metadata = JSON.stringify(
    doc,
    (_key: string, value: unknown): unknown => {
      if (
        stripEditorSources &&
        isRecord(value) &&
        value.schema === 'card-atelier/1' &&
        Array.isArray(value.layers)
      ) {
        return {
          ...value,
          layers: value.layers.map((layer: unknown) => {
            if (!isRecord(layer)) return layer;
            const result = { ...layer };
            const archive = (object: Record<string, unknown>, key: string) => {
              const src = object[key];
              if (typeof src === 'string' && src.startsWith('data:image/')) {
                stripEditorSources.add(src);
                delete object[key];
              }
            };
            for (const key of ['master', 'splitEdgeOriginal'])
              archive(result, key);
            if (isRecord(layer.underpaint)) {
              const underpaint = { ...layer.underpaint };
              result.underpaint = underpaint;
              for (const key of [
                'original',
                'originalMaster',
                'candidate',
                'preSplitEdges',
              ])
                archive(underpaint, key);
            }
            return result;
          }),
        };
      }
      if (typeof value !== 'string' || !value.startsWith('data:')) return value;
      if (!assets.has(value)) assets.set(value, assets.size);
      return { $asset: assets.get(value) };
    },
  );
  if (metadata === undefined)
    throw TypeError('Document must be JSON serializable');
  let bytes = Buffer.byteLength(metadata) + 2;
  for (const src of assets.keys())
    bytes += Buffer.byteLength(JSON.stringify(src)) + 1;
  return { bytes, assets };
}
export function documentBytes(doc: unknown): number {
  return byteInventory(doc).bytes;
}
export function embeddedScenes(doc: unknown): unknown[] {
  if (!isRecord(doc)) return [];
  return [
    doc.backScene,
    ...Object.values<unknown>(Object(doc.componentScenes || {})),
    ...['material', 'particles'].map((key) =>
      isRecord(doc[key]) && doc[key].document ? doc[key] : null,
    ),
  ].filter(Boolean);
}
export function ownDocument(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const own = { ...doc };
  delete own.backScene;
  delete own.componentScenes;
  if (doc.backScene) delete own.back;
  for (const kind of ['material', 'particles']) {
    const scene = doc[kind];
    if (isRecord(scene) && scene.document) {
      const value = { ...scene };
      for (const key of ['document', 'layerRasters', 'titleRasters'])
        delete value[key];
      own[kind] = value;
    }
  }
  return own;
}
export function ownDocumentBytes(doc: Record<string, unknown>): number {
  return documentBytes(ownDocument(doc));
}
export function documentBudget(doc: unknown) {
  const sources = new Set<string>(),
    render = byteInventory(doc, sources);
  return {
    renderBytes: render.bytes,
    sourceBytes: documentBytes({
      editorSources: [...sources].filter((src) => !render.assets.has(src)),
    }),
  };
}
export function ownDocumentBudget(doc: Record<string, unknown>) {
  return documentBudget(ownDocument(doc));
}
