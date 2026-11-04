import type {
  CardContour,
  ContourPaths,
  ContourPath,
  Vec2,
} from '../../shared/render-models';
import G from './contour-geometry.ts';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a: Vec2, b: Vec2, t = 0.5): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
function point(v: unknown): v is Vec2 {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every(
      (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 8192,
    )
  );
}
function validate(value: unknown): asserts value is ContourPaths {
  if (
    !record(value) ||
    value.schema !== 'card-contour-paths/1' ||
    !Array.isArray(value.outline) ||
    !Array.isArray(value.windows) ||
    (value.islands !== undefined && !Array.isArray(value.islands)) ||
    typeof value.tolerance !== 'number' ||
    !Number.isFinite(value.tolerance) ||
    value.tolerance < 0.25 ||
    value.tolerance > 32
  )
    throw Error('轮廓曲线数据或采样精度无效');
  let count = 0,
    rings = 0;
  for (const region of [value, ...((value.islands as unknown[]) || [])]) {
    if (
      !record(region) ||
      !Array.isArray(region.outline) ||
      !Array.isArray(region.windows) ||
      region.windows.length >= G.limits.rings
    )
      throw Error('轮廓区域无效');
    if (
      !region.outline.length &&
      region === value &&
      !region.windows.length &&
      !(value.islands as unknown[] | undefined)?.length
    )
      continue;
    for (const path of [region.outline, ...region.windows]) {
      if (
        !Array.isArray(path) ||
        path.length < 3 ||
        (count += path.length) > G.limits.points ||
        ++rings > G.limits.rings
      )
        throw Error('轮廓曲线需要至少 3 个锚点，总计最多 4096 个锚点、128 环');
      for (let i = 0; i < path.length; i++) {
        const node: unknown = path[i],
          next: unknown = path[(i + 1) % path.length];
        if (
          !record(node) ||
          !point(node.point) ||
          !record(next) ||
          !point(next.point) ||
          (node.incoming !== undefined && !point(node.incoming)) ||
          (node.outgoing !== undefined && !point(node.outgoing)) ||
          distance(node.point, next.point) < 1e-6
        )
          throw Error('曲线锚点或手柄无效');
      }
    }
  }
}
function segmentDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}
function simplify(points: Vec2[]): Vec2[] {
  const result = points.filter(
    (p, i) =>
      distance(p, points[(i + points.length - 1) % points.length]) > 0.000001,
  );
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let i = 0; i < result.length; i++)
      if (
        segmentDistance(
          result[i],
          result[(i + result.length - 1) % result.length],
          result[(i + 1) % result.length],
        ) < 0.000001
      ) {
        result.splice(i, 1);
        changed = true;
        break;
      }
  }
  return result;
}
function flatten(path: ContourPath, tolerance: number): Vec2[] {
  if (!path.length) return [];
  const output: Vec2[] = [[...path[0].point]];
  function cubic(a: Vec2, b: Vec2, c: Vec2, d: Vec2, depth = 0) {
    if (output.length > G.limits.points + 1)
      throw Error('曲线采样超过 4096 点，请增大采样误差或简化曲线');
    if (
      // Inner Bernstein weights sum to at most .75; endpoint distances are 0.
      0.75 * Math.max(segmentDistance(b, a, d), segmentDistance(c, a, d)) <=
      tolerance
    ) {
      output.push([...d]);
      return;
    }
    if (depth >= 14) throw Error('曲线过于复杂，请简化手柄');
    const ab = mix(a, b),
      bc = mix(b, c),
      cd = mix(c, d),
      abc = mix(ab, bc),
      bcd = mix(bc, cd),
      mid = mix(abc, bcd);
    cubic(a, ab, abc, mid, depth + 1);
    cubic(mid, bcd, cd, d, depth + 1);
  }
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    if (!a.outgoing && !b.incoming) output.push([...b.point]);
    else cubic(a.point, a.outgoing || a.point, b.incoming || b.point, b.point);
  }
  output.pop();
  return simplify(output);
}
function compile(value: unknown): CardContour {
  validate(value);
  const paths = value;
  const outline = flatten(paths.outline, paths.tolerance),
    windows = paths.windows.map((p) => flatten(p, paths.tolerance));
  const islands = paths.islands?.map((r) => ({
    outline: flatten(r.outline, paths.tolerance),
    windows: r.windows.map((p) => flatten(p, paths.tolerance)),
  }));
  const contour: CardContour = {
    outline,
    windows,
    ...(islands?.length ? { islands } : {}),
    paths: structuredClone(paths),
  };
  if (G.rings(contour).reduce((n, r) => n + r.length, 0) > G.limits.points)
    throw Error('轮廓采样总计超过 4096 点，请增大采样误差或减少曲线');
  return contour;
}
function fromContour(contour: CardContour): ContourPaths {
  if (contour.paths) return structuredClone(contour.paths);
  return {
    schema: 'card-contour-paths/1',
    tolerance: 2,
    outline: linear(contour.outline),
    windows: contour.windows.map(linear),
    ...(contour.islands?.length
      ? {
          islands: contour.islands.map((r) => ({
            outline: linear(r.outline),
            windows: r.windows.map(linear),
          })),
        }
      : {}),
  };
}

function linear(points: Vec2[]): ContourPath {
  return simplify(points).map((point) => ({ point: [...point] }));
}
function pathData(path: ContourPath) {
  if (!path.length) return '';
  let d = 'M' + path[0].point.join(',');
  for (let i = 0; i < path.length; i++) {
    const a = path[i],
      b = path[(i + 1) % path.length];
    d +=
      a.outgoing || b.incoming
        ? 'C' +
          [a.outgoing || a.point, b.incoming || b.point, b.point]
            .map((p) => p.join(','))
            .join(' ')
        : 'L' + b.point.join(',');
  }
  return d + 'Z';
}
function move(path: ContourPath, index: number, position: Vec2) {
  const knot = path[index],
    delta: Vec2 = [position[0] - knot.point[0], position[1] - knot.point[1]];
  knot.point = [...position];
  for (const key of ['incoming', 'outgoing'] as const)
    if (knot[key])
      knot[key] = [knot[key][0] + delta[0], knot[key][1] + delta[1]];
}
function split(path: ContourPath, index: number, t = 0.5) {
  if (t <= 0 || t >= 1 || !Number.isFinite(t)) throw Error('曲线分点参数无效');
  const a = path[index],
    b = path[(index + 1) % path.length];
  if (!a || !b) throw Error('请选择线段');
  if (!a.outgoing && !b.incoming) {
    path.splice(index + 1, 0, { point: mix(a.point, b.point, t) });
    return;
  }
  const ab = mix(a.point, a.outgoing || a.point, t),
    bc = mix(a.outgoing || a.point, b.incoming || b.point, t),
    cd = mix(b.incoming || b.point, b.point, t),
    abc = mix(ab, bc, t),
    bcd = mix(bc, cd, t);
  a.outgoing = ab;
  b.incoming = cd;
  path.splice(index + 1, 0, {
    point: mix(abc, bcd, t),
    incoming: abc,
    outgoing: bcd,
  });
}
function smooth(path: ContourPath, index: number) {
  const node = path[index],
    a = path[(index + path.length - 1) % path.length].point,
    b = path[(index + 1) % path.length].point,
    length = distance(a, b),
    r = Math.min(distance(a, node.point), distance(b, node.point)) / 3;
  if (length < 0.1) throw Error('相邻锚点距离过小');
  const delta: Vec2 = [
    ((b[0] - a[0]) * r) / length,
    ((b[1] - a[1]) * r) / length,
  ];
  node.incoming = [node.point[0] - delta[0], node.point[1] - delta[1]];
  node.outgoing = [node.point[0] + delta[0], node.point[1] + delta[1]];
}
const api = {
  regions: G.regions,
  rings: G.rings,
  validate,
  compile,
  fromContour,
  linear,
  flatten,
  pathData,
  move,
  split,
  smooth,
  mix,
};

export default api;
