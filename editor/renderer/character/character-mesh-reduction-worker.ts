import type {
  MeshReductionRequest,
  MeshReductionResponse,
} from '../../shared/mesh-reduction';

// The worker owns a disposable copy. UI rechecks the captured revision before committing.
const scope = self as unknown as {
  window: unknown;
  onmessage: (event: MessageEvent<MeshReductionRequest>) => void;
  postMessage(response: MeshReductionResponse): void;
  CardCharacterAnimation: typeof import('./character-animation-model').default;
  CardCharacterMeshReduction: typeof import('./character-mesh-reduction').default;
};
scope.window = scope;
importScripts(
  'character-ik-model.js',
  'character-deform-model.js',
  'character-advanced-model.js',
  'character-animation-model.js',
  'character-weight-tools.js',
  'character-mesh-tools.js',
  'character-mesh-reduction.js',
);
scope.onmessage = ({ data }) => {
  try {
    const doc = data.document,
      meshes = data.ids.map((id) => {
        const mesh = doc.characterRig?.meshes?.find((m) => m.layerId === id);
        if (!mesh) throw Error('当前图片没有蒙皮网格');
        return mesh;
      });
    let last = 0;
    const report = scope.CardCharacterMeshReduction.simplify(doc, meshes, {
      ...data.options,
      onProgress(progress) {
        if (progress.removed - last >= 4) {
          last = progress.removed;
          scope.postMessage({ progress });
        }
      },
    });
    scope.CardCharacterAnimation.validate(doc);
    scope.postMessage({
      report,
      meshes,
      deforms: (doc.actions || []).map((a) => a.deformTracks),
    });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
