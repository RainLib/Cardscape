import type {
  Affine,
  Bone,
  IKConstraint,
  IKLimit,
  CharacterAction,
  LocalPose,
  IKDiagnostic,
  CompiledRig,
  SampleTrack,
} from '../../shared/character';
/* Self-owned analytic and bounded CCD solvers. Samples never warm-start from a
 * previous frame, so seeking, export and playback have identical results. */

const api = (() => {
  'use strict';
  function required<K, V>(map: Map<K, V>, key: K): V {
    const value = map.get(key);
    if (value === undefined) throw Error('人物绑定引用不存在');
    return value;
  }

  const finite = (v: number, a: number, b: number) =>
      Number.isFinite(v) && v >= a && v <= b,
    wrap = (r: number) => Math.atan2(Math.sin(r), Math.cos(r)),
    clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)),
    angle = (m: Affine) => Math.atan2(m[1], m[0]),
    point = (m: Affine, p: number[]) => [
      m[0] * p[0] + m[2] * p[1] + m[4],
      m[1] * p[0] + m[3] * p[1] + m[5],
    ],
    distance = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1]);
  function chain(bones: Bone[], c: Pick<IKConstraint, 'rootId' | 'tipId'>) {
    const byId = new Map<string, Bone>(bones.map((b) => [b.id, b])),
      out = [],
      seen = new Set<string>();
    let b = byId.get(c.tipId);
    while (b && !seen.has(b.id)) {
      seen.add(b.id);
      out.unshift(b.id);
      if (b.id === c.rootId) return out;
      b = byId.get(b.parentId || '');
    }
    throw Error('IK 末端必须属于根骨骼的连续子链');
  }
  function ordered(constraints: IKConstraint[]) {
    return constraints
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (a.c.order ?? a.i) - (b.c.order ?? b.i) || a.i - b.i)
      .map((v) => v.c);
  }
  function validate(bones: Bone[], constraints: IKConstraint[]) {
    const byId = new Map<string, Bone>(bones.map((b) => [b.id, b])),
      ids = new Set<string>(),
      chains: Array<{ c: IKConstraint; list: string[]; legacy: boolean }> = [];
    const ancestor = (a: string, b: string | null | undefined) => {
      for (let p = b; p; p = byId.get(p)?.parentId) if (p === a) return true;
      return false;
    };
    for (const c of constraints) {
      const keys = [
        'id',
        'name',
        'rootId',
        'tipId',
        'end',
        'target',
        'bend',
        'mix',
        'solver',
        'enabled',
        'order',
        'iterations',
        'tolerance',
        'limits',
        'targetBoneId',
      ];
      if (
        !c ||
        Object.keys(c).some((k) => !keys.includes(k)) ||
        typeof c.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(c.id) ||
        ['__proto__', 'constructor', 'prototype'].includes(c.id) ||
        ids.has(c.id) ||
        typeof c.name !== 'string' ||
        !c.name.trim() ||
        c.name.length > 100 ||
        ![c.end, c.target].every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((v) => finite(v, -4096, 4096)),
        ) ||
        Math.hypot(...c.end) < 0.001 ||
        ![1, -1].includes(c.bend) ||
        !finite(c.mix, 0, 1)
      )
        throw Error('IK 参数无效');
      const list = chain(bones, c),
        legacy = !c.solver;
      if (
        list.length > 16 ||
        !['analytic', 'ccd'].includes(c.solver || 'analytic') ||
        ((c.solver || 'analytic') === 'analytic' &&
          (list.length !== 2 ||
            Math.hypot(required(byId, c.tipId).x, required(byId, c.tipId).y) <
              0.001))
      )
        throw Error('解析 IK 需要两节父子骨骼；多节链请选择 CCD（最多 16 节）');
      if (
        (c.enabled !== undefined && typeof c.enabled !== 'boolean') ||
        (c.order !== undefined &&
          (!Number.isInteger(c.order) || !finite(c.order, 0, 255))) ||
        (c.iterations !== undefined &&
          (!Number.isInteger(c.iterations) || !finite(c.iterations, 1, 128))) ||
        (c.tolerance !== undefined && !finite(c.tolerance, 0.001, 10))
      )
        throw Error('IK 顺序或求解精度无效');
      const limits = c.limits || [];
      if (
        !Array.isArray(limits) ||
        limits.length > list.length ||
        new Set<string>(limits.map((l) => l?.boneId)).size !== limits.length
      )
        throw Error('IK 关节限制无效');
      for (const l of limits)
        if (
          !l ||
          Object.keys(l).some((k) => !['boneId', 'min', 'max'].includes(k)) ||
          !list.includes(l.boneId) ||
          !finite(l.min, -720, 720) ||
          !finite(l.max, -720, 720) ||
          l.min > l.max
        )
          throw Error('IK 关节角度限制无效');
      if (limits.length && (c.solver || 'analytic') !== 'ccd')
        throw Error('关节角度限制需要 CCD 求解器');
      if (
        c.targetBoneId !== undefined &&
        (!byId.has(c.targetBoneId) || ancestor(c.rootId, c.targetBoneId))
      )
        throw Error('IK 目标骨骼不能位于受驱动子链内');
      for (const other of chains)
        if (
          list.some((id) =>
            other.list.some((o) => ancestor(id, o) || ancestor(o, id)),
          ) &&
          (c.order === undefined || other.c.order === undefined)
        )
          throw Error(
            '嵌套或重复驱动链需显式设置求解顺序；旧两节 IK 只支持独立分支',
          );
      ids.add(c.id);
      chains.push({ c, list, legacy });
    }
    // Targets are evaluated in the declared order. A later constraint must not
    // move an earlier target, or the target/solve relationship would be cyclic.
    const sorted = ordered(constraints);
    for (let i = 0; i < sorted.length; i++)
      for (let j = i; j < sorted.length; j++)
        if (
          sorted[i].targetBoneId &&
          ancestor(sorted[j].rootId, sorted[i].targetBoneId)
        )
          throw Error('目标依赖顺序无效或循环：请先求解目标骨骼所属约束');
  }
  function target(
    c: IKConstraint,
    values: number[],
    world: Map<string, Affine>,
  ) {
    return c.targetBoneId
      ? point(required(world, c.targetBoneId), values)
      : values;
  }
  function solve(
    compiled: CompiledRig,
    action: CharacterAction | null | undefined,
    t: number,
    locals: Map<string, LocalPose>,
    build: () => Map<string, Affine>,
    sampleTrack: SampleTrack,
  ) {
    const diagnostics = new Map<string, IKDiagnostic>(),
      records = [];
    let world = build();
    for (const c of ordered(compiled.constraints || [])) {
      const values = action?.ikTracks?.[c.id] || {},
        offset = [
          sampleTrack(values.x, t, c.target[0]),
          sampleTrack(values.y, t, c.target[1]),
        ],
        goal = target(c, offset, world),
        mix = c.enabled === false ? 0 : sampleTrack(values.mix, t, c.mix),
        list = chain(compiled.order, c),
        start = required(world, c.rootId).slice(4),
        tip = required(world, c.tipId),
        end = point(tip, c.end),
        lengths = list
          .slice(1)
          .map((id, i) =>
            distance(
              required(world, list[i]).slice(4),
              required(world, id).slice(4),
            ),
          )
          .concat(distance(tip.slice(4), end));
      let iterations = 0,
        limited = false;
      if (mix > 0 && (c.solver || 'analytic') === 'analytic') {
        const root = required(world, c.rootId),
          elbow = tip.slice(4),
          l1 = lengths[0],
          l2 = lengths[1];
        if (l1 > 0.000001 && l2 > 0.000001) {
          const dx = goal[0] - start[0],
            dy = goal[1] - start[1],
            d = Math.hypot(dx, dy),
            reach = clamp(d, Math.abs(l1 - l2) + 0.000001, l1 + l2 - 0.000001),
            aim =
              d > 0.000001
                ? Math.atan2(dy, dx)
                : Math.atan2(elbow[1] - start[1], elbow[0] - start[0]),
            theta =
              aim -
              c.bend *
                Math.acos(
                  clamp(
                    (reach * reach + l1 * l1 - l2 * l2) / (2 * reach * l1),
                    -1,
                    1,
                  ),
                ),
            wantedRoot =
              angle(root) +
              wrap(
                theta - Math.atan2(elbow[1] - start[1], elbow[0] - start[0]),
              ),
            desiredElbow = [
              start[0] + Math.cos(theta) * l1,
              start[1] + Math.sin(theta) * l1,
            ],
            clampedTarget = [
              start[0] + Math.cos(aim) * reach,
              start[1] + Math.sin(aim) * reach,
            ],
            wantedTip =
              Math.atan2(
                clampedTarget[1] - desiredElbow[1],
                clampedTarget[0] - desiredElbow[0],
              ) - Math.atan2(c.end[1], c.end[0]);
          required(locals, c.rootId).rotation +=
            ((wrap(wantedRoot - angle(root)) * 180) / Math.PI) * mix;
          world = build();
          required(locals, c.tipId).rotation +=
            ((wrap(wantedTip - angle(required(world, c.tipId))) * 180) /
              Math.PI) *
            mix;
          world = build();
          iterations = 1;
        }
      } else if (mix > 0) {
        const initial = new Map<string, number>(
            list.map((id) => [id, required(locals, id).rotation]),
          ),
          limits = new Map<string, IKLimit>(
            (c.limits || []).map((l) => [l.boneId, l]),
          );
        const rotate = (id: string, degrees: number) => {
          const v = required(locals, id),
            l = limits.get(id),
            next = v.rotation + degrees;
          v.rotation = l ? clamp(next, l.min, l.max) : next;
          limited ||= !!l && Math.abs(next - v.rotation) > 0.000001;
          world = build();
        };
        for (const id of list) rotate(id, 0);
        // A straight chain aimed at a closer point is a stationary CCD saddle.
        // A tiny deterministic bend seed supplies a side without previous-frame state.
        if (
          list.length > 1 &&
          distance(start, goal) < lengths.reduce((a, b) => a + b, 0) - 0.001
        ) {
          const last = list[list.length - 1],
            pivot = required(world, last).slice(4),
            a = point(required(world, c.tipId), c.end),
            cross =
              (a[0] - start[0]) * (goal[1] - start[1]) -
              (a[1] - start[1]) * (goal[0] - start[0]);
          if (Math.abs(cross) < 0.000001 && distance(pivot, a) > 0.001)
            rotate(last, c.bend * 0.5);
        }
        for (let i = 0; i < (c.iterations ?? 48); i++) {
          if (
            distance(point(required(world, c.tipId), c.end), goal) <=
            (c.tolerance ?? 0.05)
          )
            break;
          for (const id of [...list].reverse()) {
            const p = required(world, id).slice(4),
              e = point(required(world, c.tipId), c.end),
              a = [e[0] - p[0], e[1] - p[1]],
              b = [goal[0] - p[0], goal[1] - p[1]];
            if (Math.hypot(...a) > 0.0000001 && Math.hypot(...b) > 0.0000001)
              rotate(
                id,
                (wrap(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])) * 180) /
                  Math.PI,
              );
          }
          iterations = i + 1;
        }
        if (mix < 1) {
          for (const id of list) {
            const v = required(locals, id),
              l = limits.get(id);
            v.rotation =
              required(initial, id) +
              (v.rotation - required(initial, id)) * mix;
            if (l) v.rotation = clamp(v.rotation, l.min, l.max);
          }
          world = build();
        }
      }
      records.push({ c, offset, mix, list, lengths, iterations, limited });
    }
    // Later ordered constraints may move a previously solved chain. Report the
    // final geometry rather than an obsolete intermediate success.
    for (const {
      c,
      offset,
      mix,
      list,
      lengths,
      iterations,
      limited,
    } of records) {
      const goal = target(c, offset, world),
        actual = point(required(world, c.tipId), c.end),
        d = distance(required(world, c.rootId).slice(4), goal),
        reach = lengths.reduce((a, b) => a + b, 0),
        minimum = Math.max(0, Math.max(...lengths) * 2 - reach),
        error = distance(actual, goal);
      diagnostics.set(c.id, {
        target: goal,
        actual,
        error,
        reachable: d <= reach + 0.00001 && d >= minimum - 0.00001,
        mix,
        enabled: c.enabled !== false,
        solver: c.solver || 'analytic',
        iterations,
        limited,
        converged: error <= (c.tolerance ?? 0.05),
        chain: list,
      });
    }
    return { world, diagnostics };
  }
  return { validate, chain, ordered, target, solve };
})();

export default api;
