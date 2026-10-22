import type { MeshDocument } from './mesh-editing';
import type { MeshAuditProgress, MeshSimplifyOptions } from './mesh-reduction';
export interface MeshRepairPlanRequest {
  source: MeshDocument;
  current: MeshDocument;
  ids: string[];
  layerId: string;
  uvs: number[][];
  kind?: 'protect' | 'refine';
  spacing?: number;
}
export interface MeshScanRequest {
  source: MeshDocument;
  current: MeshDocument;
  ids: string[];
  options?: MeshSimplifyOptions & { spacing?: number };
  onProgress?: (progress: MeshAuditProgress) => void;
}
export interface MeshRepairProgress {
  stage: 'scan' | 'refine' | 'reduce' | 'verify';
  regions?: number;
  completed?: number;
  total?: number;
  action?: string;
  removed?: number;
  remaining?: number;
  target?: number;
}
export interface MeshAutoRequest extends Omit<MeshScanRequest, 'onProgress'> {
  reference?: MeshDocument;
  onProgress?: (progress: MeshRepairProgress) => void;
}
export interface MeshChooseOptions {
  metric?: 'error' | 'motionError';
  threshold?: number;
  side?: 'before' | 'after';
  previous?: number[][];
  box?: { x: number; y: number; width: number; height: number } | null;
}

/** Structured-clone messages: callbacks never cross the worker boundary. */
type MeshRepairWorkerOptions = {
  options?: Omit<NonNullable<MeshScanRequest['options']>, 'onProgress'>;
};
export type MeshRepairRequest =
  | ({ mode: 'scan' } & Omit<MeshScanRequest, 'onProgress' | 'options'> &
      MeshRepairWorkerOptions)
  | ({ mode: 'auto' } & Omit<MeshAutoRequest, 'onProgress' | 'options'> &
      MeshRepairWorkerOptions);
export type MeshRepairAutoResult = ReturnType<
  typeof import('../renderer/character/character-mesh-repair').default.auto
>;
export type MeshRepairPlanResult = ReturnType<
  typeof import('../renderer/character/character-mesh-repair').default.plan
>;
export type MeshRepairResponse =
  | { type: 'progress'; progress: MeshRepairProgress }
  | {
      type: 'result';
      mode: 'scan';
      result: ReturnType<
        typeof import('../renderer/character/character-mesh-repair').default.scan
      >;
    }
  | { type: 'result'; mode: 'auto'; result: MeshRepairAutoResult }
  | { type: 'error'; error: string };
