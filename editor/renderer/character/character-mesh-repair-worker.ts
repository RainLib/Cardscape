import type {
  MeshRepairRequest,
  MeshRepairResponse,
  MeshRepairProgress,
} from '../../shared/mesh-repair';
// Termination discards the disposable plan; the UI checks identity and revision before commit.
const scope = self as unknown as {
  window: unknown;
  onmessage: (event: MessageEvent<MeshRepairRequest>) => void;
  postMessage(response: MeshRepairResponse): void;
  CardCharacterMeshRepair: typeof import('./character-mesh-repair').default;
};
scope.window = scope;
importScripts(
  'character-ik-model.js',
  'character-deform-model.js',
  'character-advanced-model.js',
  'character-animation-model.js',
  'character-weight-tools.js',
  'character-mesh-tools.js',
  'character-mesh-authoring.js',
  'character-mesh-reduction.js',
  'character-mesh-repair.js',
);
scope.onmessage = ({ data }) => {
  try {
    let last = 0;
    const onProgress = (progress: MeshRepairProgress) => {
      const now = Date.now();
      if (
        !progress.completed ||
        progress.completed === progress.total ||
        now - last >= 100
      ) {
        last = now;
        scope.postMessage({ type: 'progress', progress });
      }
    };
    if (data.mode === 'scan')
      scope.postMessage({
        type: 'result',
        mode: 'scan',
        result: scope.CardCharacterMeshRepair.scan({
          ...data,
          onProgress: (p) => onProgress({ stage: 'scan', ...p }),
        }),
      });
    else if (data.mode === 'auto')
      scope.postMessage({
        type: 'result',
        mode: 'auto',
        result: scope.CardCharacterMeshRepair.auto({ ...data, onProgress }),
      });
    else throw Error('未知的动作扫描操作');
  } catch (error) {
    scope.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
