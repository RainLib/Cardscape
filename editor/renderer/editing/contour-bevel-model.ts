import type {
  CardContour,
  ContourRegion,
  FrameMesh,
  Vec2,
} from '../../shared/render-models';
import G from './contour-geometry.ts';
import D from './contour-field-model.ts';
import { plan, triangulate } from './contour-bevel-engine.ts';
const cache = new Map<string, FrameMesh>();
const pointKey = (p: Vec2) =>
  `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
/** Build an actual sloping cap, including collapsed inset regions. Added
 * interior vertices retain narrow-strip ridges instead of flattening them. */
function create(shape: CardContour, bevel: number, front: number): FrameMesh {
  const contour = G,
    distances = D;
  const key = contour.key(shape) + ':' + bevel + ':' + front,
    existing = cache.get(key);
  if (existing) return existing;
  const field = distances.create(shape),
    profiles = plan(shape, bevel),
    original = new Map<string, Vec2>();
  for (const ring of contour.rings(shape))
    for (const p of ring) original.set(pointKey(p), p);
  const signed = (x: number, y: number) => distances.material(field, x, y);
  const grid = new Float32Array(1026 * 1538);
  for (let y = -1; y <= 1536; y++)
    for (let x = -1; x <= 1024; x++)
      grid[(y + 1) * 1026 + x + 1] = signed(x + 0.5, y + 0.5);
  const height = (p: Vec2) => Math.max(0, Math.min(bevel, signed(p[0], p[1])));
  const mesh: FrameMesh = { positions: [], uv: [], weights: [], indices: [] },
    vertices = new Map<string, number>();
  function vertex(point: Vec2, at: number) {
    const p = original.get(pointKey(point)) || point,
      k = pointKey(p) + ':' + Math.round(at * 10000);
    let id = vertices.get(k);
    if (id === undefined) {
      id = mesh.positions.length / 3;
      if (id >= 65000)
        throw Error('倒角网格超过 65000 顶点，请简化轮廓或减小倒角');
      vertices.set(k, id);
      mesh.positions.push(
        p[0] / 1024 - 0.5,
        0.75 - p[1] / 1024,
        front - (bevel - at) / 1024,
      );
      mesh.uv.push(p[0] / 1024, p[1] / 1536);
      mesh.weights.push(0, 0, 0.75, 0);
    }
    return id;
  }
  function fill(region: ContourRegion, flat: boolean) {
    let seeds: Vec2[] = [];
    if (!flat) {
      // The signed-distance ridge is needed when an inset has disappeared.
      const candidates: Array<{ p: Vec2; strength: number }> = [];
      const xs = region.outline.map((p) => p[0]),
        ys = region.outline.map((p) => p[1]);
      const minX = Math.max(0, Math.floor(Math.min(...xs))),
        maxX = Math.min(1023, Math.ceil(Math.max(...xs))),
        minY = Math.max(0, Math.floor(Math.min(...ys))),
        maxY = Math.min(1535, Math.ceil(Math.max(...ys)));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          if (x % 4 !== 0 && y % 4 !== 0) continue;
          const p: Vec2 = [x + 0.5, y + 0.5],
            at = (y + 1) * 1026 + x + 1,
            d = grid[at];
          if (d <= 0.1 || d >= bevel - 0.3) continue;
          let strength = 0;
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1],
          ])
            strength = Math.max(
              strength,
              2 * d - grid[at - dy * 1026 - dx] - grid[at + dy * 1026 + dx],
            );
          if (strength > 0.25 && contour.material(region, p, false))
            candidates.push({ p, strength });
        }
      candidates.sort((a, b) => b.strength - a.strength);
      seeds = candidates.slice(0, 8192).map((c) => c.p);
    }
    let output = triangulate(region, seeds),
      error = 0,
      worst: unknown;
    for (let pass = 0; pass < 14; pass++) {
      const boundaryCount =
          region.outline.length +
          region.windows.reduce((n, r) => n + r.length, 0),
        topKeys = new Set(
          profiles.top
            .flatMap((r) => [r.outline, ...r.windows])
            .flat()
            .map(pointKey),
        );
      const heights = output.points.map((p, i) =>
        flat || topKeys.has(pointKey(p))
          ? bevel
          : i < boundaryCount
            ? 0
            : height(p),
      );
      const additions: Vec2[] = [],
        known = new Set(output.points.map(pointKey));
      error = 0;
      if (!flat)
        for (let k = 0; k < output.indices.length; k += 3) {
          const ids = output.indices.slice(k, k + 3),
            points = ids.map((i) => output.points[i]),
            z = ids.map((i) => heights[i]);
          for (const weights of [
            [1 / 3, 1 / 3, 1 / 3],
            [0.5, 0.5, 0],
            [0, 0.5, 0.5],
            [0.5, 0, 0.5],
          ]) {
            const p: Vec2 = [0, 0];
            let predicted = 0;
            for (let i = 0; i < 3; i++) {
              p[0] += points[i][0] * weights[i];
              p[1] += points[i][1] * weights[i];
              predicted += z[i] * weights[i];
            }
            const deviation = Math.abs(height(p) - predicted);
            if (deviation > error) {
              error = deviation;
              worst = {
                point: p,
                expected: height(p),
                predicted,
                triangle: points,
                heights: z,
                seeds: seeds.length,
                pass,
              };
            }
            if (
              deviation > 1 &&
              !known.has(pointKey(p)) &&
              contour.material(region, p, false)
            ) {
              known.add(pointKey(p));
              additions.push(p);
            }
          }
        }
      if (additions.length && pass < 13) {
        seeds.push(...additions);
        if (seeds.length > 24000) throw Error('倒角细分超过预算，请简化轮廓');
        output = triangulate(region, seeds);
        continue;
      }
      if (error > 1.2)
        throw Error('倒角轮廓过细，无法在 1.2 像素误差内构建，请减小倒角', {
          cause: worst,
        });
      const ids = output.points.map((p, i) => vertex(p, heights[i]));
      for (let i = 0; i < output.indices.length; i += 3) {
        const [a, b, c] = output.indices.slice(i, i + 3),
          p = output.points;
        const area =
          (p[b][0] - p[a][0]) * (p[c][1] - p[a][1]) -
          (p[b][1] - p[a][1]) * (p[c][0] - p[a][0]);
        mesh.indices.push(ids[a], ids[area > 0 ? c : b], ids[area > 0 ? b : c]);
      }
      return;
    }
  }
  for (const region of profiles.top) fill(region, true);
  for (const region of profiles.band) fill(region, false);
  cache.set(key, mesh);
  while (cache.size > 4) cache.delete(cache.keys().next().value!);
  return mesh;
}
export default { create };
