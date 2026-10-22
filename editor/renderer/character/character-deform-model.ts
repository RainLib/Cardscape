import type {
  SkinMesh,
  CharacterRig,
  Keyframe,
  DeformFrame,
  CharacterAction,
  CharacterDocument,
  Deforms,
} from '../../shared/character';
/* Native sparse FFD: layer -> bone -> vector frames, applied before skinning.
 * Deltas and optional per-influence bind offsets use the original layer pixels. */

const api = (() => {
  'use strict';
  const record = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === 'object' && !Array.isArray(v),
    finite = (v: number, a: number, b: number) =>
      Number.isFinite(v) && v >= a && v <= b;
  function sparse(values: number[], n: number) {
    if (!Array.isArray(values) || values.length % 3 || values.length > n * 3)
      throw Error('FFD 顶点偏移格式无效');
    const seen = new Set<number>();
    for (let i = 0; i < values.length; i += 3) {
      if (
        !Number.isInteger(values[i]) ||
        values[i] < 0 ||
        values[i] >= n ||
        seen.has(values[i]) ||
        !finite(values[i + 1], -4096, 4096) ||
        !finite(values[i + 2], -4096, 4096)
      )
        throw Error('FFD 顶点索引或偏移无效');
      seen.add(values[i]);
    }
  }
  function validate(doc: CharacterDocument) {
    const rig = doc.characterRig,
      meshes = new Map<string, SkinMesh>(
        (rig?.meshes || []).map((m) => [m.layerId, m]),
      ),
      bones = new Set<string>(rig?.bones.map((b) => b.id) || []);
    let budget = 0;
    for (const mesh of meshes.values()) bindCache.delete(mesh);
    for (const mesh of meshes.values())
      if (mesh.binds !== undefined) {
        if (!record(mesh.binds) || Object.keys(mesh.binds).length > 64)
          throw Error('蒙皮绑定偏移无效');
        for (const [id, values] of Object.entries(mesh.binds)) {
          if (!bones.has(id)) throw Error('蒙皮绑定引用未知骨骼');
          sparse(values, mesh.weights.length);
          budget += values.length;
        }
      }
    for (const action of doc.actions || []) {
      if (action.layerTracks !== undefined) {
        if (
          !record(action.layerTracks) ||
          Object.keys(action.layerTracks).length > 32
        )
          throw Error('附件可见性轨道无效');
        for (const [id, track] of Object.entries(action.layerTracks)) {
          if (
            !meshes.has(id) ||
            !record(track) ||
            Object.keys(track).some((k) => k !== 'opacity') ||
            !Array.isArray(track.opacity) ||
            !track.opacity.length ||
            track.opacity.length > 256
          )
            throw Error('附件轨道引用未知网格');
          let last = -1;
          for (const f of track.opacity) {
            if (
              !record(f) ||
              Object.keys(f).some(
                (k) => !['at', 'value', 'ease'].includes(k),
              ) ||
              !finite(f.at, 0, 1) ||
              f.at <= last ||
              !finite(f.value, 0, 1) ||
              !['linear', 'smooth', 'hold'].includes(f.ease || 'linear')
            )
              throw Error('附件可见性帧无效');
            last = f.at;
          }
        }
      }
      if (action.deformTracks === undefined) continue;
      if (
        !record(action.deformTracks) ||
        Object.keys(action.deformTracks).length > 32
      )
        throw Error('FFD 动画轨道无效');
      for (const [layerId, tracks] of Object.entries(action.deformTracks)) {
        const mesh = meshes.get(layerId);
        if (!mesh || !record(tracks) || Object.keys(tracks).length > 64)
          throw Error('FFD 动画引用未知网格');
        for (const [boneId, frames] of Object.entries(tracks)) {
          if (
            !bones.has(boneId) ||
            !Array.isArray(frames) ||
            !frames.length ||
            frames.length > 256
          )
            throw Error('FFD 骨骼或帧数无效');
          let previous = -1;
          for (const f of frames) {
            if (
              !record(f) ||
              Object.keys(f).some(
                (k) => !['at', 'deltas', 'ease', 'curve'].includes(k),
              ) ||
              !finite(f.at, 0, 1) ||
              f.at <= previous ||
              !['linear', 'smooth', 'hold'].includes(f.ease || 'linear')
            )
              throw Error('FFD 关键帧无效');
            previous = f.at;
            sparse(f.deltas, mesh.weights.length);
            budget += f.deltas.length;
            if (
              f.curve !== undefined &&
              (!Array.isArray(f.curve) ||
                f.curve.length !== 4 ||
                !f.curve.every((v) => finite(v, -100, 100)) ||
                f.curve[0] < -0.05 ||
                f.curve[0] > 1.05 ||
                f.curve[2] < -0.05 ||
                f.curve[2] > 1.05)
            )
              throw Error('FFD 贝塞尔曲线无效');
          }
        }
      }
    }
    if (budget > 4 * 1024 * 1024) throw Error('FFD 数据超过 4M 数值上限');
  }
  function bezier(t: number, curve: readonly number[], a = 0, b = 1) {
    const [x1, y1, x2, y2] = curve,
      cubic = (p0: number, p1: number, p2: number, p3: number, u: number) =>
        (1 - u) ** 3 * p0 +
        3 * (1 - u) ** 2 * u * p1 +
        3 * (1 - u) * u * u * p2 +
        u ** 3 * p3;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 32; i++) {
      const m = (lo + hi) / 2;
      if (cubic(0, x1, x2, 1, m) < t) lo = m;
      else hi = m;
    }
    return cubic(a, y1, y2, b, (lo + hi) / 2);
  }
  function curveValid(v: unknown): v is number[] {
    return (
      Array.isArray(v) &&
      v.length === 4 &&
      v.every((n) => finite(n, -1e6, 1e6)) &&
      v[0] >= -0.05 &&
      v[0] <= 1.05 &&
      v[2] >= -0.05 &&
      v[2] <= 1.05
    );
  }
  function ease(t: number, f: Pick<Keyframe, 'ease' | 'curve'>) {
    if (f.ease === 'hold') return t === 1 ? 1 : 0;
    if (f.ease === 'smooth') return t * t * (3 - 2 * t);
    return f.curve ? bezier(t, f.curve) : t;
  }
  function vector(frames: DeformFrame[], t: number, n: number) {
    const result = new Float64Array(n * 2);
    if (t < frames[0].at) return result;
    let a = frames[frames.length - 1],
      b = a,
      mix = 0;
    for (let i = 1; i < frames.length; i++)
      if (t <= frames[i].at) {
        a = frames[i - 1];
        b = frames[i];
        mix = ease((t - a.at) / (b.at - a.at), a);
        break;
      }
    for (const [f, w] of [
      [a, 1 - mix],
      [b, mix],
    ] as const)
      for (let i = 0; i < f.deltas.length; i += 3) {
        const index = f.deltas[i] * 2;
        result[index] += f.deltas[i + 1] * w;
        result[index + 1] += f.deltas[i + 2] * w;
      }
    return result;
  }
  function sample(
    rig: Pick<CharacterRig, 'meshes'>,
    action: CharacterAction | null | undefined,
    t: number,
  ): Deforms {
    const output: Deforms = new Map();
    for (const mesh of rig.meshes || []) {
      const tracks = action?.deformTracks?.[mesh.layerId];
      if (tracks)
        output.set(
          mesh.layerId,
          new Map<string, Float64Array>(
            Object.entries(tracks).map(([id, frames]) => [
              id,
              vector(frames, t, mesh.weights.length),
            ]),
          ),
        );
    }
    return output;
  }
  const bindCache = new WeakMap<
    SkinMesh,
    { source: SkinMesh['binds']; values: Map<string, Float64Array> }
  >();
  function binds(mesh: SkinMesh) {
    let entry = bindCache.get(mesh);
    const signature = mesh.binds;
    if (entry && entry.source === signature) return entry.values;
    const values = new Map<string, Float64Array>();
    for (const [id, v] of Object.entries(signature || {})) {
      const expanded = new Float64Array(mesh.weights.length * 2);
      for (let j = 0; j < v.length; j += 3) {
        expanded[v[j] * 2] = v[j + 1];
        expanded[v[j] * 2 + 1] = v[j + 2];
      }
      values.set(id, expanded);
    }
    bindCache.set(mesh, { source: signature, values });
    return values;
  }
  return { validate, sample, vector, ease, binds, bezier, curveValid };
})();

export default api;
