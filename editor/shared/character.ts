import type { CardLayer } from './document';
import type { Particles } from './visual-components';
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
export type ParticleVector = [number, number, number];
export interface ParticlePlane {
  id: string;
  /** Free half-space: dot(normalized normal, position) >= distance + radius. */
  normal: ParticleVector;
  distance: number;
}
export interface ParticlePhysics {
  schema: 'card-particle-physics/1';
  /** Initial emitter-local velocity and deterministic component-wise spread. */
  velocity: ParticleVector;
  spread: ParticleVector;
  /** Gravity and static planes use the selected simulation space. */
  gravity: ParticleVector;
  radius: number;
  restitution: number;
  friction: number;
  response: 'bounce' | 'slide' | 'kill';
  maxBounces: number;
  planes: ParticlePlane[];
}
export interface ActionParticleEvent {
  id: string;
  name: string;
  /** Normalized action time; age and duration are in seconds. */
  at: number;
  duration: number;
  /** Stop creating particles at this age; already born particles keep fading. */
  emissionDuration?: number;
  /** Connected strip sampled from past bone poses, in card coordinates. */
  trail?: { duration: number; segments: number };
  boneId?: string;
  /** Card freezes the bone; world also freezes the card root at birth. */
  simulationSpace?: 'bone' | 'card' | 'world';
  /** Ballistic motion replaces procedural trajectory; appearance is retained. */
  physics?: ParticlePhysics;
  particles: Particles;
}
/** Radians, then world translation/uniform scale/opacity. Matches preview projection. */
export interface ParticleWorldPose {
  angle: [number, number];
  root: [number, number, number, number, number];
}
export type ParticleWorldSampler = (
  actionId: string,
  actionSeconds: number,
  fallback: ParticleWorldPose,
) => ParticleWorldPose;
export interface CharacterAction {
  audioEvents?: ActionAudioEvent[];
  particleEvents?: ActionParticleEvent[];
  transitionDuration?: number;
  /** Full painter order, back to front. Omitted layers keep their original slots. */
  drawOrder?: Array<{ at: number; layers: string[] }>;
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
export interface ActionAudioEvent {
  id: string;
  name: string;
  /** Embedded canonical PCM WAV while authoring; exported asset path at runtime. */
  src: string;
  sourceDuration: number;
  /** Normalized action trigger, seconds of output and seconds into the source. */
  at: number;
  duration: number;
  offset: number;
  volume: number;
  playbackRate: number;
  loop: boolean;
  enabled: boolean;
}
export interface ActionAudioState {
  enabled: boolean;
  context: string;
  voices: number;
  sources: number;
  decodedBytes: number;
  starts: number;
  error: string;
  level: number;
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
