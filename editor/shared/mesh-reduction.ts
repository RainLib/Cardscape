import type { MeshDocument } from './mesh-editing';
import type { SkinMesh, CharacterAction } from './character';

export interface MeshErrorLimits {
  maxError: number;
  maxBoundaryError: number;
  maxWeightError: number;
}
export interface MeshErrorMetrics {
  maxPositionError: number;
  maxMotionError: number;
  maxBoundaryError: number;
  maxWeightError: number;
  folds: number;
}
export interface SurfaceAddress {
  vertex: number | null;
  exact: boolean;
  face: number[];
  barycentric: number[];
  outside?: boolean;
}
export interface MeshErrorSite {
  layer: string;
  layerId: string;
  action: string;
  actionId: string | null;
  seconds: number;
  error: number;
  uv: number[];
  before: SurfaceAddress;
  after: SurfaceAddress;
}
export interface MeshActionReport {
  actionId: string | null;
  name: string;
  frames: number;
  maxPositionError: number;
  maxMotionError: number;
  folds: number;
  worst: MeshErrorSite | null;
  worstMotion: MeshErrorSite | null;
}
export interface MeshAuditReport extends MeshErrorMetrics {
  rmsError: number;
  frames: number;
  probes: number;
  beforeVertices: number;
  afterVertices: number;
  beforeTriangles: number;
  afterTriangles: number;
  complete: boolean;
  worst: MeshErrorSite | null;
  worstMotion?: MeshErrorSite;
  worstVertex?: MeshErrorSite;
  worstMotionVertex?: MeshErrorSite;
  actions?: MeshActionReport[];
  regions?: { layerId: string; uvs: number[][] }[];
}
export interface MeshAuditOptions {
  steps?: number;
  allActions?: boolean;
}
export interface MeshAuditProgress {
  completed: number;
  total: number;
  action: string;
}
export interface MeshCompareOptions {
  survivors?: Map<string, readonly number[]> | null;
  stopAt?: Partial<MeshErrorLimits> | null;
  scan?: Partial<MeshErrorLimits> | null;
  onProgress?: ((progress: MeshAuditProgress) => void) | null;
}
export interface MeshSimplifyProgress {
  removed: number;
  remaining: number;
  target: number;
}
export interface MeshSimplifyOptions
  extends Partial<MeshErrorLimits>,
    MeshAuditOptions {
  ratio?: number;
  allowBoundary?: boolean;
  targetVertices?: number;
  reference?: MeshDocument;
  onProgress?: (progress: MeshSimplifyProgress) => void;
}
export interface MeshSimplifyReport extends MeshAuditReport {
  removed: number;
  rejected: number;
  target: number;
  reachedTarget: boolean;
  limits: MeshErrorLimits;
}
export interface MeshReductionRequest {
  document: MeshDocument;
  ids: string[];
  options?: Omit<MeshSimplifyOptions, 'onProgress'>;
}
export type MeshReductionResponse =
  | { progress: MeshSimplifyProgress }
  | {
      report: MeshSimplifyReport;
      meshes: SkinMesh[];
      deforms: CharacterAction['deformTracks'][];
    }
  | { error: string };
