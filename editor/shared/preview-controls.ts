import type { CharacterPanelState } from './character-editor';
import type { CharacterAnimationPort } from './character-panels';
import type { PreviewAPI } from './preview';
export interface PreviewControlBindings {
  cardEditorHost: { state(): CharacterPanelState };
  cardPreview: Pick<
    PreviewAPI,
    | 'setZoom'
    | 'getZoom'
    | 'getView'
    | 'pose'
    | 'inspect'
    | 'stopInspection'
    | 'createCapture'
  >;
  atelierAnimation: CharacterAnimationPort;
  atelierWorkspace: { selectAction(id: string): void; ensurePreview(): void };
  atelierPreviewPlayer: {
    refresh(state?: CharacterPanelState): void;
    sync(): void;
  };
}
