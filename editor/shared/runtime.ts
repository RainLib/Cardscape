import type { CardDocument } from './document';
import type { CharacterAction } from './character';
export interface RuntimeTrackSpec {
  name: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}
export type RuntimeTrack =
  | 'motion'
  | 'emission'
  | 'bend'
  | 'yaw'
  | 'pitch'
  | 'x'
  | 'y'
  | 'z'
  | 'scale'
  | 'opacity';
export interface RuntimeSample {
  id: string;
  event: string | undefined;
  progress: number;
  done: boolean;
  motion: number;
  emission: number;
  bend: number;
  rotation: number;
  pitch: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
}
export interface RuntimeAdjustments {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  gamma?: number;
}
/** Runtime helpers also accept small, unsaved fixtures; full project validation is separate. */
export type RuntimeDocument = Pick<CardDocument, 'layers'> &
  Partial<
    Pick<
      CardDocument,
      | 'locale'
      | 'composition'
      | 'armor'
      | 'deformation'
      | 'actions'
      | 'slots'
      | 'shader'
      | 'effects'
      | 'backScene'
      | 'cosmetics'
      | 'characterRig'
    >
  > & {
    previewMode?: string;
    foregroundMesh?: unknown;
    exportSettings?: unknown;
  };
export interface RuntimeValidators {
  back(value: unknown): void;
  cosmetics(value: unknown): void;
  spatial(document: RuntimeDocument): void;
  frame(document: RuntimeDocument): void;
  stats(document: RuntimeDocument): void;
  components(document: RuntimeDocument): void;
  attachment(value: unknown): void;
  graph(value: unknown, stage: string): void;
}
export interface AnimationFeedback {
  scope: 'whole' | 'region';
  name: string;
  layerId?: string;
  maskId?: string;
  track: string;
  sample: RuntimeSample & { yaw: number };
  draft: boolean;
  locate: boolean;
}
export interface PreviewFrame {
  id: string;
  seconds: number;
  paused: boolean;
  duration: number;
  activeAction: boolean;
  effectSeconds?: number;
}
export type RuntimeActions = { actions?: CharacterAction[] };

export interface RuntimeShader extends Record<string, unknown> {
  editorMode: string;
  geometryBody: string;
  fragmentPrelude: string;
  fragmentBody: string;
  fragmentTarget: string;
  fragmentMask: string;
  fragmentStrength: number;
}
