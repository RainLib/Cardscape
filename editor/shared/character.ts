import type { CardLayer } from './document';
export type Affine = readonly number[];
export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  tip?: number[];
}
export interface Binding {
  layerId: string;
  boneId: string;
  opacity?: number;
}
export interface Weight {
  boneId: string;
  weight: number;
}
export interface Morph {
  expressionId: string;
  deltas: number[];
}
export interface SkinMesh {
  layerId: string;
  vertices: number[];
  uv: number[];
  triangles: number[];
  weights: Weight[][];
  morphs: Morph[];
  depths?: number[];
  binds?: Record<string, number[]>;
  topology?: { pins: number[]; edges: number[][] };
}
export interface IKLimit {
  boneId: string;
  min: number;
  max: number;
}
export interface IKConstraint {
  id: string;
  name: string;
  rootId: string;
  tipId: string;
  end: number[];
  target: number[];
  bend: number;
  mix: number;
  solver?: 'analytic' | 'ccd';
  enabled?: boolean;
  order?: number;
  iterations?: number;
  tolerance?: number;
  limits?: IKLimit[];
  targetBoneId?: string;
}
export interface Expression {
  id: string;
  name: string;
  value: number;
}
export interface CharacterRig {
  schema: 'card-character-rig/1';
  bones: Bone[];
  bindings: Binding[];
  constraints?: IKConstraint[];
  meshes?: SkinMesh[];
  expressions?: Expression[];
}
export type Ease = 'linear' | 'smooth' | 'hold';
export interface Keyframe {
  at: number;
  value: number;
  ease?: Ease;
  curve?: number[];
}
export interface DeformFrame {
  at: number;
  deltas: number[];
  ease?: Ease;
  curve?: number[];
}
export type NumericTracks = Record<string, Keyframe[]>;
export interface CharacterAction {
  id: string;
  name: string;
  duration: number;
  loop?: boolean;
  event?: string;
  motion?: number;
  emission?: number;
  bend?: number;
  tracks?: NumericTracks;
  boneTracks?: Record<string, NumericTracks>;
  ikTracks?: Record<string, NumericTracks>;
  expressionTracks?: Record<string, NumericTracks>;
  layerTracks?: Record<string, NumericTracks>;
  deformTracks?: Record<string, Record<string, DeformFrame[]>>;
  [extension: string]: unknown;
}
export interface CharacterDocument {
  layers: CardLayer[];
  characterRig?: CharacterRig;
  actions?: CharacterAction[];
}
export interface LocalPose {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}
export interface BonePose {
  matrix: Affine;
  world: Affine;
  rotation: number;
  scale: number;
  opacity: number;
}
export interface IKDiagnostic {
  target: number[];
  actual: number[];
  error: number;
  reachable: boolean;
  mix: number;
  enabled: boolean;
  solver: 'analytic' | 'ccd';
  iterations: number;
  limited: boolean;
  converged: boolean;
  chain: string[];
}
export type Deforms = Map<string, Map<string, Float64Array>>;
export interface CharacterPose {
  bones: Map<string, BonePose>;
  layers: Map<string, BonePose>;
  progress: number;
  deforms: Deforms;
  ik: Map<string, IKDiagnostic>;
  expressions: Map<string, number>;
}
export interface CompiledRig {
  order: Bone[];
  rest: Map<string, Affine>;
  bindings: Map<string, string>;
  constraints: IKConstraint[];
  neutral?: CharacterPose;
}
export type SampleTrack = (
  frames: Keyframe[] | null | undefined,
  t: number,
  fallback: number,
) => number;
export interface TrackSpec {
  name: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}
export interface CharacterPlacement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z?: number;
  clip?: boolean;
  effect?: string;
  strength?: number;
  speed?: number;
  opacity?: number;
}
