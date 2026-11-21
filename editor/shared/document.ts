import type { ExportProfile } from './export';
import type { MeshGeometry } from './native-protocol';
import type { ExportSettings } from './export-policy';
import type {
  Adjustments,
  ImageResource,
  Material,
  ParticleInput,
  EmissionRegion,
  Cosmetics,
  CosmeticPreview,
  CardEffects,
  ShaderSettings,
  SceneMetadata,
} from './visual-components';
import type {
  LayerSpatial,
  LayerAttachment,
  Anatomy,
  Underpaint,
  SpatialSettings,
  FrameStyle,
} from './render-models';
import type { CharacterRig, CharacterAction } from './character';
import type { LayerNode } from './layer-tree';
export interface LaserLayoutFields {
  style: 'original' | 'foil' | 'fullart' | 'gallery' | 'graded';
  zoom: number;
  x: number;
  y: number;
  title: string;
  caption: string;
  gradeLabel: string;
  grade: string;
  serial: string;
  rarity: string;
}
export interface LaserLayoutState extends LaserLayoutFields {
  layerId: string;
  source: string;
  sourceMask?: string;
  previousFrame?: Partial<FrameStyle>;
  previousBorder?: Cosmetics['border'];
}
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
  badgeTheme?: string;
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
  spatial?: LayerSpatial;
  pivot?: { u: number; v: number; [extension: string]: unknown };
  motionAnchor?: unknown;
  attachment?: LayerAttachment;
  anatomy?: Anatomy;
  underpaint?: Underpaint;
  badgePreviousTextStyle?: Partial<TextStyle>;
  adjustments?: Adjustments;
  componentAdjustments?: Adjustments;
  componentStyle?: string;
  asset?: string;
  ownershipMask?: string;
  shaderChannel?: number;
  shaderTransparent?: boolean;
  blend?: string;
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
  revision?: number;
  exportSettings?: ExportSettings;
  exportProfile?: ExportProfile;
  foregroundMesh?: MeshGeometry;
  name: string;
  locale?: string;
  fonts?: EmbeddedFont[];
  width: number;
  height: number;
  layers: CardLayer[];
  masks: Record<string, string>;
  back?: string;
  backScene?: ImageResource;
  effects: CardEffects;
  characterRig?: CharacterRig;
  cosmetics?: Partial<Cosmetics>;
  cosmeticPreview?: Partial<CosmeticPreview>;
  componentScenes?: Record<string, SceneMetadata>;
  assetKind?: string;
  backStyle?: string;
  material?: Partial<Material>;
  particles?: ParticleInput;
  emissionRegions?: EmissionRegion[];
  spatial?: SpatialSettings;
  backAdjustments?: Adjustments;
  layerTree?: LayerNode[];
  composition?: Record<string, unknown>;
  armor?: Record<string, unknown>;
  frameStyle?: Partial<FrameStyle>;
  laserLayout?: LaserLayoutState;
  frameStyles?: Array<Partial<FrameStyle>>;
  meshGuides?: unknown[];
  deformation?: {
    bend?: number;
    wind?: number;
    speed?: number;
    [key: string]: unknown;
  };
  actions?: CharacterAction[];
  slots?: CardSlot[];
  shader?: ShaderSettings;
  [extension: string]: unknown;
}
