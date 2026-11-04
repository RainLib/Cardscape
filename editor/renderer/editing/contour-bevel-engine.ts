import { Point, SweepContext } from 'poly2tri';
import type { IPointLike } from 'poly2tri';
import {
  inflatePathsD,
  booleanOpDWithPolyTree,
  PolyTreeD,
  ClipType,
  FillRule,
  JoinType,
  EndType,
} from 'clipper2-ts';
import type { PolyPathD, PathsD } from 'clipper2-ts';
import type {
  CardContour,
  ContourRegion,
  Vec2,
} from '../../shared/render-models';
function group(paths: PathsD, clip: PathsD | null = null) {
  const tree = new PolyTreeD(),
    result: ContourRegion[] = [];
  booleanOpDWithPolyTree(
    clip ? ClipType.Difference : ClipType.Union,
    paths,
    clip,
    tree,
    FillRule.NonZero,
    4,
  );
  const points = (node: PolyPathD): Vec2[] =>
    (node.poly || []).map((p) => [p.x, p.y]);
  function visit(node: PolyPathD) {
    for (let i = 0; i < node.count; i++) {
      const child = node.child(i);
      if (!child.isHole) {
        const windows: Vec2[][] = [];
        for (let j = 0; j < child.count; j++)
          windows.push(points(child.child(j)));
        result.push({ outline: points(child), windows });
      }
      visit(child);
    }
  }
  visit(tree);
  return result;
}
export function plan(shape: CardContour, bevel: number) {
  const paths: PathsD = [];
  for (const region of [shape, ...(shape.islands || [])])
    for (const [index, ring] of [region.outline, ...region.windows].entries()) {
      if (!ring.length) continue;
      const area = ring.reduce((n, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return n + p[0] * q[1] - q[0] * p[1];
      }, 0);
      const points = area > 0 === (index === 0) ? ring : ring.slice().reverse();
      paths.push(points.map(([x, y]) => ({ x, y })));
    }
  const inset = inflatePathsD(
    paths,
    -bevel,
    JoinType.Round,
    EndType.Polygon,
    2,
    4,
    0.2,
  );
  return { top: group(inset), band: group(paths, inset) };
}
export function triangulate(region: ContourRegion, steiner: Vec2[] = []) {
  const points: Vec2[] = [],
    rings: Point[][] = [],
    ids = new Map<IPointLike, number>(),
    seen = new Set<string>();
  const key = (p: Vec2) =>
    `${Math.round(p[0] * 1e7)},${Math.round(p[1] * 1e7)}`;
  for (const ring of [region.outline, ...region.windows])
    rings.push(
      ring.map((p) => {
        const v = new Point(p[0], p[1]);
        ids.set(v, points.length);
        points.push(p);
        seen.add(key(p));
        return v;
      }),
    );
  const context = new SweepContext(rings[0], { cloneArrays: true });
  context.addHoles(rings.slice(1));
  const inside: Point[] = [];
  for (const p of steiner) {
    if (seen.has(key(p))) continue;
    seen.add(key(p));
    const v = new Point(p[0], p[1]);
    ids.set(v, points.length);
    points.push(p);
    inside.push(v);
  }
  context.addPoints(inside);
  try {
    context.triangulate();
  } catch (cause) {
    throw Error('倒角三角化失败，请简化轮廓或减小倒角', { cause });
  }
  const indices = context.getTriangles().flatMap((t) =>
    t.getPoints().map((p) => {
      const id = ids.get(p);
      if (id === undefined) throw Error('倒角三角化产生未知边界点');
      return id;
    }),
  );
  return { points, indices };
}
