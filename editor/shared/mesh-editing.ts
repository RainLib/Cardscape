import type { SkinMesh, CharacterDocument, DeformFrame } from './character';
import type { Point2 } from './geometry';
import type { CardDocument } from './document';
export type EditableMesh = Omit<SkinMesh, 'layerId'> & { layerId?: string };
export type MeshDocument = Pick<
  CardDocument,
  'layers' | 'characterRig' | 'actions' | 'slots'
>;
export type MeshRegion =
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'box'; x: number; y: number; width: number; height: number };
export type MeshAcceptance = (
  mesh: EditableMesh,
  index?: number | null,
  document?: MeshDocument,
) => boolean;
export interface MeshFillOptions {
  document?: MeshDocument;
  spacing?: number;
  features?: Point2[];
  maxVertices?: number;
  region?: MeshRegion | null;
  accept?: MeshAcceptance | null;
}
export interface MeshQuality extends MeshAcceptance {
  rejected: number;
  issue: string;
}
export interface MeshOutlineOptions
  extends Pick<MeshFillOptions, 'spacing' | 'maxVertices' | 'features'> {
  boneId?: string;
}
export interface TopologyMesh {
  vertices: number[];
  triangles: number[];
  topology?: SkinMesh['topology'];
}
export interface GeneratedTopology extends TopologyMesh {
  uv: number[];
}
export interface MeshEditOptions {
  document?: Pick<CharacterDocument, 'actions'>;
}
export interface GenerateOptions {
  spacing?: number;
  cell?: number;
  features?: Point2[];
  maxVertices?: number;
}
export interface BarycentricLocation {
  ids: number[];
  values: number[];
  j?: number;
}
export interface DeformTrackReference {
  boneId: string;
  frame: DeformFrame;
}
