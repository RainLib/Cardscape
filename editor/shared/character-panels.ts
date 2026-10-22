import type { AnimationFeedback } from './runtime';
import type { CardDocument, CardLayer } from './document';
import type {
  CharacterRig,
  CharacterAction,
  CharacterPose,
  SkinMesh,
} from './character';
import type {
  CharacterPanelHost,
  CharacterPanelState,
  CharacterWeightPort,
  IKPanelAPI,
} from './character-editor';
import type { DocumentValidator } from './character-import';
import type { CharacterPanelElements } from './character-elements';
import type { Point2 } from './geometry';
import type { MeshDocument } from './mesh-editing';
import type {
  MeshAuditReport,
  MeshErrorLimits,
  MeshSimplifyOptions,
} from './mesh-reduction';
import type {
  MeshRepairPlanResult,
  MeshRepairAutoResult,
  MeshRepairPlanRequest,
} from './mesh-repair';
import type { WeightRepairResult } from './weight-audit';
import type { MeshPointerOperation } from '../renderer/character/character-mesh-view';
export type EditingDocument = CardDocument & { actions: CharacterAction[] };
export type RiggedDocument = EditingDocument & { characterRig: CharacterRig };
export type CharacterDomain = 'bones' | 'mesh' | 'weights' | 'none';
export interface CharacterAnimationContext {
  action: CharacterAction | null;
  seconds: number;
}
export interface CharacterHost extends CharacterPanelHost {
  state(): CharacterPanelState & { tool: string; target: string };
  validateDocument: DocumentValidator;
  say(message: string): void;
  redraw(): void;
  fit(): void;
  selectTool(tool: string, options?: { character?: boolean }): void;
  selectLayer(id: string): boolean;
  setAnimationFeedback(value: AnimationFeedback | null): void;
  chooseMask(id: string, toolName?: string): void;
  previewAction(
    id: string,
    seconds?: number,
    paused?: boolean,
    draft?: CharacterAction | null,
  ): boolean;
  previewCharacterPose(
    id: string,
    seconds: number,
    draft: CharacterAction | null,
  ): boolean;
  spaceSource(
    id?: string,
  ): HTMLImageElement | HTMLCanvasElement | null | undefined;
  loadImage(data: string): Promise<HTMLImageElement>;
  applyCharacterImport(
    document: CardDocument,
    context: CharacterPanelState,
  ): Promise<boolean>;
}
export interface CharacterAnimationPort {
  context(): CharacterAnimationContext;
  pauseContext(): CharacterAnimationContext;
  refresh(state: CharacterPanelState, actionId?: string): void;
  selectBone(
    id: string,
    kind?: 'bone' | 'ik' | 'expression',
    open?: boolean,
    keep?: boolean,
  ): void;
  seek(seconds: number): void;
  play(): void;
  open(show?: boolean): void;
  close(): void;
  isOpen(): boolean;
  isPlaying(): boolean;
}
export interface CharacterRigPort {
  refresh(): void;
  selectBone(id: string): void;
  updateToolbar(): void;
  draftAction(context?: CharacterAnimationContext): CharacterAction | null;
  resetPose(render?: boolean): void;
  syncPose(): void;
  activate(domain: Exclude<CharacterDomain, 'none'>): void;
  deactivate(): void;
  selected(): string;
  draw(ctx: CanvasRenderingContext2D, zoom: number): void;
  background(ctx: CanvasRenderingContext2D): void;
  pointerDown(point: Point2, zoom: number): MeshPointerOperation | null;
  cursor(point: Point2, zoom: number): string;
}
export interface WeightViewPort {
  primary(): number;
  selection(): Set<number>;
  visibleIndices(): number[];
  bind(
    state: CharacterPanelState,
    document: CardDocument,
    layer: CardLayer | undefined,
    mesh: SkinMesh | undefined,
  ): { locked: Set<string>; influences: Set<string> };
  previewTest(): void;
  stopTest(): void;
  syncTest(): void;
  prepare(): {
    document: CardDocument | null;
    pose: CharacterPose | null;
    posed: boolean;
  };
  invalidate(): void;
  saveTools(): void;
  clearSelection(): void;
  selectPrimary(index: number, add?: boolean): void;
  stop(): void;
  draw(ctx: CanvasRenderingContext2D, zoom: number): void;
  foreground(ctx: CanvasRenderingContext2D, zoom: number): void;
  outline(ctx: CanvasRenderingContext2D, zoom: number): void;
  drawLayer(
    ctx: CanvasRenderingContext2D,
    document: CardDocument,
    layer: CardLayer,
    image: CanvasImageSource,
  ): boolean;
  pose(): CharacterPose | null;
  related(): Set<string>;
  hover(point: Point2): boolean;
  pointerDown(
    point: Point2,
    zoom: number,
    event: PointerEvent,
  ): MeshPointerOperation | null;
  copy(): number;
  paste(mesh: SkinMesh): void;
  clipboardReady(): boolean;
}
export interface WeightViewFactory {
  create(options: {
    host: CharacterHost;
    C: typeof import('../renderer/character/character-animation-model').default;
    T: typeof import('../renderer/character/character-weight-tools').default;
    $<K extends keyof CharacterPanelElements>(id: K): CharacterPanelElements[K];
    refresh(): void;
    mutate(label: string, edit: (doc: RiggedDocument) => void): boolean;
    checkTopology(
      doc: CardDocument,
      meshes: SkinMesh[],
      edit: () => void,
    ): MeshAuditReport;
  }): WeightViewPort;
}
export interface MeshReviewState {
  layerId?: string;
  actionId?: string | null;
  seconds?: number;
  uvs?: number[][];
  metric?: 'error' | 'motionError';
  threshold?: number;
}
export interface ReductionUIRequest {
  ids?: string[] | null;
  options?: MeshSimplifyOptions | null;
  reviewState?: MeshReviewState | null;
  reopen?: boolean;
}
type AutoResult = ReturnType<
  typeof import('../renderer/character/character-mesh-repair').default.auto
>;
export type RepairRegionRequest = {
  token: string;
  revision: number;
  document: CardDocument | null;
} & (
  | (Omit<MeshRepairPlanRequest, 'current' | 'kind'> & {
      kind: 'protect' | 'refine';
      result?: never;
    })
  | { kind: 'auto'; ids: string[]; result: AutoResult }
);
export interface MeshReviewPort {
  refresh(): void;
  clear(): void;
  open(): void;
  capture(
    before: MeshDocument,
    after: MeshDocument,
    ids: string[],
    report: MeshAuditReport,
    options?: {
      limits?: Partial<MeshErrorLimits>;
      rejected?: boolean;
      label?: string;
      reduction?: MeshSimplifyOptions;
      reviewState?: MeshReviewState | null;
      weightRepair?: WeightRepairResult;
    },
  ): void;
}
export interface MeshReviewFactory {
  create(options: {
    host: CharacterHost;
    button: HTMLButtonElement;
    selectVertex(index: number): void;
    repairRegion(
      request: RepairRegionRequest,
    ): { document: MeshDocument; changed: boolean } & (
      | Omit<MeshRepairPlanResult, 'document'>
      | Omit<MeshRepairAutoResult, 'document' | 'changed'>
    );
    reduceAgain(request: ReductionUIRequest): boolean;
  }): MeshReviewPort;
}
export interface AdvancedPanelPort extends CharacterWeightPort {
  pointerDown: WeightViewPort['pointerDown'];
  draw: WeightViewPort['draw'];
  beginFrame: WeightViewPort['prepare'];
  selectBone(id: string): void;
  stopBrush(): void;
  stopTest(): void;
  previewTest(): void;
  related(): Set<string>;
}
export interface CharacterPanelBindings {
  cardEditorHost: CharacterHost;
  atelierAnimation: CharacterAnimationPort;
  atelierWorkspace: {
    panel(name: string, timeline?: boolean): void;
    selectAction(id: string): void;
    syncLayout(): void;
    ensurePreview(): void;
    enableEffectsPreview(): void;
  };
  atelierCharacterRig: CharacterRigPort;
  atelierCharacterAdvanced: AdvancedPanelPort;
  atelierCharacterWorkspace?: {
    open(page: string): void;
    refresh(): void;
    syncDomain(domain: CharacterDomain): void;
    showDomain(domain: CharacterDomain): void;
  };
  atelierCharacterWorkflow?: { refresh(): void; activate(): void };
  atelierWeightAudit?: {
    run(layerId?: string, mode?: 'check' | 'repair'): void;
    refresh(): void;
  };
  atelierIKPanel?: IKPanelAPI;
  CardCharacterMeshView: typeof import('../renderer/character/character-mesh-view').moduleApi.CardCharacterMeshView;
  CardCharacterWeightView: WeightViewFactory;
  CardCharacterMeshReview: MeshReviewFactory;
  cardPreview: { stopAction(): void };
}
