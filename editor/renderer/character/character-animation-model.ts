import type {
  Affine,
  Bone,
  CharacterRig,
  Keyframe,
  CharacterAction,
  CharacterDocument,
  LocalPose,
  BonePose,
  CharacterPose,
  CompiledRig,
  TrackSpec,
  CharacterPlacement,
  Ease,
} from '../../shared/character';
/* Native rigid-part animation. All coordinates are registered source pixels,
 * y down and clockwise degrees. A posed bone is compensated by its rest pose;
 * artwork, source UVs, Masks and painter order remain independent of the rig. */
import importedCardCharacterAdvanced from './character-advanced-model.ts';

const api = (() => {
  'use strict';
  function required<K, V>(map: Map<K, V>, key: K): V {
    const value = map.get(key);
    if (value === undefined) throw Error('人物绑定引用不存在');
    return value;
  }

  const schema = 'card-character-rig/1',
    cache = new WeakMap<CharacterRig, CompiledRig>();
  const tracks: Record<string, TrackSpec> = {
    x: {
      name: '关节 · 水平位移',
      min: -4096,
      max: 4096,
      step: 0.001,
      unit: 'px',
      default: 0,
    },
    y: {
      name: '关节 · 垂直位移',
      min: -4096,
      max: 4096,
      step: 0.001,
      unit: 'px',
      default: 0,
    },
    rotation: {
      name: '关节 · 旋转',
      min: -720,
      max: 720,
      step: 0.001,
      unit: '°',
      default: 0,
    },
    scale: {
      name: '关节 · 缩放',
      min: 0.05,
      max: 4,
      step: 0.001,
      unit: '×',
      default: 1,
    },
    opacity: {
      name: '关节 · 透明度',
      min: 0,
      max: 1,
      step: 0.001,
      unit: '×',
      default: 1,
    },
  };
  const identity = () => [1, 0, 0, 1, 0, 0],
    id = (v: unknown): v is string =>
      typeof v === 'string' &&
      /^[A-Za-z0-9_-]{1,100}$/.test(v) &&
      !['__proto__', 'constructor', 'prototype'].includes(v),
    range = (v: number, a: number, b: number) =>
      Number.isFinite(v) && v >= a && v <= b;
  function multiply(a: Affine, b: Affine): Affine {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }
  function inverse(a: Affine): Affine {
    const det = a[0] * a[3] - a[1] * a[2];
    return [
      a[3] / det,
      -a[1] / det,
      -a[2] / det,
      a[0] / det,
      (a[2] * a[5] - a[3] * a[4]) / det,
      (a[1] * a[4] - a[0] * a[5]) / det,
    ];
  }
  function matrix(x: number, y: number, rotation = 0, scale = 1): Affine {
    const r = (rotation * Math.PI) / 180,
      c = Math.cos(r) * scale,
      s = Math.sin(r) * scale;
    return [c, s, -s, c, x, y];
  }
  function point(m: Affine, x: number, y: number) {
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }
  function compile(rig: CharacterRig): CompiledRig {
    if (cache.has(rig)) return cache.get(rig)!;
    const byId = new Map<string, Bone>(rig.bones.map((b) => [b.id, b])),
      order: Bone[] = [],
      rest = new Map<string, Affine>(),
      visiting = new Set<string>();
    function visit(b: Bone) {
      if (rest.has(b.id)) return;
      if (visiting.has(b.id)) throw Error('人物关节层级存在循环');
      visiting.add(b.id);
      const parent = byId.get(b.parentId || '');
      if (b.parentId && !parent) throw Error('人物关节父节点不存在');
      if (parent) visit(parent);
      const m = multiply(
        parent ? required(rest, parent.id) : identity(),
        matrix(b.x, b.y, b.rotation, b.scale),
      );
      if (
        m.some((v) => !Number.isFinite(v)) ||
        Math.hypot(m[0], m[1]) < 0.0001 ||
        Math.hypot(m[0], m[1]) > 10000 ||
        Math.abs(m[4]) + Math.abs(m[5]) > 1e7
      )
        throw Error('人物关节累计变换超出范围');
      rest.set(b.id, m);
      order.push(b);
      visiting.delete(b.id);
    }
    rig.bones.forEach(visit);
    const compiled = {
      order,
      rest,
      bindings: new Map<string, string>(
        rig.bindings.map((b) => [b.layerId, b.boneId]),
      ),
      constraints: rig.constraints || [],
    };
    cache.set(rig, compiled);
    return compiled;
  }
  function validate(doc: CharacterDocument) {
    const rig = doc.characterRig;
    if (
      !rig &&
      (doc.actions || []).some(
        (a) =>
          a.ikTracks !== undefined ||
          a.expressionTracks !== undefined ||
          a.deformTracks !== undefined ||
          a.layerTracks !== undefined,
      )
    )
      throw Error('人物控制轨道缺少绑定');
    if (rig !== undefined) {
      if (
        !rig ||
        rig.schema !== schema ||
        !Array.isArray(rig.bones) ||
        rig.bones.length > 64 ||
        !Array.isArray(rig.bindings) ||
        rig.bindings.length > 64 ||
        Object.keys(rig).some(
          (k) =>
            ![
              'schema',
              'bones',
              'bindings',
              'constraints',
              'meshes',
              'expressions',
            ].includes(k),
        )
      )
        throw Error('人物绑定格式无效');
      const ids = new Set<string>();
      for (const b of rig.bones) {
        if (
          !b ||
          !id(b.id) ||
          ids.has(b.id) ||
          typeof b.name !== 'string' ||
          !b.name.trim() ||
          b.name.length > 100 ||
          (b.parentId !== null && !id(b.parentId)) ||
          !range(b.x, -4096, 4096) ||
          !range(b.y, -4096, 4096) ||
          !range(b.rotation, -360, 360) ||
          !range(b.scale, 0.05, 10) ||
          (b.tip !== undefined &&
            (!Array.isArray(b.tip) ||
              b.tip.length !== 2 ||
              b.tip.some((n) => !range(n, -4096, 4096)))) ||
          Object.keys(b).some(
            (k) =>
              ![
                'id',
                'name',
                'parentId',
                'x',
                'y',
                'rotation',
                'scale',
                'tip',
              ].includes(k),
          )
        )
          throw Error('人物关节参数无效');
        ids.add(b.id);
      }
      const bound = new Set<string>();
      for (const b of rig.bindings) {
        const layer = b && doc.layers?.find((l) => l.id === b.layerId);
        if (
          !b ||
          !layer ||
          layer.kind === 'frame' ||
          layer.previewReference ||
          !['foreground', 'image'].includes(layer.kind) ||
          !ids.has(b.boneId) ||
          bound.has(b.layerId) ||
          (b.opacity !== undefined && !range(b.opacity, 0, 1)) ||
          Object.keys(b).some(
            (k) => !['layerId', 'boneId', 'opacity'].includes(k),
          )
        )
          throw Error('人物图层绑定无效');
        bound.add(b.layerId);
      }
      // Validation may be called after an in-place authoring operation.
      cache.delete(rig);
      importedCardCharacterAdvanced.validate(doc, compile(rig));
    }
    for (const a of doc.actions || []) {
      if (a.boneTracks === undefined) continue;
      if (
        !rig ||
        !a.boneTracks ||
        typeof a.boneTracks !== 'object' ||
        Array.isArray(a.boneTracks) ||
        Object.keys(a.boneTracks).length > 64
      )
        throw Error('人物动画轨道缺少有效绑定');
      for (const [boneId, values] of Object.entries(a.boneTracks)) {
        if (
          !rig.bones.some((b) => b.id === boneId) ||
          !values ||
          typeof values !== 'object' ||
          Array.isArray(values) ||
          Object.keys(values).length > 5
        )
          throw Error('人物动画目标无效');
        for (const [key, frames] of Object.entries(values)) {
          const spec = tracks[key];
          if (
            !spec ||
            !Array.isArray(frames) ||
            !frames.length ||
            frames.length > 64
          )
            throw Error('人物动画轨道无效');
          let last = -1;
          for (const f of frames) {
            if (
              !f ||
              !range(f.at, 0, 1) ||
              f.at <= last ||
              !range(f.value, spec.min, spec.max) ||
              !['linear', 'smooth', 'hold'].includes(f.ease || 'linear') ||
              Object.keys(f).some(
                (k) => !['at', 'value', 'ease', 'curve'].includes(k),
              ) ||
              (f.curve !== undefined &&
                !importedCardCharacterAdvanced.deform.curveValid(f.curve))
            )
              throw Error('人物动画关键帧无效');
            last = f.at;
          }
        }
      }
    }
  }
  function sampleTrack(
    frames: Keyframe[] | null | undefined,
    t: number,
    fallback: number,
  ): number {
    if (!frames?.length) return fallback;
    if (t <= frames[0].at) return frames[0].value;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1],
        b = frames[i];
      if (t <= b.at) {
        let v = (t - a.at) / (b.at - a.at);
        if (a.curve)
          return importedCardCharacterAdvanced.deform.bezier(
            v,
            a.curve,
            a.value,
            b.value,
          );
        if (a.ease === 'hold') v = t === b.at ? 1 : 0;
        else if (a.ease === 'smooth') v = v * v * (3 - 2 * v);
        return a.value + (b.value - a.value) * v;
      }
    }
    return frames[frames.length - 1].value;
  }
  function local(
    action: CharacterAction | null | undefined,
    boneId: string,
    progress: number,
  ): LocalPose {
    return {
      x: sampleTrack(action?.boneTracks?.[boneId]?.x, progress, 0),
      y: sampleTrack(action?.boneTracks?.[boneId]?.y, progress, 0),
      rotation: sampleTrack(
        action?.boneTracks?.[boneId]?.rotation,
        progress,
        0,
      ),
      scale: sampleTrack(action?.boneTracks?.[boneId]?.scale, progress, 1),
      opacity: sampleTrack(action?.boneTracks?.[boneId]?.opacity, progress, 1),
    };
  }
  function sample(
    doc: CharacterDocument,
    action: CharacterAction | null | undefined,
    seconds = 0,
    { seek = false }: { seek?: boolean } = {},
  ): CharacterPose | null {
    if (!doc.characterRig) return null;
    const rig = compile(doc.characterRig),
      duration = action?.duration || 1,
      time = Math.max(0, Number.isFinite(seconds) ? seconds : 0),
      t =
        action?.loop && !seek
          ? (time % duration) / duration
          : Math.min(1, time / duration),
      bones = new Map<string, BonePose>(),
      layers = new Map<string, BonePose>(),
      locals = new Map<string, LocalPose>(
        rig.order.map((b) => [b.id, local(action, b.id, t)]),
      );
    const build = () => {
      const world = new Map<string, Affine>();
      for (const b of rig.order) {
        const v = required(locals, b.id);
        world.set(
          b.id,
          multiply(
            b.parentId ? required(world, b.parentId) : identity(),
            matrix(
              b.x + v.x,
              b.y + v.y,
              b.rotation + v.rotation,
              b.scale * v.scale,
            ),
          ),
        );
      }
      return world;
    };
    const solved = importedCardCharacterAdvanced.solve(
      rig,
      action,
      t,
      locals,
      build,
      sampleTrack,
    );
    for (const b of rig.order) {
      const v = required(locals, b.id),
        m = required(solved.world, b.id),
        delta = multiply(m, inverse(required(rig.rest, b.id))),
        opacity = v.opacity * (bones.get(b.parentId || '')?.opacity ?? 1);
      bones.set(b.id, {
        matrix: delta,
        world: m,
        rotation: Math.atan2(delta[1], delta[0]),
        scale: Math.hypot(delta[0], delta[1]),
        opacity,
      });
    }
    for (const binding of doc.characterRig.bindings) {
      const { layerId, boneId } = binding,
        p = required(bones, boneId),
        opacity = sampleTrack(
          action?.layerTracks?.[layerId]?.opacity,
          t,
          binding.opacity ?? 1,
        );
      layers.set(
        layerId,
        opacity === 1 ? p : { ...p, opacity: p.opacity * opacity },
      );
    }
    // Unbound split cloth follows its master. Explicit bindings always win.
    for (const l of doc.layers || [])
      if (
        !layers.has(l.id) &&
        l.splitSourceId &&
        l.splitSourceId &&
        layers.has(l.splitSourceId)
      )
        layers.set(l.id, required(layers, l.splitSourceId));
    return {
      bones,
      layers,
      progress: t,
      deforms: importedCardCharacterAdvanced.deform.sample(
        doc.characterRig,
        action,
        t,
      ),
      ik: solved.diagnostics,
      expressions: importedCardCharacterAdvanced.expressions(
        doc.characterRig,
        action,
        t,
        sampleTrack,
      ),
    };
  }
  function placement<T extends CharacterPlacement>(
    base: T,
    layer: { id: string } | null | undefined,
    pose?: CharacterPose | null,
  ): T & { opacity?: number } {
    const p = pose?.layers.get(layer?.id || '');
    if (!p) return base;
    const xy = point(p.matrix, 512 + base.x, 768 + base.y);
    return {
      ...base,
      x: xy.x - 512,
      y: xy.y - 768,
      scale: base.scale * p.scale,
      rotation: base.rotation + p.rotation,
      opacity: p.opacity,
    };
  }
  function rest(doc: CharacterDocument): CharacterPose | null {
    if (!doc.characterRig) return null;
    const rig = compile(doc.characterRig);
    if (rig.neutral) return rig.neutral;
    const bones = new Map<string, BonePose>(
        rig.order.map((b) => [
          b.id,
          {
            matrix: identity(),
            world: required(rig.rest, b.id),
            rotation: 0,
            scale: 1,
            opacity: 1,
          },
        ]),
      ),
      layers = new Map<string, BonePose>(
        doc.characterRig.bindings.map((b) => [
          b.layerId,
          { ...required(bones, b.boneId), opacity: b.opacity ?? 1 },
        ]),
      );
    for (const l of doc.layers || [])
      if (!layers.has(l.id) && l.splitSourceId && layers.has(l.splitSourceId))
        layers.set(l.id, required(layers, l.splitSourceId));
    rig.neutral = {
      bones,
      layers,
      deforms: new Map(),
      ik: new Map(),
      expressions: new Map<string, number>(
        (doc.characterRig.expressions || []).map((e) => [e.id, 0]),
      ),
      progress: 0,
    };
    return rig.neutral;
  }
  function addBone(
    doc: CharacterDocument,
    {
      id: boneId,
      name,
      parentId = null,
      x = 512,
      y = 768,
    }: {
      id: string;
      name: string;
      parentId?: string | null;
      x?: number;
      y?: number;
    },
  ) {
    doc.characterRig ||= { schema, bones: [], bindings: [] };
    const rig = doc.characterRig;
    if (rig.bones.length >= 64) throw Error('人物关节最多 64 个');
    if (parentId) {
      const parent = compile(rig).rest.get(parentId);
      if (!parent) throw Error('人物关节父节点不存在');
      const p = point(inverse(parent), x, y);
      x = p.x;
      y = p.y;
    }
    rig.bones.push({ id: boneId, name, parentId, x, y, rotation: 0, scale: 1 });
    cache.delete(rig);
  }
  function bind(
    doc: CharacterDocument,
    layerId: string,
    boneId: string | null,
  ) {
    const l = doc.layers.find((l) => l.id === layerId);
    if (!l || l.locked) throw Error('请先选择并解锁人物图层');
    if (!doc.characterRig) throw Error('请先创建人物关节');
    doc.characterRig.bindings = doc.characterRig.bindings.filter(
      (b) => b.layerId !== layerId,
    );
    if (boneId) doc.characterRig.bindings.push({ layerId, boneId });
    cache.delete(doc.characterRig);
  }
  function removeBone(doc: CharacterDocument, boneId: string) {
    const rig = doc.characterRig;
    if (!rig) return;
    if (rig.bones.some((b) => b.parentId === boneId))
      throw Error('请先删除子关节');
    if (
      (rig.constraints || []).some(
        (c) =>
          importedCardCharacterAdvanced.ik
            .chain(rig.bones, c)
            .includes(boneId) || c.targetBoneId === boneId,
      ) ||
      (rig.meshes || []).some(
        (m) =>
          m.weights.some((ws) => ws.some((w) => w.boneId === boneId)) ||
          Object.hasOwn(m.binds || {}, boneId),
      )
    )
      throw Error('请先移除引用该骨骼的 IK、蒙皮权重或逐骨骼绑定');
    const bound = rig.bindings.filter((b) => b.boneId === boneId);
    if (bound.some((b) => doc.layers.find((l) => l.id === b.layerId)?.locked))
      throw Error('请先解锁绑定图层');
    rig.bones = rig.bones.filter((b) => b.id !== boneId);
    rig.bindings = rig.bindings.filter((b) => b.boneId !== boneId);
    for (const a of doc.actions || []) {
      if (a.boneTracks) delete a.boneTracks[boneId];
      for (const tracks of Object.values(a.deformTracks || {}))
        delete tracks[boneId];
    }
    cache.delete(rig);
  }
  function keyframe(
    action: CharacterAction,
    boneId: string,
    key: string,
    seconds: number,
    value: number,
    ease: Ease = 'linear',
  ) {
    const spec = tracks[key];
    if (
      !spec ||
      !range(value, spec.min, spec.max) ||
      !['linear', 'smooth', 'hold'].includes(ease)
    )
      throw Error('人物动画关键帧值超出范围');
    const next = structuredClone(action),
      at = +Math.max(0, Math.min(1, seconds / action.duration)).toFixed(6);
    next.boneTracks ||= {};
    next.boneTracks[boneId] ||= {};
    let frames = next.boneTracks[boneId][key];
    if (!frames)
      frames = [0, 1].map((at) => ({
        at,
        value: spec.default,
        ease: 'linear' as const,
      }));
    frames = frames.filter((f) => Math.abs(f.at - at) >= 0.0001);
    frames.push({ at, value, ease });
    frames.sort((a, b) => a.at - b.at);
    if (frames.length > 64) throw Error('人物动画轨道最多 64 个关键帧');
    next.boneTracks[boneId][key] = frames;
    return next;
  }
  function control(
    doc: CharacterDocument,
    action: CharacterAction | null,
    type: string,
    targetId: string,
    t: number,
  ): Record<string, number> {
    if (type === 'expression')
      return {
        value: sampleTrack(
          action?.expressionTracks?.[targetId]?.value,
          t,
          doc.characterRig?.expressions?.find((e) => e.id === targetId)
            ?.value || 0,
        ),
      };
    const c = doc.characterRig?.constraints?.find((c) => c.id === targetId);
    if (!c) throw Error('人物控制目标不存在');
    const values = action?.ikTracks?.[targetId];
    return {
      x: sampleTrack(values?.x, t, c.target[0]),
      y: sampleTrack(values?.y, t, c.target[1]),
      mix: sampleTrack(values?.mix, t, c.mix),
    };
  }
  function controlKeyframe(
    doc: CharacterDocument,
    action: CharacterAction,
    type: string,
    targetId: string,
    key: string,
    seconds: number,
    value: number,
    ease: Ease = 'linear',
  ) {
    const specs =
        type === 'ik'
          ? importedCardCharacterAdvanced.ikTracks
          : importedCardCharacterAdvanced.expressionTracks,
      spec = specs[key];
    if (
      !spec ||
      !range(value, spec.min, spec.max) ||
      !['linear', 'smooth', 'hold'].includes(ease)
    )
      throw Error('人物控制关键帧值无效');
    const next = structuredClone(action),
      field = type === 'ik' ? 'ikTracks' : 'expressionTracks',
      defaults = control(doc, null, type, targetId, 0),
      at = +Math.max(0, Math.min(1, seconds / action.duration)).toFixed(6);
    next[field] ||= {};
    next[field][targetId] ||= {};
    let frames =
      next[field][targetId][key] ||
      [0, 1].map((at) => ({
        at,
        value: defaults[key],
        ease: 'linear' as const,
      }));
    frames = frames.filter((f) => Math.abs(f.at - at) >= 0.0001);
    frames.push({ at, value, ease });
    frames.sort((a, b) => a.at - b.at);
    if (frames.length > 64) throw Error('人物控制轨道最多 64 个关键帧');
    next[field][targetId][key] = frames;
    return next;
  }

  function sourcePlacement(
    layer:
      | {
          x?: number;
          y?: number;
          scale?: number;
          rotation?: number;
          pivot?: { u?: number; v?: number };
        }
      | null
      | undefined,
    slot?: {
      u: number;
      v: number;
      scale?: number;
      rotation?: number;
      z?: number;
      clip?: boolean;
      effect?: string;
      strength?: number;
      speed?: number;
    } | null,
  ): CharacterPlacement {
    const scale = (layer?.scale ?? 1) * (slot?.scale ?? 1),
      rotation =
        (((layer?.rotation || 0) + (slot?.rotation || 0)) * Math.PI) / 180;
    const x = ((layer?.pivot?.u ?? 0.5) - 0.5) * 1024 * scale,
      y = ((layer?.pivot?.v ?? 0.5) - 0.5) * 1536 * scale,
      c = Math.cos(rotation),
      s = Math.sin(rotation);
    return {
      x:
        (layer?.x || 0) +
        (slot ? (slot.u - 0.5) * 1024 : 0) +
        (x - (c * x - s * y)),
      y:
        (layer?.y || 0) +
        (slot ? (slot.v - 0.5) * 1536 : 0) +
        (y - (s * x + c * y)),
      scale,
      rotation,
      z: slot?.z,
      clip: !!slot?.clip,
      effect: slot?.effect || 'none',
      strength: slot?.strength ?? 0,
      speed: slot?.speed ?? 1,
    };
  }
  return {
    sourcePlacement,
    schema,
    tracks,
    validate,
    compile,
    sample,
    rest,
    local,
    placement,
    point,
    multiply,
    inverse,
    matrix,
    addBone,
    bind,
    removeBone,
    keyframe,
    control,
    controlKeyframe,
    advanced: importedCardCharacterAdvanced,
    geometry: importedCardCharacterAdvanced.geometry,
  };
})();

export default api;
