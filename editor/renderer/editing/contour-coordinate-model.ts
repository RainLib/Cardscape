import type { CardContour, Vec2 } from '../../shared/render-models';
import G from './contour-geometry.ts';
import DT from './contour-distance-transform.ts';
interface Segment {
  a: Vec2;
  dx: number;
  dy: number;
  length: number;
  start: number;
  perimeter: number;
  ring: number;
  window: boolean;
}
/** Every loop starts at its topmost, leftmost vertex and runs clockwise in
 * registered (y-down) pixels. Input winding and first vertex cannot reverse flow. */
function segments(shape: CardContour) {
  const result: Segment[] = [];
  let ringId = 0;
  for (const region of G.regions(shape))
    for (const [index, ring] of [region.outline, ...region.windows].entries()) {
      const points = ring.slice(),
        area = points.reduce((n, p, i) => {
          const q = points[(i + 1) % points.length];
          return n + p[0] * q[1] - q[0] * p[1];
        }, 0);
      if (area < 0) points.reverse();
      let first = 0;
      for (let i = 1; i < points.length; i++)
        if (
          points[i][1] < points[first][1] ||
          (points[i][1] === points[first][1] && points[i][0] < points[first][0])
        )
          first = i;
      const ordered = points.slice(first).concat(points.slice(0, first));
      const perimeter = ordered.reduce((n, p, i) => {
        const q = ordered[(i + 1) % ordered.length];
        return n + Math.hypot(p[0] - q[0], p[1] - q[1]);
      }, 0);
      let start = 0;
      for (let i = 0; i < ordered.length; i++) {
        const a = ordered[i],
          b = ordered[(i + 1) % ordered.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        result.push({
          a,
          dx,
          dy,
          length,
          start,
          perimeter,
          ring: ringId,
          window: index > 0,
        });
        start += length;
      }
      ringId++;
    }
  return result;
}
function create(
  shape: CardContour,
  width: number,
  height: number,
  padding: number,
  step: number,
) {
  const edges = segments(shape),
    sites = new Int32Array(width * height),
    best = new Float32Array(sites.length);
  sites.fill(-1);
  best.fill(Infinity);
  function projection(s: Segment, x: number, y: number) {
    return Math.max(
      0,
      Math.min(
        1,
        ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / (s.length * s.length),
      ),
    );
  }
  for (const [id, s] of edges.entries()) {
    const steps = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(s.dx) / (step * 2), Math.abs(s.dy) / step)),
    );
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(
          (s.a[0] + (s.dx * i) / steps + padding) / (step * 2),
        ),
        y = Math.floor((s.a[1] + (s.dy * i) / steps + padding) / step);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const px = x + dx,
            py = y + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const sx = (px + 0.5) * step * 2 - padding,
            sy = (py + 0.5) * step - padding,
            t = projection(s, sx, sy),
            d = (sx - s.a[0] - s.dx * t) ** 2 + (sy - s.a[1] - s.dy * t) ** 2,
            at = py * width + px;
          if (d < best[at]) {
            best[at] = d;
            sites[at] = id;
          }
        }
    }
  }
  const nearest = DT.transform(
      sites,
      width,
      height,
      undefined,
      step * 2,
      step,
    ).labels!,
    data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x,
        s = edges[nearest[at]],
        k = at * 4;
      if (s) {
        const t = projection(
          s,
          (x + 0.5) * step * 2 - padding,
          (y + 0.5) * step - padding,
        );
        const phase =
          Math.round(((s.start + t * s.length) / s.perimeter) * 65536) & 65535;
        data[k] = phase >> 8;
        data[k + 1] = phase & 255;
        data[k + 2] = s.ring * 2 + Number(s.window);
      }
      data[k + 3] = 255;
    }
  return data;
}
export default { create, segments };
