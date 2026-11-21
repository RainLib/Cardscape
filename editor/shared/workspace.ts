import type { CardDocument, CardLayer, CardSlot } from './document';
import type { CharacterAction } from './character';
import type { ShaderSettings } from './visual-components';
import type { PreviewAPI, ShaderEditors } from './preview';
import type { CharacterAnimationPort } from './character-panels';
export type WorkspaceDocument = CardDocument & {
  actions: CharacterAction[];
  slots: CardSlot[];
  shader: ShaderSettings;
  deformation: { bend?: number; wind?: number; speed?: number };
  armor: { enabled?: boolean };
};
export interface WorkspaceState {
  document: CardDocument | null;
  layer?: CardLayer;
  busy: boolean;
  tool: string;
  target: string;
  documentToken: string;
  revision: number;
  selection: boolean;
  brushValue?: number;
  white: boolean;
  maskDisplayMode: string;
  showMask: boolean;
}
export interface WorkspaceHost {
  state(): WorkspaceState;
  mutate(
    label: string,
    edit: (document: WorkspaceDocument, layer: CardLayer) => void,
  ): boolean;
  fit(): void;
  activateRuntime(): void;
  say(message: string): void;
  selectLayer(id: string): boolean;
  chooseMask(channel: string, tool?: string): void;
  clearSubjectMask(): void;
  applySelectionToMask(): Promise<void>;
  spaceMask(channel: string): { canvas: HTMLCanvasElement } | undefined;
  setMaskBrush(white: boolean): void;
  setMaskDisplay(mode: string): void;
  setRegionMode(mode: string, channel?: string): void;
  unlockMaskLayer(): void;
  replaceImage(): unknown;
  refine(operation: string, radius: number): unknown;
  compile(shader: ShaderSettings): void;
}
interface RefreshPort {
  refresh(state: WorkspaceState): void;
}
export interface WorkspaceBindings {
  cardEditorHost: WorkspaceHost;
  cardPreview: PreviewAPI;
  atelierAgentDock?: {
    state(): { open: boolean; collapsed: boolean };
    open(): void;
  };
  atelierAnimation: Omit<CharacterAnimationPort, 'refresh'> & {
    refresh(state: WorkspaceState, actionId?: string, changed?: boolean): void;
  };
  atelierEditorUI?: RefreshPort;
  atelierSpace?: RefreshPort;
  atelierFrame?: RefreshPort;
  atelierAppearance?: RefreshPort;
  atelierPreviewPlayer?: RefreshPort;
  atelierCharacterWorkspace?: { refresh(): void };
  atelierCharacterWorkflow?: { refresh(): void };
  atelierShaderEditors: ShaderEditors;
  atelierShaderNodes?: RefreshPort & {
    mode(): string;
    apply(): void;
    reset(): void;
  };
  atelierWorkspace: {
    refresh(state: WorkspaceState): void;
    tool(name: string): void;
    panel(name: string, showTimeline?: boolean): void;
    view(name: string, fit?: boolean): void;
    syncLayout(): void;
    ensurePreview(): void;
    enableEffectsPreview(): void;
    selectAction(id: string): void;
  };
}
