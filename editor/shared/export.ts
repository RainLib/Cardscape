import type { CardDocument, CardLayer } from './document';
import type { ExportSettings } from './export-policy';
import type {
  WorkshopDocument,
  WorkshopResource,
  DocumentValidator,
} from './projects';
import type { NativeResults, Timed } from './native-protocol';
export interface TextureAsset {
  asset: string;
  width?: number;
  height?: number;
}
export interface TextureVariants {
  large: TextureAsset;
  small: TextureAsset;
  sourceSize?: number[];
}
export interface ExportProfile {
  schema: 'card-export-profile/1';
  settings: ExportSettings;
  textures: Record<string, TextureVariants>;
}
export interface ShaderSettings extends Record<string, unknown> {
  geometryBody: string;
  fragmentBody: string;
  fragmentPrelude?: string;
}
export interface ExportLayer extends CardLayer {
  asset?: string;
  cutoutMask?: string;
  ownershipMask?: string;
  cutoutMaskAsset?: string;
  ownershipAsset?: string;
}
export interface ComponentValue extends Record<string, unknown> {
  src?: string | null;
  sprite?: string;
  document?: Partial<ExportDocument> & {
    layers: ExportLayer[];
    maskAssets?: Record<string, string>;
    foregroundGeometry?: unknown;
    shader_key?: string;
  };
  layerRasters?: Record<string, string>;
  titleRasters?: Record<string, Record<string, string>>;
  layers?: Array<{ id: string; src: string }>;
  style?: unknown;
  geometry?: unknown;
  shader_key?: string;
}
type KnownDocument = {
  [K in keyof CardDocument as string extends K ? never : K]: CardDocument[K];
};
export interface ExportDocument
  extends Omit<
    KnownDocument,
    'particles' | 'material' | 'backScene' | 'componentScenes'
  > {
  [extension: string]: unknown;
  layers: ExportLayer[];
  shader?: ShaderSettings;
  exportSettings?: ExportSettings;
  particles?: ComponentValue;
  material?: ComponentValue;
  backScene?: ComponentValue & { src?: string };
  componentScenes?: Record<string, ComponentValue>;
  previewMode?: string;
}
export interface FontDependency {
  layerId: string;
  locale: string | null;
  family: string;
  portableRaster: string | null;
  embedded: string | null;
}
export interface AssetManifest {
  contourFieldAsset?: string;
  contourFieldFormat?:
    | 'card-contour-field-rgb12/1'
    | 'card-contour-field-atlas/2';
  schema: string;
  id?: string;
  name: string;
  width: number;
  height: number;
  layers: ExportLayer[];
  masks: string[];
  maskAssets?: Record<string, string>;
  fontDependencies: FontDependency[];
  frontAsset?: string;
  backAsset?: string | null;
  backScene?: ComponentValue;
  frontVariants?: TextureVariants;
  exportProfile?: ExportProfile;
  framePreview?: { asset: string; bounds: RasterBounds; time: number };
  shaderAssets?: { vertex: string; fragment: string };
  foregroundMesh?: string | null;
  bakedAssets?: Record<string, string>;
  particles?: ComponentValue;
  material?: ComponentValue;
  componentScenes?: Record<string, ComponentValue>;
  characterRig?: CardDocument['characterRig'];
  actions?: CardDocument['actions'];
  slots?: CardDocument['slots'];
  frameStyle?: unknown;
  frameGeometry?: unknown;
  foregroundGeometry?: unknown;
  shader?: ShaderSettings;
  shader_key?: string;
  cosmetics?: unknown;
  cosmeticPreview?: unknown;
  effects?: unknown;
  spatial?: unknown;
  composition?: unknown;
  armor?: unknown;
  deformation?: unknown;
}
export interface RasterBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CardOutput {
  front: string;
  framePreview?: { src: string; bounds: RasterBounds; time: number };
  layerRasters?: Record<string, string>;
  titleRasters?: Record<string, Record<string, string>>;
  titleBounds?: Record<string, Record<string, unknown>>;
}
export interface ExportIO {
  atomicWrite(file: string, data: string | Uint8Array): Promise<void>;
  pngBytes(value: unknown): Buffer;
  validateProject: DocumentValidator;
}
export interface ImageWorker {
  call<K extends keyof NativeResults>(
    op: K,
    args?: unknown,
  ): Promise<Timed<NativeResults[K]>>;
}
export interface ExportResource extends Omit<WorkshopResource, 'versions'> {
  versions: Array<{ version: number; value: ComponentValue }>;
}
export interface GodotSnapshot {
  audioPaths?: Record<string, string>;
  data: { cards: AssetManifest[]; components: ExportResource[] };
  texturePaths: Record<string, string>;
  shaderPaths: Record<string, string>;
}
export interface ExportOptions {
  cardDirectory?: string;
}
export interface RemoteObject {
  path: string;
  mime: string;
  compression: 'gzip' | 'identity';
  bytes: number;
  downloadBytes: number;
}
export interface RemoteRecord {
  definition: string;
  base: string[];
  detail: string[];
}
export interface ExportWorkshopModel {
  resolve(workshop: WorkshopDocument, cardId: string): ExportDocument;
  clone<T>(value: T): T;
}
