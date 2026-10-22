/* Resource changes are independent of camera, animation and document revision. */
import type { CardLayer } from '../../shared/document';
interface PreviewDocument {
  id?: string;
  previewMode?: string;
  width: number;
  height: number;
  layers: CardLayer[];
  masks: Record<string, string>;
  back?: string;
  foregroundMesh?: unknown;
}
const api = (() => {
  function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
      return false;
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>,
      keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && equal(left[key], right[key]),
      )
    );
  }
  function textureKey(layer: Pick<CardLayer, 'kind' | 'id'>): string {
    return layer.kind === 'foreground'
      ? 'foreground'
      : layer.kind === 'background'
        ? 'background'
        : layer.id;
  }
  function plan(
    previous: PreviewDocument | null | undefined,
    next: PreviewDocument,
  ) {
    const old = new Map<string, CardLayer>(
        (previous?.layers || []).map((layer) => [layer.id, layer]),
      ),
      keys = new Set((next.layers || []).map(textureKey));
    return {
      compatible:
        !!previous &&
        previous.id === next.id &&
        previous.previewMode === 'authored' &&
        next.previewMode === 'authored' &&
        previous.width === next.width &&
        previous.height === next.height,
      images: (next.layers || []).filter((layer) => {
        const before = old.get(layer.id);
        return (
          layer.src &&
          (!before ||
            before.src !== layer.src ||
            textureKey(before) !== textureKey(layer) ||
            before.role !== layer.role ||
            !equal(before.sourceWindow, layer.sourceWindow))
        );
      }),
      removed: [...new Set((previous?.layers || []).map(textureKey))].filter(
        (key) => !keys.has(key),
      ),
      masks: Object.keys(next.masks || {}).filter(
        (id) => previous?.masks?.[id] !== next.masks[id],
      ),
      removedMasks: Object.keys(previous?.masks || {}).filter(
        (id) => !(id in (next.masks || {})),
      ),
      back: previous?.back !== next.back,
      geometry: !equal(previous?.foregroundMesh, next.foregroundMesh),
    };
  }
  return { equal, textureKey, plan };
})();
export default api;
