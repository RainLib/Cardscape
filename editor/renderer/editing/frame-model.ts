import type {
  CardContour,
  FrameStyle,
  FrameMesh,
  Vec2,
} from '../../shared/render-models';
/* Shared outline, aperture and bevel geometry for 2D, WebGL and exported cards. */
import importedCardFrameRaster from './frame-raster.ts';
import contourPaths from './contour-path-model.ts';
import contours from './contour-geometry.ts';
import fields from './contour-field-model.ts';
import contourBevel from './contour-bevel-model.ts';

const api = (() => {
  'use strict';
  const defaults: FrameStyle = {
    name: 'Snap 切角卡框',
    shape: 'rect',
    width: 24,
    corner: 48,
    depth: 26,
    bevel: 5,
    color: '#88734f',
    accent: '#d4ba87',
    finish: 'metal',
    animation: 'none',
    animationSpeed: 0.6,
  };
  const shapes = ['rect'],
    finishes = [
      'flat',
      'metal',
      'glow',
      'cosmic',
      'distressed',
      'web',
      'candy',
      'ice',
      'snow',
      'wrapping',
      'fire',
      'fire-iridescent',
      'chains',
      'glyphs',
      'refraction',
      'overloaded',
      'neonnights',
      'distressed-copper',
      'distressed-rainbow',
      'orbit-silver',
      'twin-aurora',
      'pax',
      'brains',
      'candy-halloween',
      'halloween-stickers',
    ],
    animations = ['none', 'pulse', 'flow', 'infinity'];
  // Legacy style names remain readable; custom geometry is independent of this enum.
  const legacyShapes = ['rect', 'rounded', 'cut', 'arch', 'oval', 'circle'];
  const resolve = (
    doc?: { frameStyle?: Partial<FrameStyle> } | null,
  ): FrameStyle => ({ ...defaults, ...doc?.frameStyle, shape: 'rect' });
  function validateContour(value: unknown): CardContour {
    const typed = contours.validate(value);
    if (typed.paths) {
      const baked = contourPaths.compile(typed.paths);
      const a = contours.rings(baked),
        b = contours.rings(typed);
      if (
        a.length !== b.length ||
        JSON.stringify(contours.regions(typed).map((r) => r.windows.length)) !==
          JSON.stringify(
            contours.regions(baked).map((r) => r.windows.length),
          ) ||
        a.some(
          (r, i) =>
            r.length !== b[i].length ||
            r.some(
              (p, j) => Math.hypot(p[0] - b[i][j][0], p[1] - b[i][j][1]) > 1e-6,
            ),
        )
      )
        throw Error('曲线与采样轮廓不一致，请重新应用轮廓');
    }
    return typed;
  }
  function contourUniforms(style: FrameStyle) {
    const edges = new Float32Array(64 * 4);
    let count = 0;
    if (style.contour && !contours.complex(style.contour))
      for (const ring of contours.rings(style.contour))
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          edges.set(
            [
              a[0] / 1024 - 0.5,
              0.75 - a[1] / 1024,
              b[0] / 1024 - 0.5,
              0.75 - b[1] / 1024,
            ],
            count++ * 4,
          );
        }
    return {
      edges,
      counts: [
        style.contour?.outline.length || 0,
        style.contour ? Math.max(1, count) : 0,
      ],
    };
  }
  function windowPath(
    ctx: CanvasRenderingContext2D,
    style: FrameStyle,
    append = false,
  ) {
    if (!append) ctx.beginPath();
    for (const ring of (style.contour
      ? contours.apertures(style.contour)
      : undefined) || [contour(style, style.width)]) {
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    }
  }
  function validateStyle(value: unknown): asserts value is Partial<FrameStyle> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('边框样式参数无效');
    const s = value as Record<string, unknown>;
    if (s.contour !== undefined) validateContour(s.contour);
    if (
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 80 ||
      typeof s.shape !== 'string' ||
      !legacyShapes.includes(s.shape) ||
      typeof s.finish !== 'string' ||
      !finishes.includes(s.finish) ||
      ![s.color, s.accent].every(
        (c) => typeof c === 'string' && /^#[a-fA-F0-9]{6}$/.test(c),
      ) ||
      !(
        [
          [s.width, 4, 100],
          [s.corner, 0, 300],
          [s.depth, 8, 180],
          [s.bevel, 0, 16],
        ] as [unknown, number, number][]
      ).every(
        ([v, a, b]) =>
          typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b,
      )
    )
      throw Error('边框样式参数无效');
    if (
      (s.animation !== undefined &&
        (typeof s.animation !== 'string' ||
          !animations.includes(s.animation))) ||
      (s.animationSpeed !== undefined &&
        (typeof s.animationSpeed !== 'number' ||
          !Number.isFinite(s.animationSpeed) ||
          s.animationSpeed < 0 ||
          s.animationSpeed > 3))
    )
      throw Error('边框动画无效');
  }
  function validate(doc: { frameStyle?: unknown; frameStyles?: unknown }) {
    if (doc.frameStyle !== undefined) {
      validateStyle(doc.frameStyle);
      const style = { ...defaults, ...doc.frameStyle },
        edge = bevel(style);
      // Reject an over-budget bevel before the document transaction is applied.
      if (style.contour && edge > 0)
        contourBevel.create(style.contour, edge, depths(style).front);
    }
    if (doc.frameStyles !== undefined) {
      if (!Array.isArray(doc.frameStyles) || doc.frameStyles.length > 24)
        throw Error('边框样式数量超限');
      const ids = new Set<string>();
      for (const s of doc.frameStyles) {
        validateStyle(s);
        if (
          typeof s.id !== 'string' ||
          !/^[\w-]{1,100}$/.test(s.id) ||
          ids.has(s.id)
        )
          throw Error('边框样式 ID 无效');
        ids.add(s.id);
      }
    }
  }
  // Coordinates are master-image pixels. Inner apertures are inset from the same outline.
  function contains(style: FrameStyle, x: number, y: number, inset = 0) {
    if (style.contour)
      return inset > 0
        ? contours.contains(style.contour, [x, y], true)
        : contours.contains(style.contour, [x, y]);
    const cut = Math.max(0, style.corner - (2 - Math.SQRT2) * inset),
      epsilon = 1e-7;
    return (
      x >= inset - epsilon &&
      x <= 1024 - inset + epsilon &&
      y >= inset - epsilon &&
      y <= 1536 - inset + epsilon &&
      Math.min(x + y, 1024 - x + y, x + 1536 - y, 2560 - x - y) >=
        2 * inset + cut - epsilon
    );
  }
  function contour(style: FrameStyle, inset = 0): Vec2[] {
    if (style.contour)
      return (
        (inset > 0 ? style.contour.windows[0] : style.contour.outline) || []
      ).map((p) => [...p]);
    const cut = Math.max(0, style.corner - (2 - Math.SQRT2) * inset),
      l = inset,
      r = 1024 - inset,
      t = inset,
      b = 1536 - inset;
    return [
      [r, b - cut],
      [r - cut, b],
      [l + cut, b],
      [l, b - cut],
      [l, t + cut],
      [l + cut, t],
      [r - cut, t],
      [r, t + cut],
    ];
  }
  function path(ctx: CanvasRenderingContext2D, points: readonly Vec2[]) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function clip(
    ctx: CanvasRenderingContext2D,
    style: FrameStyle,
    inset = style.width,
  ) {
    if (style.contour && inset > 0) windowPath(ctx, style);
    else if (style.contour) {
      ctx.beginPath();
      for (const ring of contours.silhouette(style.contour)) {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
    } else path(ctx, contour(style, inset));
    ctx.clip('evenodd');
  }
  function draw(ctx: CanvasRenderingContext2D, style: FrameStyle) {
    if (typeof window === 'object' && importedCardFrameRaster?.draw(ctx, style))
      return;
    if (style.contour) {
      ctx.save();
      ctx.beginPath();
      for (const ring of contours.rings(style.contour)) {
        ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
      const gradient = ctx.createLinearGradient(0, 0, 1024, 1536);
      gradient.addColorStop(0, style.accent);
      gradient.addColorStop(1, style.color);
      ctx.fillStyle = gradient;
      ctx.fill('evenodd');
      ctx.restore();
      return;
    }
    const outer = contour(style),
      inner = contour(style, style.width);
    ctx.save();
    path(ctx, outer);
    inner
      .slice()
      .reverse()
      .forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (style.finish === 'chains') {
      ctx.clip('evenodd');
      const mid = contour(style, style.width / 2),
        segments = mid.map((p, i) => {
          const next = mid[(i + 1) % mid.length];
          return {
            p,
            next,
            length: Math.hypot(next[0] - p[0], next[1] - p[1]),
          };
        }),
        length = segments.reduce((n, s) => n + s.length, 0);
      for (let i = 0; i < 144; i++) {
        let at = (length * i) / 144,
          segment = segments[0];
        for (const s of segments) {
          segment = s;
          if (at <= s.length) break;
          at -= s.length;
        }
        const t = at / segment.length,
          angle = Math.atan2(
            segment.next[1] - segment.p[1],
            segment.next[0] - segment.p[0],
          );
        ctx.save();
        ctx.translate(
          segment.p[0] + (segment.next[0] - segment.p[0]) * t,
          segment.p[1] + (segment.next[1] - segment.p[1]) * t,
        );
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          (length / 144) * 0.62,
          style.width * (i % 2 ? 0.12 : 0.28),
          0,
          0,
          Math.PI * 2,
        );
        ctx.lineWidth = style.width * 0.17;
        ctx.strokeStyle = style.color;
        ctx.stroke();
        ctx.lineWidth = style.width * 0.08;
        ctx.strokeStyle = style.accent;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    let fill: string | CanvasGradient = style.color;
    if (style.finish !== 'flat') {
      const g = ctx.createLinearGradient(0, 0, 1024, 1536);
      g.addColorStop(0, style.accent);
      g.addColorStop(0.28, style.color);
      g.addColorStop(0.52, style.accent);
      g.addColorStop(0.62, style.color);
      g.addColorStop(1, style.accent);
      fill = g;
    }
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = Math.max(1, Math.min(style.bevel, style.width / 3));
    path(ctx, contour(style, Math.max(1, style.bevel / 2)));
    ctx.stroke();
    path(ctx, contour(style, style.width - Math.max(1, style.bevel / 2)));
    ctx.stroke();
    ctx.restore();
  }
  function depths(style: FrameStyle) {
    const front = 0.045,
      back = front - style.depth / 1024,
      inset = front - Math.min((style.depth / 1024) * 0.35, 0.04);
    return { front, back, inset, background: back + (inset - back) * 0.2 };
  }
  function geometry(style: FrameStyle) {
    if (style.contour) {
      const { front, back } = depths(style),
        b = bevel(style),
        quad = (z: number, pad = 0): FrameMesh => ({
          positions: [
            -0.5,
            -0.75,
            z,
            0.5,
            -0.75,
            z,
            -0.5,
            0.75,
            z,
            0.5,
            0.75,
            z,
          ],
          uv: [
            -pad / 1024,
            1 + pad / 1536,
            1 + pad / 1024,
            1 + pad / 1536,
            -pad / 1024,
            -pad / 1536,
            1 + pad / 1024,
            -pad / 1536,
          ],
          weights: [0, 0, 0.75, 0, 0, 0, 0.75, 0, 0, 0, 0.75, 0, 0, 0, 0.75, 0],
          indices: [0, 1, 2, 2, 1, 3],
        }),
        sides: FrameMesh = { positions: [], uv: [], weights: [], indices: [] };
      const rim =
          b > 0 ? contourBevel.create(style.contour, b, front) : quad(front),
        rear = {
          ...rim,
          positions: rim.positions.map((v, i) =>
            i % 3 === 2 ? front + back - v : v,
          ),
          indices: rim.indices.map(
            (_, i, a) => a[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i],
          ),
        },
        aura = quad(front - b / 1024 - 0.001, auraPadding(style));
      // Padding belongs to actual geometry as well as its registered UVs.
      aura.positions = aura.positions.map((v, i) =>
        i % 3 === 2 ? v : v + (Math.sign(v) * auraPadding(style)) / 1024,
      );
      const walls = contours.regions(style.contour).flatMap((region) =>
        [region.outline, ...region.windows].map((ring, index) => {
          const area = ring.reduce((n, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return n + p[0] * q[1] - q[0] * p[1];
          }, 0);
          return area > 0 === (index === 0) ? ring : ring.slice().reverse();
        }),
      );
      for (const ring of walls)
        for (let i = 0; i < ring.length; i++) {
          const n = sides.positions.length / 3;
          for (const p of [ring[i], ring[(i + 1) % ring.length]])
            for (const z of [back + b / 1024, front - b / 1024]) {
              sides.positions.push(p[0] / 1024 - 0.5, 0.75 - p[1] / 1024, z);
              sides.uv.push(p[0] / 1024, p[1] / 1536);
              sides.weights.push(0, 0, 0.5, 0);
            }
          sides.indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
        }
      return {
        rim,
        rear,
        sides,
        aura,
        front,
        back,
      };
    }
    const edgeBevel = bevel(style),
      { front, back } = depths(style),
      outer = contour(style),
      top = contour(style, edgeBevel),
      bottom = contour(style, style.width - edgeBevel),
      inner = contour(style, style.width),
      rim: FrameMesh = { positions: [], uv: [], weights: [], indices: [] },
      sides: FrameMesh = { positions: [], uv: [], weights: [], indices: [] };
    function band(
      g: FrameMesh,
      left: Vec2[],
      right: Vec2[],
      z0: number,
      z1: number,
      shade0: number,
      shade1: number,
    ) {
      const start = g.positions.length / 3;
      for (let i = 0; i < left.length; i++) {
        for (const [p, z, shade] of [
          [left[i], z0, shade0],
          [right[i], z1, shade1],
        ] as const) {
          g.positions.push(p[0] / 1024 - 0.5, 0.75 - p[1] / 1024, z);
          g.uv.push(p[0] / 1024, p[1] / 1536);
          g.weights.push(0, 0, shade, 0);
        }
      }
      for (let i = 0; i < left.length; i++) {
        const a = start + i * 2,
          b = start + ((i + 1) % left.length) * 2;
        g.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    band(rim, outer, top, front - edgeBevel / 1024, front, 0.3, 1);
    band(rim, top, bottom, front, front, 0.75, 0.75);
    band(rim, bottom, inner, front, front - edgeBevel / 1024, 1, 0.3);
    band(
      sides,
      outer,
      outer,
      back + edgeBevel / 1024,
      front - edgeBevel / 1024,
      0.22,
      0.5,
    );
    band(
      sides,
      inner,
      inner,
      back + edgeBevel / 1024,
      front - edgeBevel / 1024,
      0.22,
      0.5,
    );
    const rear = {
      ...rim,
      positions: rim.positions.map((v, i) =>
        i % 3 === 2 ? front + back - v : v,
      ),
    };
    // Neon spills into the aperture; other finishes keep their original outer band.
    const aura: FrameMesh = { positions: [], uv: [], weights: [], indices: [] };
    band(
      aura,
      contour(style, -auraPadding(style)),
      contour(style, auraInset(style)),
      front - 0.001,
      front - 0.001,
      0,
      0,
    );
    return { rim, rear, sides, aura, back, front };
  }
  const auraPadding = (style: FrameStyle) =>
    style.finish === 'halloween-stickers' ? 144 : 88;
  const auraInset = (style: FrameStyle) =>
    style.finish === 'glow' ? style.width + 56 : 0;
  const hasAura = (style: FrameStyle) =>
    [
      'glow',
      'cosmic',
      'ice',
      'fire',
      'fire-iridescent',
      'glyphs',
      'refraction',
      'overloaded',
      'neonnights',
      'pax',
      'candy-halloween',
      'halloween-stickers',
    ].includes(style.finish);
  function bevel(style: FrameStyle) {
    const value = Math.min(
      style.bevel,
      style.depth * 0.45,
      style.contour ? 16 : style.width * 0.4,
    );
    return value < 0.01 ? 0 : value;
  }
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return {
    defaults,
    shapes,
    finishes,
    animations,
    resolve,
    validate,
    validateContour,
    contourUniforms,
    distanceField: (style: FrameStyle) =>
      style.contour ? fields.create(style.contour) : null,
    windowPath,
    contains,
    contour,
    path,
    clip,
    draw,
    geometry,
    depths,
    rgb,
    hasAura,
    auraPadding,
    bevel,
    auraInset,
  };
})();

export default api;
