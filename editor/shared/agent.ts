import type { ChildProcess } from 'node:child_process';
import type { AgentConfiguration } from '../electron/agent-options';
import type { Question } from '../electron/agent-questions';
import type {
  CardDocument,
  CardSlot,
  PartialTextStyle,
  SweepSettings,
  SourceWindow,
} from './document';
import type { CharacterAction } from './character';
import type {
  Anatomy,
  LayerAttachment,
  FrameStyle,
  StatsConfig,
  LayerSpatial,
} from './render-models';
import type {
  Material,
  ParticleInput,
  Cosmetics,
  EmissionRegion,
  ShaderSettings,
} from './visual-components';
import type { NativeResults } from './native-protocol';
import type { PreparedAuthoring, AgentContextExtras } from './editor-services';

export interface EditorBinding {
  documentToken: string;
  revision: number;
  viewKey: string;
}
export interface ChatContext extends AgentContextExtras {
  binding?: EditorBinding;
  layer?: { id?: string; name?: string; kind?: string; [key: string]: unknown };
  [key: string]: unknown;
}
type Layer = { layerId: string };
type Region = {
  polygon?: number[][];
  selectionMask?: string;
  feather?: number;
};
type Selection = Region & {
  points?: number[][];
  labels?: number[];
  box?: number[];
  engine?: string;
};
interface Commands {
  characterPart: Layer & Pick<Anatomy, 'part'> & Partial<Pick<Anatomy, 'side'>>;
  pivot: Layer & { u?: number; v?: number; rotation?: number };
  motionAnchor: Layer & { root: [number, number]; tip: [number, number] };
  attachment: Layer &
    Pick<
      LayerAttachment,
      'maxOffset' | 'blendWidth' | 'anchor' | 'motion' | 'mode'
    >;
  repairSplitEdges: Layer & { radius?: number };
  repairRegion: Layer & Region;
  repairLayer: Layer & Region & { jobId: string; protectRigid?: boolean };
  splitLayer: Layer &
    Region & {
      newLayerId: string;
      name: string;
      role: string;
      z?: number;
      part?: string;
      side?: string;
    };
  spatial: Layer & { role: string; z?: number; clip?: boolean };
  camera: { distance: number };
  composition: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
  emissionRegion: Partial<EmissionRegion> & { id: string; remove?: boolean };
  cosmetics: Partial<
    Pick<Cosmetics, 'level' | 'finish' | 'flare' | 'quality' | 'border'>
  >;
  particleSprite: { jobId: string; reuse?: boolean; tint?: boolean };
  material: Partial<
    Pick<
      Material,
      | 'enabled'
      | 'style'
      | 'target'
      | 'strength'
      | 'speed'
      | 'frequency'
      | 'color'
      | 'accent'
      | 'backgroundMode'
    >
  >;
  particles: ParticleInput;
  armor: Partial<SweepSettings>;
  locale: { code: string };
  titleVariant: Layer & {
    locale: string;
    text: string;
    style?: PartialTextStyle;
    jobId?: string;
    reuse?: boolean;
  };
  titleSweep: Layer & Partial<SweepSettings>;
  frame: Partial<
    Pick<
      FrameStyle,
      | 'width'
      | 'corner'
      | 'depth'
      | 'bevel'
      | 'color'
      | 'accent'
      | 'finish'
      | 'animation'
      | 'animationSpeed'
    >
  >;
  cardStats: Partial<StatsConfig>;
  asset: {
    jobId: string;
    kind: 'foreground' | 'background' | 'image' | 'back';
    layerId?: string;
    name?: string;
    reuse?: boolean;
  };
  cutout: Layer & { model?: string };
  mask: Layer &
    Selection & {
      name: string;
      gradient?: string;
      mode?: string;
      value?: number;
      protectRigid?: boolean;
      startValue?: number;
      start?: number[];
      end?: number[];
    };
  refineMask: { name: string; operation: string; radius?: number };
  createText: Layer & {
    name: string;
    text: string;
    x: number;
    y: number;
    style?: PartialTextStyle;
  };
  textStyle: Layer & { style: PartialTextStyle };
  adjust: Layer & {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    gamma?: number;
  };
  shader: Pick<
    ShaderSettings,
    | 'geometryBody'
    | 'fragmentPrelude'
    | 'fragmentBody'
    | 'fragmentTarget'
    | 'fragmentMask'
    | 'fragmentStrength'
  >;
  actionSettings: Partial<CharacterAction> & { actionId: string };
  entry: { direction: string; actionId: string };
  slot: { slot: CardSlot; layerId?: string };
  imageTask: Layer &
    Selection & {
      mode: string;
      prompt: string;
      width?: number;
      height?: number;
      padding?: number[];
    };
  recoverImage: { jobId: string; threshold?: number };
  shared: { kind: string; resourceId: string; version: number };
  publish: { kind: string; name: string; resourceId?: string };
  workshop: { action: string; name?: string; cardId?: string };
  group: { layerIds: string[]; name?: string; groupId?: string };
  ungroup: { groupId: string };
  moveNode: { nodeIds: string[]; targetId: string; position: string };
  renameGroup: { groupId: string; name: string };
  lock: Layer & { locked: boolean };
  select: Layer;
  move: Layer & { dx: number; dy: number };
  transform: Layer & {
    x?: number;
    y?: number;
    scale?: number;
    opacity?: number;
  };
  visibility: Layer & { visible: boolean };
  reorder: Layer & { index: number };
  rename: Layer & { name: string };
  text: Layer & { text: string };
  effect: { name: string; value: number | boolean };
  deformation: { name: string; value: number };
  view: { mode: string };
  pose: { yaw: number; pitch: number };
  time: { seconds: number; paused: boolean };
  action: { actionId: string };
}
export type EditorCommand = {
  [K in keyof Commands]: { op: K } & Commands[K];
}[keyof Commands];
export interface EditorCommandAPI {
  description: string;
  validate(commands: unknown): asserts commands is EditorCommand[];
  isAuthoring(command: EditorCommand): boolean;
  parseReply(text: string): { text: string; commands?: EditorCommand[] };
  plan(
    document: CardDocument,
    commands: EditorCommand[],
    selected: string,
  ): Pick<PreparedAuthoring, 'document' | 'selected' | 'preview'>;
}
export type ChatState =
  | 'idle'
  | 'running'
  | 'failed'
  | 'canceled'
  | 'interrupted';
export interface QuestionAnswer {
  messageId: string;
  answers: Record<string, string>;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  state?: Exclude<ChatState, 'idle'> | 'complete';
  adapter?: string;
  model?: string;
  reasoning?: string;
  agentName?: string;
  context?: ChatContext | null;
  imageAttached?: boolean;
  compositionAttached?: boolean;
  invocation?: {
    executable: string | null;
    version: string | null;
    model?: string;
    reasoning?: string;
    checkedAt?: string;
  };
  skill?: { name: string; entry: string; sha256: string } | null;
  commands?: EditorCommand[];
  commandBinding?: EditorBinding;
  commandResult?: {
    state: 'applied' | 'failed' | 'stale';
    message: string;
    at?: string;
  };
  questions?: Question[];
  questionBinding?: EditorBinding | null;
  questionWorkflow?: AgentContextExtras['productionWorkflow'] | null;
  questionResult?: QuestionAnswer & { at: string };
  questionAnswer?: QuestionAnswer;
  productionDraft?: { reply: string; binding?: EditorBinding };
  diagnostic?: { kind: string; message: string; detail?: string };
}
export interface ChatSession {
  id: string;
  title: string;
  archived: boolean;
  state: ChatState;
  adapter: string;
  model: string;
  reasoning: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  activity?: string;
  usage?: unknown;
}
export type ChatSummary = Omit<ChatSession, 'messages'> & {
  messages?: undefined;
  messageCount: number;
};
export interface ActiveChat extends ChatSession {
  writes?: Promise<void>;
  child?: ChildProcess | null;
  activeTurn?: string;
}
export interface ChatTools {
  runtimeDir: string;
  configuration(): Promise<AgentConfiguration>;
  executable(file: string): Promise<string | null>;
  terminate(child?: ChildProcess | null): void;
  redact(text: string): string;
  write(file: string, data: string): Promise<void>;
  bytes(input: unknown): Buffer;
  requireReady(
    config: AgentConfiguration,
    adapter: string,
  ): Promise<{
    executable?: string | null;
    version?: string | null;
    checkedAt: string;
  }>;
}
export interface ReadyAsset {
  documentToken: string;
  revision: number;
  layerId: string;
  mode: string;
  layerName?: string;
  width: number;
  height: number;
  sourceWindow?: SourceWindow;
  padding: number[];
}
export interface AuthoringTools {
  validate(document: unknown): CardDocument;
  process<K extends keyof AuthoringResults>(
    method: K,
    args: Record<string, unknown>,
  ): Promise<AuthoringResults[K]>;
  asset(id: string): Promise<{ job: ReadyAsset; image: string }>;
}
export interface AuthoringRequest {
  document: unknown;
  commands: unknown;
  documentToken: string;
  selected?: string;
}

export interface AuthoringResults extends NativeResults {
  remove_background: { image: string; mask: string; engine: string };
  smart_selection: { image: string; engine: string; algorithm?: string };
}
export interface ChatArguments {
  id?: string;
  adapter?: string;
  model?: string;
  reasoning?: string;
  inheritDefaults?: boolean;
  archived?: boolean;
  text?: string;
  title?: string;
  messageId?: string;
  state?: string;
  message?: string;
  context?: ChatContext | null;
  source?: string | null;
  composition?: string | null;
  characterMaster?: string | null;
  maskImages?: Record<string, unknown>;
  questionAnswer?: unknown;
}
