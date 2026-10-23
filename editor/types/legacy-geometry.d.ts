interface LegacyGeometryPart {
  name: string;
  group: string;
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
  effects?: number[];
  popBase?: number[] | WebGLBuffer;
  color: number[];
  metal: number;
  rough: number;
  texture?: string;
  alpha?: boolean;
  background?: string;
  pos?: WebGLBuffer;
  norm?: WebGLBuffer;
  tex?: WebGLBuffer;
  effect?: WebGLBuffer;
  region?: WebGLBuffer;
  idx?: WebGLBuffer;
  lines?: WebGLBuffer;
  lineCount?: number;
  regions?: number[];
}
