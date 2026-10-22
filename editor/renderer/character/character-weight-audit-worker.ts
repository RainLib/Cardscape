import type {
  WeightAuditRequest,
  WeightAuditResponse,
} from '../../shared/weight-audit';

// Sampling owns a disposable, image-free document. It never edits the card.
const scope = self as unknown as {
  window: unknown;
  onmessage: (event: MessageEvent<WeightAuditRequest>) => void;
  postMessage(response: WeightAuditResponse): void;
  CardCharacterAnimation: typeof import('./character-animation-model').default;
  CardCharacterMotionAudit: typeof import('./character-motion-audit').default;
  CardCharacterMeshReduction: typeof import('./character-mesh-reduction').default;
  CardCharacterWeightRepair: typeof import('./character-weight-repair').default;
};
scope.window = scope;
importScripts(
  'character-ik-model.js',
  'character-deform-model.js',
  'character-advanced-model.js',
  'character-animation-model.js',
  'character-motion-audit.js',
  'character-weight-tools.js',
  'character-mesh-tools.js',
  'character-mesh-reduction.js',
  'character-weight-repair.js',
);
scope.onmessage = ({ data }) => {
  try {
    const source = data.document,
      mesh = source.characterRig?.meshes?.find(
        (m) => m.layerId === data.layerId,
      );
    if (!source.characterRig || !mesh) throw Error('当前图片没有蒙皮网格');
    const doc = {
      ...source,
      characterRig: { ...source.characterRig, meshes: [mesh] },
    };
    if (data.mode === 'repair') {
      const result = scope.CardCharacterWeightRepair.repair(doc, data.layerId, {
        locked: data.locked,
        onProgress: (progress) => scope.postMessage({ progress }),
      });
      if (result.changed) {
        const after = structuredClone(doc);
        after.characterRig.meshes[0].weights = result.weights;
        result.comparison = scope.CardCharacterMeshReduction.audit(
          doc,
          [mesh],
          { steps: 60, allActions: true },
        )(after, after.characterRig.meshes);
      }
      scope.postMessage({ result });
    } else {
      scope.postMessage({
        reports: (doc.actions || []).map((action) =>
          scope.CardCharacterMotionAudit.audit(doc, action),
        ),
      });
    }
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
