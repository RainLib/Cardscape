import type { CardDocument } from './document';
import type {
  CharacterRig,
  CharacterAction,
  Affine,
  SkinMesh,
} from './character';
export interface SpineBone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  length?: number;
  transform?: string;
  inherit?: string;
  skin?: boolean;
}
export interface SpineAttachment {
  path?: string;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  color?: string;
  sequence?: unknown;
  parent?: string;
  uvs?: number[];
  vertices?: number[];
  triangles?: number[];
}
export interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
  visible?: boolean;
  color?: string;
  dark?: string;
  blend?: string;
}
export type Attachments = Record<string, Record<string, SpineAttachment>>;
export interface SpineFrame {
  time?: number;
  x?: number;
  y?: number;
  angle?: number;
  value?: number;
  mix?: number;
  softness?: number;
  bendPositive?: boolean;
  stretch?: boolean;
  compress?: boolean;
  name?: string | null;
  offset?: number;
  vertices?: number[];
  curve?: number[] | 'stepped' | 'linear';
}
export interface SpineAnimation {
  drawOrder?: Array<{
    time?: number;
    offsets?: Array<{ slot: string; offset: number }>;
  }>;
  draworder?: Array<{
    time?: number;
    offsets?: Array<{ slot: string; offset: number }>;
  }>;
  bones?: Record<string, Record<string, SpineFrame[]>>;
  ik?: Record<string, SpineFrame[]>;
  slots?: Record<string, Record<string, SpineFrame[]>>;
  deform?: Record<string, Record<string, Record<string, SpineFrame[]>>>;
  attachments?: Record<
    string,
    Record<string, Record<string, Record<string, SpineFrame[]>>>
  >;
  [extension: string]: unknown;
}
export interface SpineIK {
  name: string;
  bones: string[];
  target: string;
  mix?: number;
  order?: number;
  softness?: number;
  stretch?: boolean;
  compress?: boolean;
  skin?: boolean;
  bendPositive?: boolean;
}
export interface SpineSource {
  skeleton: {
    spine: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  bones: SpineBone[];
  slots?: SpineSlot[];
  ik?: SpineIK[];
  transform?: unknown[];
  path?: unknown[];
  physics?: unknown[];
  skins?:
    | Record<string, Attachments>
    | Array<{ name: string; attachments?: Attachments }>;
  animations?: Record<string, SpineAnimation>;
}
export interface SpineEntry extends SpineSlot {
  sourceSlot: string;
  attachment: string;
  attachmentData?: SpineAttachment;
  attachmentSkin: string;
  setup: boolean;
}
export interface SpineOptions {
  document?: CardDocument;
  layerMap?: Record<string, string | { layerId: string; uvRect?: number[] }>;
  scale?: number;
  origin?: number[];
  skin?: string;
  loop?: boolean;
  images?: Record<string, { src: string; uvRect?: number[] }>;
}
export interface ImportPlan {
  schema: string;
  characterRig: CharacterRig;
  actions: CharacterAction[];
  newLayers: CardDocument['layers'];
  layerOrder: string[];
}
export interface FFDInfo {
  slot: string;
  attachment: string;
  skin: string;
  refs: Array<{ index: number; boneId: string; offset: number }>;
  mesh: SkinMesh;
  inv: Affine;
}
