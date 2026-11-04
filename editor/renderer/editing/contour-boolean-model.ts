import type {
  CardContour,
  ContourPath,
  ContourPaths,
  ContourRegion,
  Vec2,
} from '../../shared/render-models';
import {
  union,
  difference,
  intersection,
  xor,
} from './contour-boolean-engine.ts';
import G from './contour-geometry.ts';
import P from './contour-path-model.ts';
type Operation = 'union' | 'difference' | 'intersection' | 'xor';
function operate(
  a: CardContour,
  b: CardContour,
  operation: Operation,
): CardContour {
  G.validate(a);
  G.validate(b);
  const input = (c: CardContour) =>
    G.regions(c).map((r) => [r.outline, ...r.windows]);
  const algorithms = { union, difference, intersection, xor };
  const output = algorithms[operation](input(a), input(b));
  const regions: ContourRegion[] = output.map((p) => {
    const rings = p.map((r) =>
      P.linear(
        r
          .slice(0, -1)
          .map(
            ([x, y]): Vec2 => [
              Math.max(0, Math.min(1024, x)),
              Math.max(0, Math.min(1536, y)),
            ],
          ),
      ).map((n) => n.point),
    );
    return { outline: rings[0], windows: rings.slice(1) };
  });
  const result: CardContour = regions[0]
    ? {
        ...regions[0],
        ...(regions.length > 1 ? { islands: regions.slice(1) } : {}),
      }
    : { outline: [], windows: [] };
  G.validate(result);
  return result;
}
/** Geometry import uses even/odd nesting, preserving source handles. Overlapping
 * paths must first be combined with an explicit operation; no region is dropped. */
function classify(paths: ContourPath[], tolerance = 2): ContourPaths {
  if (!paths.length || paths.length > G.limits.rings)
    throw Error('SVG 需要 1–128 条闭合轮廓');
  const source = paths
    .map((path) => {
      const ring = P.flatten(path, tolerance),
        area = Math.abs(
          ring.reduce((n, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return n + p[0] * q[1] - q[0] * p[1];
          }, 0),
        );
      return { path, ring, area, parent: -1, depth: 0 };
    })
    .sort((a, b) => b.area - a.area);
  const result: ContourPaths = {
      schema: 'card-contour-paths/1',
      tolerance,
      outline: [],
      windows: [],
    },
    regions: Array<{ outline: ContourPath; windows: ContourPath[] }> = [],
    owner = new Map<number, number>();
  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    for (let j = i - 1; j >= 0; j--)
      if (item.ring.every((p) => G.inside(source[j].ring, p, false))) {
        item.parent = j;
        item.depth = source[j].depth + 1;
        break;
      }
    if (item.depth % 2 === 0) {
      owner.set(i, regions.length);
      regions.push({ outline: item.path, windows: [] });
    } else {
      const region = owner.get(item.parent);
      if (region === undefined) throw Error('SVG 轮廓嵌套无效');
      regions[region].windows.push(item.path);
    }
  }
  Object.assign(
    result,
    regions[0],
    regions.length > 1 ? { islands: regions.slice(1) } : {},
  );
  G.validate(P.compile(result));
  return structuredClone(result);
}
export default { operate, classify };
