import type { Weight } from './character';
import type { MeshDocument } from './mesh-editing';
import type { MeshAuditReport } from './mesh-reduction';

export interface TriangleIssue {
  seconds: number;
  layerId: string;
  triangle: number;
  vertices: number[];
  ratio: number;
}
export type MotionIssue =
  | { seconds: number; type: 'ik' | 'ik-convergence'; id: string }
  | (Omit<TriangleIssue, 'ratio'> & { type: 'triangle' | 'compression' });
export interface MotionAuditOptions {
  fps?: number;
  minAreaRatio?: number;
  collectIssues?: boolean;
}
export interface MotionAuditReport {
  actionId: string;
  name: string;
  duration: number;
  fps: number;
  samples: number;
  meshCount: number;
  flippedTriangles: number;
  compressedTriangles: number;
  minAreaRatio: number;
  maxIKError: number;
  unreachableSamples: number;
  unresolvedSamples: number;
  firstIssue: MotionIssue | null;
  issues?: TriangleIssue[];
  ok: boolean;
}
export interface CollectedMotionReport extends MotionAuditReport {
  issues: TriangleIssue[];
}
export type WeightRepairProgress =
  | { stage: 'prepare' | 'verify' }
  | { stage: 'smooth'; pass: number };
export interface WeightRepairOptions {
  locked?: readonly string[];
  onProgress?: (progress: WeightRepairProgress) => void;
}
export interface WeightRepairResult {
  changed: boolean;
  before: CollectedMotionReport[];
  after: CollectedMotionReport[];
  vertices: number[];
  region: number[];
  weights: Weight[][];
  maxWeightDelta: number;
  reason: string;
  comparison?: MeshAuditReport;
}
export interface WeightAuditRequest {
  mode: 'check' | 'repair';
  document: MeshDocument;
  layerId: string;
  locked?: readonly string[];
}
export type WeightAuditResponse =
  | { progress: WeightRepairProgress }
  | { reports: MotionAuditReport[] }
  | { result: WeightRepairResult }
  | { error: string };
