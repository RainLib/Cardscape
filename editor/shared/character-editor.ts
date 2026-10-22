import type { CardDocument, CardLayer } from './document';
import type { CharacterPose, IKConstraint } from './character';
import type { WeightRepairResult } from './weight-audit';
export interface CharacterPanelState {
  document: CardDocument | null;
  layer?: CardLayer;
  revision: number;
  documentToken: string;
  busy: unknown;
}
export interface CharacterPanelHost {
  state(): CharacterPanelState;
  mutate(
    label: string,
    edit: (document: CardDocument, layer?: CardLayer) => void,
  ): boolean;
  refreshPreview(): void;
}
export interface CharacterAdvancedPort {
  refresh(): void;
  pose(): CharacterPose | null;
}
export interface CharacterWeightPort extends CharacterAdvancedPort {
  weightLocks(): string[];
  applyWeightRepair(
    captured: CharacterPanelState,
    result: WeightRepairResult,
    locks: readonly string[],
  ): boolean;
  openWeightComparison(): void;
  selectVertex(index: number): void;
}
export interface WeightWorkspacePort {
  selectAction(id: string): void;
}
export interface WeightAnimationPort {
  seek(seconds: number): void;
}
export interface WeightAuditBindings {
  cardEditorHost: CharacterPanelHost;
  atelierCharacterAdvanced: CharacterWeightPort;
  atelierWorkspace: WeightWorkspacePort;
  atelierAnimation: WeightAnimationPort;
}
export type IKEdit = Required<
  Pick<
    IKConstraint,
    'solver' | 'enabled' | 'order' | 'iterations' | 'tolerance' | 'limits'
  >
> &
  Pick<IKConstraint, 'targetBoneId'>;
export interface IKPanelAPI {
  refresh(constraint?: IKConstraint | null, state?: CharacterPanelState): void;
  invalidate(): void;
  read(): IKEdit;
}
export interface IKPanelBindings {
  cardEditorHost: CharacterPanelHost;
  atelierCharacterAdvanced: CharacterAdvancedPort;
  atelierIKPanel?: IKPanelAPI;
}
