import type { CardDocument, SourceWindow } from './document';
import type {
  ResourceKind,
  ResourceBinding,
  WorkshopDocument,
} from './projects';
import type {
  SceneMetadata,
  ImageResource,
  BackAsset,
  FrameResource,
  Material,
  Particles,
  EffectResource,
  Adjustments,
} from './visual-components';
export type LegacyResourceKind = ResourceKind | 'background';
export interface ResourceValues {
  base: ImageResource;
  background: ImageResource;
  back: ImageResource | BackAsset;
  frame: FrameResource;
  material: Material;
  particles: Particles;
  effect: EffectResource;
}
/** Stored payloads are interpreted using their owning resource kind after graph validation. */
export interface WorkshopValue extends SceneMetadata {
  schema?: string;
  src?: string;
  style?: FrameResource['style'] | string;
  material?: Partial<Material>;
  layers?: BackAsset['layers'];
  parallax?: number;
  adjustments?: Adjustments;
  sourceWindow?: SourceWindow;
  enabled?: boolean;
  fragmentPrelude?: string;
  fragmentBody?: string;
  fragmentMask?: string;
  fragmentStrength?: number;
  targetKind?: string;
  effects?: EffectResource['effects'];
  materialMaker?: EffectResource['materialMaker'];
}
export interface AssetDraft {
  returnView?: unknown;
  key: string;
  kind: LegacyResourceKind;
  document: CardDocument;
  resourceId?: string;
  version?: number;
  baseVersion?: number;
  name?: string;
}
export interface BackgroundArchive {
  resources: import('./projects').WorkshopResource[];
  drafts?: Record<string, AssetDraft>;
  editing?: AssetDraft;
  previewDefault?: ResourceBinding;
}
export type PreviewChoices = Partial<
  Record<ResourceKind, 'default' | 'authored' | ResourceBinding>
>;
export type WorkshopValidator = (value: unknown) => unknown;
export interface PublishResource {
  kind: ResourceKind;
  name?: string;
  value: WorkshopValue;
  id: string;
  resourceId?: string;
}
export interface StartAsset {
  resourceId?: string;
  version?: number;
  blank?: CardDocument;
  name?: string;
  kind?: ResourceKind;
  value?: WorkshopValue | null;
}
export interface AssetOutput {
  front: string;
  layerRasters: Record<string, string>;
  titleRasters?: Record<string, Record<string, string>>;
}
export interface DropState {
  busy?: boolean;
  workshop: WorkshopDocument | null | undefined;
  document: CardDocument | null | undefined;
  documentToken: string;
  revision: number;
}
export interface CapturedResource {
  projectId: string;
  documentToken: string;
  revision: number;
  resourceId: string;
  version: number;
  kind: LegacyResourceKind;
  name: string;
}
