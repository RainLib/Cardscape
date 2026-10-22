import type { CardDocument } from '../../shared/document';
import type {
  MeshRepairRequest,
  MeshRepairResponse,
} from '../../shared/mesh-repair';
import type {
  CharacterPanelBindings,
  WeightViewPort,
} from '../../shared/character-panels';
import type { CharacterPanelElements } from '../../shared/character-elements';
function viewContracts(
  doc: CardDocument,
  reply: MeshRepairResponse,
  bindings: CharacterPanelBindings,
  view: WeightViewPort,
  controls: CharacterPanelElements,
) {
  if (reply.type === 'result' && reply.mode === 'auto') {
    const changed: boolean = reply.result.changed;
    if (reply.result.changed) {
      const document = reply.result.recovery;
      void document;
    } else {
      // @ts-expect-error No-op repair results have no recovery mesh.
      reply.result.recovery.layers;
    }
    void changed;
  }
  if (reply.type === 'progress') {
    // @ts-expect-error Progress messages carry no completed document.
    reply.result.document;
  }
  // @ts-expect-error Unknown worker operation modes are rejected.
  const invalid: MeshRepairRequest = { mode: 'repair' };
  const callback: NonNullable<MeshRepairRequest['options']> = {
    // @ts-expect-error Callback functions cannot cross a structured-clone worker boundary.
    onProgress() {},
  };
  void callback;
  // @ts-expect-error Vertex selections contain numeric indices.
  view.selection().add('4');
  const locks = view.bind(
    bindings.cardEditorHost.state(),
    doc,
    undefined,
    undefined,
  ).locked;
  // @ts-expect-error Bone locks contain IDs, not vertex indices.
  locks.add(4);
  // @ts-expect-error Workflow checkboxes expose booleans.
  controls['character-all-influences'].checked = 'true';
  const playing: boolean = bindings.atelierAnimation.isPlaying();
  bindings.atelierCharacterWorkspace?.open('weights');
  void invalid;
  void playing;
}
void viewContracts;
