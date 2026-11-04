import type { CardLayer, CardSlot, TextStyle } from './document';
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Rect4 = [number, number, number, number];
/** Registered 1024×1536 pixel contours; windows are disjoint, simple polygons. */
export interface ContourRegion {
  outline: Vec2[];
  windows: Vec2[][];
}
export interface CardContour extends ContourRegion {
  /** Additional disjoint material regions, including islands inside windows. */
  islands?: ContourRegion[];
  paths?: ContourPaths;
}
export interface ContourKnot {
  point: Vec2;
  incoming?: Vec2;
  outgoing?: Vec2;
}
export type ContourPath = ContourKnot[];
export interface ContourPaths {
  schema: 'card-contour-paths/1';
  outline: ContourPath;
  windows: ContourPath[];
  islands?: Array<{ outline: ContourPath; windows: ContourPath[] }>;
  tolerance: number;
}
export interface FrameStyle extends Record<string, unknown> {
  contour?: CardContour;
  name: string;
  shape: string;
  width: number;
  corner: number;
  depth: number;
  bevel: number;
  color: string;
  accent: string;
  finish: string;
  animation: string;
  animationSpeed: number;
}
export interface FrameMesh {
  positions: number[];
  uv: number[];
  weights: number[];
  indices: number[];
}
export interface SpatialSettings extends Record<string, unknown> {
  schema?: string;
  enabled?: boolean;
  cameraDistance?: number;
}
export interface LayerSpatial extends Record<string, unknown> {
  role?: string;
  z?: number;
  clip?: boolean;
}
export type AttachmentAnchor =
  | { edge: 'segment'; root: Vec2; tip: Vec2; pin?: never; release?: never }
  | {
      edge: 'top' | 'bottom' | 'left' | 'right';
      pin: number;
      release: number;
    }
  | { edge: 'boundary'; pin?: number; release?: number };
export interface LayerAttachment extends Record<string, unknown> {
  maxOffset?: number;
  blendWidth?: number;
  motion?: number;
  mode?: string;
  anchor?: AttachmentAnchor | null;
}
export interface Anatomy extends Record<string, unknown> {
  schema: string;
  part: string;
  side: string;
}
export interface Underpaint extends Record<string, unknown> {
  originalMaster?: string;
  filledPixels?: number;
}
export interface SpatialDocument {
  layers: CardLayer[];
  slots?: CardSlot[];
  spatial?: SpatialSettings;
}
/** Read-only geometry accepts legacy back layers without a front-card kind. */
export interface SpatialReadDocument {
  layers?: Array<Partial<CardLayer> & { id: string }>;
  slots?: CardSlot[];
  spatial?: SpatialSettings;
}
export interface SpatialSurface {
  id: string;
  name: string;
  role: string;
  part: string | null;
  side: string | null;
  parentLayerId?: string | null;
  parentId?: string | null;
  z: number | null;
  slotZ?: number;
  visible?: boolean;
  paintOrder?: number;
}
export interface OcclusionPair {
  frontId: string;
  backId: string;
  active: boolean;
  painterMatches: boolean | null;
  depthDelta: number | null;
}
export interface CharacterImageContext {
  schema: 'card-character-image/1';
  spatialEnabled: boolean;
  cameraDistance: number;
  layerId: string;
  role: string;
  part: string | null;
  side: string | null;
  parentLayerId: string | null;
  surfaces: SpatialSurface[];
  occlusionPairs?: OcclusionPair[];
}
export interface DepthIssue {
  code: string;
  layerId: string;
  parentId?: string;
  backId?: string;
}
export interface StatsConfig {
  cost?: number;
  power?: number;
  visible?: boolean;
  theme?: string;
}
export type StatsDocument = { layers: CardLayer[] };
export type StatImageLoader = (src: string) => Promise<HTMLImageElement>;
export type StatTextStyle = TextStyle & { badgeTheme?: string };
export type ShaderStage = 'fragment' | 'geometry';
export type ShaderValue = 'float' | 'vec2' | 'vec3' | 'vec4';
export interface ShaderProperties extends Record<string, unknown> {
  value?: number;
  color?: string;
  channel?: string;
}
export interface ShaderDefinition {
  name: string;
  out?: ShaderValue;
  stage?: ShaderStage;
  inputs?: [string, ShaderValue][];
  properties?: ShaderProperties;
  output?: boolean;
  expr?: (args: string[], properties: Record<string, unknown>) => string;
}
export interface ShaderNode {
  id: number;
  type: string;
  pos: Vec2;
  properties?: ShaderProperties;
  size?: Vec2;
  inputs?: Array<{ name: string; type: ShaderValue; link: number | null }>;
  outputs?: Array<{ name: string; type: ShaderValue; links: number[] }>;
}
/** Decoding checks compiler fields; unused authoring metadata stays opaque. */
export interface ValidatedShaderNode {
  id: number;
  type: string;
  pos: Vec2;
  properties?: Record<string, unknown>;
  [extension: string]: unknown;
}
export type ShaderLink = [number, number, number, number, number, ShaderValue];
export interface ShaderGraph {
  schema: 'card-shader-graph/1';
  stage: ShaderStage;
  nodes: ShaderNode[];
  links: ShaderLink[];
  last_node_id?: number;
  last_link_id?: number;
  groups?: unknown[];
  config?: Record<string, unknown>;
  version?: number;
}

export interface SpacePreferences {
  mode: string;
  fullSource: boolean;
  channels: boolean;
  gap: number;
  yaw: number;
  pitch: number;
  zoom: number;
  interaction: string;
  mask: string;
}
export interface SpaceDocument extends SpatialDocument {
  effects: { depth?: number; background?: number; [key: string]: unknown };
  frameStyle?: Partial<FrameStyle>;
  foregroundMesh?: FrameMesh;
}
export interface SpaceNode {
  id: string;
  layerId: string | null;
  layer: CardLayer;
  part: string;
  z: number;
  placement: import('./character').CharacterPlacement;
  label: string;
  color: string;
  extent: Vec2;
  visible: boolean;
  locked: boolean;
}
export interface SpaceDisplayNode extends SpaceNode {
  index: number;
  displayZ: number;
  number?: number;
  sourcePlane?: Rect4;
}
export interface SpaceCamera {
  yaw: number;
  pitch: number;
  zoom: number;
  aspect: number;
  width: number;
  height: number;
  center: number;
  eye: number;
}
export interface SourceView {
  plane: Rect4;
  rect: Rect4;
  size: Vec2;
}
export interface DepthControl {
  type: 'spatial' | 'foreground' | 'frame' | 'background' | 'slot';
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step: number;
}
