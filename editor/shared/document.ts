import type { CharacterRig, CharacterAction } from './character';
import type { LayerNode } from './layer-tree';
export type LayerKind =
  | 'image'
  | 'foreground'
  | 'background'
  | 'text'
  | 'frame';
export interface SourceWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  italic: boolean;
  color: string;
  stroke: string;
  strokeWidth: number;
  align: 'left' | 'center' | 'right';
}
export type PartialTextStyle = Partial<TextStyle>;
export interface SweepSettings {
  enabled: boolean;
  strength: number;
  duration: number;
  period: number;
  width: number;
  color: string;
}
export interface TitleVariant {
  locale: string;
  text: string;
  src?: string;
  style?: Partial<TextStyle>;
  asset?: string;
  rasterAsset?: string;
}
export interface TitleArtwork {
  variants: TitleVariant[];
  sweep?: Partial<SweepSettings>;
}
export interface EmbeddedFont {
  name: string;
  family: string;
  src: string;
}
export interface CardLayer {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  src?: string;
  master?: string;
  sourceWindow?: SourceWindow;
  splitSourceId?: string;
  previewReference?: boolean;
  slotId?: string;
  role?: string;
  text?: string;
  textStyle?: Partial<TextStyle>;
  visible?: boolean;
  locked?: boolean;
  rotation?: number;
  spatial?: Record<string, unknown>;
  pivot?: { u: number; v: number; [extension: string]: unknown };
  motionAnchor?: unknown;
  attachment?: unknown;
  adjustments?: Record<string, unknown>;
  titleArt?: TitleArtwork;
  [extension: string]: unknown;
}

export interface CardSlot extends Record<string, unknown> {
  id: string;
  u: number;
  v: number;
  name?: string;
  scale?: number;
  rotation?: number;
  z?: number;
  clip?: boolean;
  effect?: string;
  strength?: number;
  speed?: number;
}

/** Common editing contract; plugin-specific fields retain explicit extension points. */
export interface CardDocument {
  schema: 'card-atelier/1';
  id?: string;
  name: string;
  locale?: string;
  fonts?: EmbeddedFont[];
  width: number;
  height: number;
  layers: CardLayer[];
  masks: Record<string, string>;
  back?: string;
  backScene?: { src?: string; [key: string]: unknown };
  effects: Record<string, unknown>;
  characterRig?: CharacterRig;
  cosmetics?: Record<string, unknown>;
  material?: Record<string, unknown>;
  particles?: unknown;
  emissionRegions?: unknown;
  spatial?: Record<string, unknown>;
  backAdjustments?: Record<string, unknown>;
  layerTree?: LayerNode[];
  composition?: Record<string, unknown>;
  armor?: Record<string, unknown>;
  frameStyle?: Record<string, unknown>;
  frameStyles?: Array<Record<string, unknown>>;
  meshGuides?: unknown[];
  deformation?: Record<string, unknown>;
  actions?: CharacterAction[];
  slots?: CardSlot[];
  shader?: Record<string, unknown>;
  [extension: string]: unknown;
}
