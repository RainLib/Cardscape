import type { CardContour, Vec2 } from '../../shared/render-models';
interface Region<T> {
  outline: T[];
  windows: T[][];
}
interface Shape<T> extends Region<T> {
  islands?: Region<T>[];
}
const limits = { points: 4096, rings: 128 } as const;
function regions<T>(shape: Shape<T>): Region<T>[] {
  return [...(shape.outline.length ? [shape] : []), ...(shape.islands || [])];
}
function rings<T>(shape: Shape<T>): T[][] {
  return regions(shape).flatMap((r) => [r.outline, ...r.windows]);
}
const cross = (a: Vec2, b: Vec2, c: Vec2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function on(a: Vec2, b: Vec2, p: Vec2) {
  return (
    Math.abs(cross(a, b, p)) < 1e-8 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-8 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-8 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-8 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-8
  );
}
function intersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2, proper = false) {
  if (
    cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0
  )
    return true;
  return !proper && (on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b));
}
function sharedEdge(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  if (Math.abs(cross(a, b, c)) > 1e-8 || Math.abs(cross(a, b, d)) > 1e-8)
    return false;
  const axis = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0 : 1;
  return (
    Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
      Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) >
    1e-6
  );
}
function inside(ring: readonly Vec2[], p: Vec2, boundary = true) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    if (on(a, b, p)) return boundary;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
function material(region: Region<Vec2>, p: Vec2, boundary = true) {
  return (
    inside(region.outline, p, boundary) &&
    !region.windows.some((h) => inside(h, p, !boundary))
  );
}
function contains(shape: CardContour, p: Vec2, aperture = false) {
  const all = regions(shape),
    outer = all.some((r) => inside(r.outline, p));
  return aperture ? outer && !all.some((r) => material(r, p)) : outer;
}
function validate(value: unknown): CardContour {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (
    !object(value) ||
    !Array.isArray(value.outline) ||
    !Array.isArray(value.windows) ||
    (value.islands !== undefined &&
      (!Array.isArray(value.islands) || value.islands.length >= limits.rings))
  )
    throw Error('卡框轮廓数据无效');
  const raw = [value, ...((value.islands as unknown[]) || [])];
  let points = 0,
    count = 0;
  for (const region of raw) {
    if (
      !object(region) ||
      !Array.isArray(region.outline) ||
      !Array.isArray(region.windows) ||
      region.windows.length >= limits.rings
    )
      throw Error('卡框区域无效；总计最多 128 环');
    if (!region.outline.length && raw.length === 1 && !region.windows.length)
      continue;
    for (const ring of [region.outline, ...region.windows]) {
      if (
        !Array.isArray(ring) ||
        ring.length < 3 ||
        (points += ring.length) > limits.points ||
        ++count > limits.rings
      )
        throw Error('轮廓每环至少 3 点，总计最多 4096 点、128 环');
      for (const p of ring)
        if (
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
          p[0] < 0 ||
          p[0] > 1024 ||
          p[1] < 0 ||
          p[1] > 1536
        )
          throw Error('卡框轮廓坐标超出画布');
      const polygon = ring as Vec2[];
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          c = polygon[(i + 2) % polygon.length];
        if (
          Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 ||
          Math.abs(cross(a, b, c)) < 1e-8
        )
          throw Error('卡框轮廓包含重复或共线顶点');
        area += a[0] * b[1] - b[0] * a[1];
        for (let j = i + 1; j < polygon.length; j++)
          if (
            j !== i + 1 &&
            !(i === 0 && j === polygon.length - 1) &&
            intersects(a, b, polygon[j], polygon[(j + 1) % polygon.length])
          )
            throw Error('卡框轮廓不能自交');
      }
      if (Math.abs(area) < 1e-6) throw Error('卡框轮廓面积过小');
    }
  }
  const shape = value as unknown as CardContour,
    all = regions(shape);
  for (const r of all) {
    const rs = [r.outline, ...r.windows];
    for (let i = 1; i < rs.length; i++) {
      if (!rs[i].every((p) => inside(r.outline, p, false)))
        throw Error('卡框窗口必须位于外轮廓内部');
      for (let j = 0; j < i; j++) {
        for (let a = 0; a < rs[i].length; a++)
          for (let b = 0; b < rs[j].length; b++)
            if (
              intersects(
                rs[i][a],
                rs[i][(a + 1) % rs[i].length],
                rs[j][b],
                rs[j][(b + 1) % rs[j].length],
              )
            )
              throw Error('卡框窗口不能相交');
        if (j > 0 && (inside(rs[i], rs[j][0]) || inside(rs[j], rs[i][0])))
          throw Error('卡框窗口不能重叠或嵌套');
      }
    }
  }
  for (let i = 0; i < all.length; i++)
    for (let j = 0; j < i; j++) {
      const a = all[i],
        b = all[j],
        ar = [a.outline, ...a.windows],
        br = [b.outline, ...b.windows];
      for (const x of ar)
        for (const y of br)
          for (let k = 0; k < x.length; k++)
            for (let m = 0; m < y.length; m++)
              if (
                intersects(
                  x[k],
                  x[(k + 1) % x.length],
                  y[m],
                  y[(m + 1) % y.length],
                  true,
                ) ||
                sharedEdge(
                  x[k],
                  x[(k + 1) % x.length],
                  y[m],
                  y[(m + 1) % y.length],
                )
              )
                throw Error('卡框实体区域不能相交或共边，请先使用并集');
      // Interior-side probes also catch coincident edges and contained duplicates;
      // separate regions are allowed to meet at one point or live inside a hole.
      for (const r of [a, b])
        for (const ring of [r.outline, ...r.windows])
          for (let k = 0; k < ring.length; k++) {
            const p = ring[k],
              q = ring[(k + 1) % ring.length],
              dx = q[0] - p[0],
              dy = q[1] - p[1],
              len = Math.hypot(dx, dy);
            const e = Math.min(1e-4, len * 0.001) / len;
            for (const sign of [-1, 1]) {
              const sample: Vec2 = [
                (p[0] + q[0]) / 2 + dy * e * sign,
                (p[1] + q[1]) / 2 - dx * e * sign,
              ];
              if (material(a, sample, false) && material(b, sample, false))
                throw Error('卡框实体区域不能重叠');
            }
          }
    }
  return shape;
}
function key(shape: CardContour) {
  return JSON.stringify(
    regions(shape).map(({ outline, windows }) => ({ outline, windows })),
  );
}
function silhouette(shape: CardContour) {
  const all = regions(shape);
  return all
    .filter(
      (r) =>
        !all.some(
          (other) => other !== r && inside(other.outline, r.outline[0], false),
        ),
    )
    .map((r) => r.outline);
}
function apertures(shape: CardContour) {
  const all = regions(shape);
  return [
    ...all.flatMap((r) => r.windows),
    ...all
      .filter((r) =>
        all.some(
          (other) => other !== r && inside(other.outline, r.outline[0], false),
        ),
      )
      .map((r) => r.outline),
  ];
}
function complex(shape: CardContour) {
  return (
    !!shape.islands?.length ||
    rings(shape).reduce((n, r) => n + r.length, 0) > 64 ||
    !shape.outline.length
  );
}
export default {
  limits,
  regions,
  rings,
  inside,
  material,
  contains,
  validate,
  key,
  complex,
  silhouette,
  apertures,
};
