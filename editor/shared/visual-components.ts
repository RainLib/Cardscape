import type { CardDocument, CardLayer, SourceWindow } from './document';
import type { CharacterPlacement } from './character';
import type { FrameStyle } from './render-models';
export interface Adjustments extends Record<string, unknown> {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  gamma?: number;
}
export interface SceneMetadata extends Record<string, unknown> {
  document?: Partial<CardDocument>;
  layerRasters?: Record<string, string>;
  titleRasters?: Record<string, Record<string, string>>;
}
export interface Material extends SceneMetadata {
  schema: string;
  enabled: boolean;
  style: string;
  target: string;
  strength: number;
  speed: number;
  frequency: number;
  color: string;
  accent: string;
  backgroundMode: string;
}
export interface Reveal {
  enabled: boolean;
  duration: number;
  count: number;
  size: number;
  travel: number;
  stretch: number;
  visual: string;
  only: boolean;
  profile: string;
  stagger: number;
}
export interface EmissionGeometry extends Record<string, unknown> {
  shape: string;
  u: number;
  v: number;
  width: number;
  height: number;
  direction: string;
  angle: number;
  layerId: string;
}
export interface Emitter extends EmissionGeometry {
  target: string;
  regionId: string;
  side: string;
}
export interface EmissionRegion extends EmissionGeometry {
  id: string;
  name: string;
}
export interface ParticleSettings extends SceneMetadata {
  schema: string;
  enabled: boolean;
  count: number;
  lifetime: number;
  speed: number;
  spread: number;
  size: number;
  color: string;
  seed: number;
  z: number;
  visual: string;
  palette: string;
  stretch: number;
  blend: string;
  sprite: string;
  spriteTint: boolean;
  trajectory: string;
  radius: number;
  opacity: number;
  placement: string;
  preset?: string;
}
export interface Particles extends ParticleSettings {
  reveal: Reveal;
  emitter?: Emitter;
}
export type ParticleInput = Partial<ParticleSettings> & {
  reveal?: Partial<Reveal>;
  emitter?: Partial<Emitter>;
};
export interface ParticlePlacement extends CharacterPlacement {
  rotation: number;
  z: number;
  registration: number;
}
export type ComponentSource = Partial<
  Pick<
    CardDocument,
    | 'id'
    | 'name'
    | 'assetKind'
    | 'backScene'
    | 'componentScenes'
    | 'slots'
    | 'spatial'
    | 'emissionRegions'
    | 'frameStyle'
    | 'material'
    | 'particles'
  >
> & {
  schema?: string;
  src?: string;
  layers?: Array<Partial<CardLayer> & { id: string }>;
};
export interface ResolvedEmitter {
  ok: true;
  reason?: never;
  geometry: Emitter;
  document: ComponentSource;
  layer: (Partial<CardLayer> & { id: string }) | null | undefined;
  reverse: boolean;
  target: string;
  frameDepth: number;
  placement?: ParticlePlacement;
}
export type EmitterResult =
  | ResolvedEmitter
  | {
      ok: false;
      reason: string;
      geometry?: never;
      target?: never;
      reverse?: never;
    };
export interface NumericOutput {
  readonly length: number;
  [index: number]: number;
}
export interface VisualOutput extends NumericOutput {
  fill(value: number, start?: number, end?: number): unknown;
}
export type HaloPath =
  | { ellipse: true; hx: number; hy: number; length: number }
  | {
      ellipse?: false;
      segments: Array<{
        x: number;
        y: number;
        dx: number;
        dy: number;
        size: number;
        start: number;
      }>;
      length: number;
    };
export interface BackLayer extends Record<string, unknown> {
  id: string;
  name: string;
  src: string;
  depth: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  visible?: boolean;
  blend: string;
}
export interface ImageResource extends SceneMetadata {
  src: string;
  style?: string;
  adjustments?: Adjustments;
  sourceWindow?: SourceWindow;
  schema?: string;
  parallax?: number;
  layers?: BackLayer[];
  material?: Partial<Material>;
}
export interface BackAsset extends ImageResource {
  schema: string;
  parallax: number;
  layers: BackLayer[];
  material: Material;
}
export interface FrameResource extends SceneMetadata {
  schema: string;
  style: Partial<FrameStyle>;
}
export interface EffectResource extends SceneMetadata {
  fragmentPrelude?: string;
  fragmentBody: string;
  fragmentMask: string;
  fragmentStrength: number;
  targetKind: string;
  effects: { cape: boolean; flow: boolean; background: number };
  materialMaker?: MaterialMaker;
}
export interface MaterialMaker extends Record<string, unknown> {
  layerId?: string;
}
export interface Cosmetics extends Record<string, unknown> {
  schema: string;
  level: string;
  finish: string;
  flare: string;
  border: string;
  quality: string;
}
export interface CosmeticPreview {
  level: string;
  parallax: boolean;
  motion: boolean;
  title: boolean;
  border: boolean;
}
export interface CardEffects extends Record<string, unknown> {
  paused?: boolean;
  flowSpeed?: number;
  cape?: boolean;
  flow?: boolean;
  background?: number;
  depth?: number;
}
export interface ShaderSettings extends Record<string, unknown> {
  editorMode?: string;
  fragmentPrelude?: string;
  fragmentBody?: string;
  fragmentMask?: string;
  fragmentStrength?: number;
  fragmentTarget?: string;
  geometryBody?: string;
  materialMaker?: MaterialMaker;
}
