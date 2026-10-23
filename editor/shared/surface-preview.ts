import type { CardDocument } from './document';
import type { CharacterAction, CharacterPose, SkinMesh } from './character';
import type {
  Material,
  ParticleInput,
  SceneMetadata,
} from './visual-components';
import type { PreviewAPI } from './preview';
import type { TextureTier } from './export-policy';
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
export type SurfaceImage =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas
  | PixelImage;
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PreviewRegion {
  mode: string;
  layerId?: string;
  maskId?: string;
  map?: SurfaceImage;
  version?: number;
}
export interface SurfaceGeometry {
  positions: number[] | Float32Array;
  uv: number[];
  indices: number[];
  weights?: number[];
}
export interface GPUMesh {
  geometry: SurfaceGeometry;
  p: WebGLBuffer;
  uv: WebGLBuffer;
  fx: WebGLBuffer;
  guard: WebGLBuffer;
  join: WebGLBuffer;
  idx: WebGLBuffer;
  lines: WebGLBuffer;
  lineCount: number;
  skinSource?: SkinMesh;
  skinPose?: CharacterPose | null;
  skinMasks?: number;
  weightData?: Float32Array;
}
export interface JoinBuffers {
  geometry: SurfaceGeometry;
  ownership?: PixelImage | null;
  coverage?: PixelImage;
  width: number;
  anchor: string;
  motion?: number;
  mode: string;
  effects?: Float32Array;
  buffer: WebGLBuffer;
  fx?: WebGLBuffer;
  guard?: WebGLBuffer;
}
export interface SharedTexture {
  image: HTMLImageElement;
  source: string;
  width: number;
  height: number;
  texture: WebGLTexture;
}
export interface PlaybackState {
  id: string;
  start: number;
  yaw: number;
  pitch: number;
  paused: boolean;
  draft: CharacterAction | null;
  completed?: boolean;
}
export interface InspectionState {
  mode?: string;
  period: number;
  yaw: number;
  pitch: number;
  paused: boolean;
}
export interface PoseTween {
  from: { yaw: number; pitch: number };
  to: { yaw: number; pitch: number };
  seconds: number;
  duration: number;
}
export interface RenderDetail {
  level: TextureTier;
  particles: boolean;
  materials: boolean;
  decorations: boolean;
}
export interface ExternalView {
  angle: number[];
  root: number[];
  visibleCards?: number;
  width?: number;
  height?: number;
  camera?: number;
  viewportZoom?: number;
  time?: number;
  particleRevealTime?: number;
  effects?: boolean;
  detail?: RenderDetail;
  cosmicFront?: boolean;
  emitterContext?: CardDocument | null;
  particleConfig?: ParticleInput | null;
}
export interface SurfaceResult {
  triangles: number;
  motion: number;
  emission: number;
  time: number;
  shader?: string;
  particles: number;
  emitterState?: string;
  particleStats: Record<string, string>;
}
export interface BackResult extends Partial<SurfaceResult> {
  count: number;
  loaded: boolean;
  error: boolean;
  triangles: number;
  instances?: number;
  updates?: number;
  pending?: boolean;
}
export interface BackOptions extends Partial<ExternalView> {
  plane?: number;
  style?: import('./render-models').FrameStyle;
  reverse?: boolean;
  aspect?: number;
  eye?: number[];
}
export interface BackRenderer {
  draw(asset: SceneMetadata, options?: BackOptions): BackResult;
  reset(): void;
  dispose(): void;
}
export interface SurfaceBindings {
  cardPreview: Partial<PreviewAPI>;
  CardBackRenderer: {
    create(
      gl: WebGLRenderingContext,
      invalidate?: () => void,
      report?: (message: string) => void,
    ): BackRenderer;
  };
  CardSurfaceRenderer: { create(options: SurfaceOptions): PreviewAPI };
}
export interface SurfaceOptions {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  legacy?: Partial<PreviewAPI>;
  old?: { hidden: boolean };
  info?: { textContent: string | null };
  embedded?: boolean;
}
export type AdapterKeys =
  | 'setPreviewLevel'
  | 'getPreviewLevel'
  | 'getCharacterGeometry'
  | 'setRenderOverrides'
  | 'setEmitterContext'
  | 'drawExternal'
  | 'dispose';
export type SurfaceBase = Omit<PreviewAPI, AdapterKeys>;
