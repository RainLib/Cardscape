import type {
  WorkshopValue,
  AssetDraft,
  BackgroundArchive,
  LegacyResourceKind,
} from './workshop';
import type { CardDocument } from './document';
export type ResourceKind =
  | 'base'
  | 'back'
  | 'frame'
  | 'material'
  | 'effect'
  | 'particles';
export interface ResourceBinding {
  resourceId: string;
  version: number;
}
export interface WorkshopCard {
  id: string;
  name: string;
  document: CardDocument;
  bindings: Partial<Record<LegacyResourceKind, ResourceBinding>>;
  thumbnail?: string;
}
export interface WorkshopResource {
  id: string;
  name: string;
  kind: LegacyResourceKind;
  versions: Array<{ version: number; value: WorkshopValue }>;
}
export interface WorkshopDocument {
  schema: 'card-workshop/1';
  id: string;
  name: string;
  activeCardId: string;
  cards: WorkshopCard[];
  resources: WorkshopResource[];
  editingAsset?: AssetDraft;
  assetDrafts?: Record<string, AssetDraft>;
  previewDefaults?: Partial<Record<LegacyResourceKind, ResourceBinding>>;
  backgroundArchive?: BackgroundArchive[];
  [extension: string]: unknown;
}
export type Project = CardDocument | WorkshopDocument;
export interface RecoveryState {
  view: unknown;
  revision: number;
  savedRevision: number;
  at: number;
}
export type LoadedProject = (
  | { document: CardDocument; workshop?: undefined }
  | { workshop: WorkshopDocument; document?: undefined }
) & {
  sourceFile?: string | null;
  recovery?: RecoveryState;
  recoveryError?: string;
};
export type RecoveryResult =
  | (LoadedProject & { sourceFile: string | null; recovery: RecoveryState })
  | {
      recoveryError: string;
      document?: undefined;
      workshop?: undefined;
      sourceFile?: undefined;
      recovery?: undefined;
    };
export type DocumentValidator = (value: unknown) => CardDocument;
export type AtomicWrite = (file: string, contents: string) => Promise<void>;
export interface SessionRecord {
  schema: 'card-editor-session/1';
  sourceFile: string | null;
  project: unknown;
  view: unknown;
  revision: number;
  savedRevision: number;
  at: number;
}
