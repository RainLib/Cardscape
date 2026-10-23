import type { FrameStyle, FrameMesh, Vec2 } from '../../shared/render-models';
/* Shared outline, aperture and bevel geometry for 2D, WebGL and exported cards. */
import importedCardFrameRaster from './frame-raster.ts';

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
  // Read earlier projects without rewriting their source; every active frame is rectangular.
  const legacyShapes = ['rect', 'rounded', 'cut', 'arch', 'oval', 'circle'];
  const resolve = (
    doc?: { frameStyle?: Partial<FrameStyle> } | null,
  ): FrameStyle => ({ ...defaults, ...doc?.frameStyle, shape: 'rect' });
  function validateStyle(value: unknown): asserts value is Partial<FrameStyle> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('边框样式参数无效');
    const s = value as Record<string, unknown>;
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
    if (doc.frameStyle !== undefined) validateStyle(doc.frameStyle);
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
    path(ctx, contour(style, inset));
    ctx.clip();
  }
  function draw(ctx: CanvasRenderingContext2D, style: FrameStyle) {
    if (typeof window === 'object' && importedCardFrameRaster?.draw(ctx, style))
      return;
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
    const bevel = Math.min(style.bevel, style.width * 0.4),
      { front, back } = depths(style),
      outer = contour(style),
      top = contour(style, bevel),
      bottom = contour(style, style.width - bevel),
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
    band(rim, outer, top, front - bevel / 1024, front, 0.3, 1);
    band(rim, top, bottom, front, front, 0.75, 0.75);
    band(rim, bottom, inner, front, front - bevel / 1024, 1, 0.3);
    band(sides, outer, outer, back, front - bevel / 1024, 0.22, 0.5);
    band(sides, inner, inner, back, front - bevel / 1024, 0.22, 0.5);
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
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return {
    defaults,
    shapes,
    finishes,
    animations,
    resolve,
    validate,
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
    auraInset,
  };
})();

export default api;
