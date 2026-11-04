const { test } = require('node:test'),
  assert = require('node:assert/strict');
const P = require('../dist/renderer/contour-path-model.js'),
  S = require('../dist/renderer/contour-svg-model.js'),
  F = require('../dist/renderer/frame-model.js');
function fixture() {
  return P.fromContour({
    outline: [
      [40, 0],
      [984, 0],
      [1024, 40],
      [1024, 1496],
      [984, 1536],
      [40, 1536],
      [0, 1496],
      [0, 40],
    ],
    windows: [
      [
        [100, 120],
        [924, 120],
        [924, 1400],
        [100, 1400],
      ],
    ],
  });
}
function cubic(a, b, c, d, t) {
  return [0, 1].map(
    (i) =>
      (1 - t) ** 3 * a[i] +
      3 * (1 - t) ** 2 * t * b[i] +
      3 * (1 - t) * t * t * c[i] +
      t ** 3 * d[i],
  );
}
test('editable ellipse handles bake deterministically within the GPU budget and survive JSON', () => {
  const p = fixture();
  p.windows = S.parsePath(
    'M912 720 A400 570 0 1 1 112 720 A400 570 0 1 1 912 720Z',
  );
  const c = P.compile(p);
  F.validateContour(c);
  assert.ok(c.windows[0].length > 8);
  assert.ok(c.windows[0].length + c.outline.length <= 64);
  assert.deepEqual(P.compile(JSON.parse(JSON.stringify(p))), c);
  assert.deepEqual(P.fromContour(c), p);
  const q = JSON.parse(JSON.stringify(c));
  q.windows[0][0][0] -= 1;
  assert.throws(() => F.validateContour(q), /不一致/);
  q.windows[0][0][0] += 1;
  q.paths.windows[0][0].outgoing[0] = NaN;
  assert.throws(() => F.validateContour(q), /手柄/);
});
test('subdivision preserves the exact cubic instead of fitting a new curve', () => {
  const path = [
      { point: [100, 100], outgoing: [200, 0] },
      { point: [800, 100], incoming: [700, 0] },
      { point: [800, 800] },
      { point: [100, 800] },
    ],
    original = structuredClone(path);
  P.split(path, 0, 0.4);
  for (let i = 0; i <= 100; i++) {
    const t = i / 100,
      expected = cubic(
        original[0].point,
        original[0].outgoing,
        original[1].incoming,
        original[1].point,
        t,
      );
    const a = t <= 0.4 ? path[0] : path[1],
      b = t <= 0.4 ? path[1] : path[2],
      local = t <= 0.4 ? t / 0.4 : (t - 0.4) / 0.6,
      actual = cubic(a.point, a.outgoing, b.incoming, b.point, local);
    assert.ok(
      Math.hypot(expected[0] - actual[0], expected[1] - actual[1]) < 1e-8,
    );
  }
});
test('moving anchors translates their handles, and straight extra knots remain editable', () => {
  const p = fixture();
  P.smooth(p.windows[0], 0);
  const before = structuredClone(p.windows[0][0]);
  P.move(p.windows[0], 0, [120, 150]);
  assert.deepEqual(p.windows[0][0].incoming, [
    before.incoming[0] + 20,
    before.incoming[1] + 30,
  ]);
  assert.deepEqual(p.windows[0][0].outgoing, [
    before.outgoing[0] + 20,
    before.outgoing[1] + 30,
  ]);
  const linear = fixture();
  P.split(linear.windows[0], 0);
  const c = P.compile(linear);
  assert.equal(c.paths.windows[0].length, 5);
  assert.equal(c.windows[0].length, 4);
  F.validateContour(c);
});
test('curve flattening reports complexity and invalid metadata without silently dropping handles', () => {
  const p = fixture();
  p.windows = S.parsePath(
    'M912 720 A400 570 0 1 1 112 720 A400 570 0 1 1 912 720Z',
  );
  p.tolerance = 0.25;
  assert.ok(P.compile(p).windows[0].length > 64);
  p.tolerance = 8;
  F.validateContour(P.compile(p));
  for (const change of [
    (p) => (p.tolerance = 0),
    (p) => (p.outline[0].outgoing = [Infinity, 0]),
    (p) => (p.islands = [{}]),
    (p) => (p.outline[1].point = p.outline[0].point),
  ]) {
    const bad = fixture();
    change(bad);
    assert.throws(() => P.compile(bad));
  }
});
test('SVG commands preserve relative moves, implicit lines and reflected control points', () => {
  const path = S.parsePath('m10 20 100 0v100h-100z')[0];
  assert.deepEqual(
    path.map((n) => n.point),
    [
      [10, 20],
      [110, 20],
      [110, 120],
      [10, 120],
    ],
  );
  const cubicPath = S.parsePath(
    'M0 100 C20 0 80 0 100 100 S180 200 200 100 L200 300 H0Z',
  )[0];
  assert.deepEqual(cubicPath[1].outgoing, [120, 200]);
  const q = S.parsePath('M0 100 Q50 0 100 100 T200 100 L200 300 H0Z')[0];
  assert.ok(
    Math.hypot(
      q[1].outgoing[0] - (100 + 100 / 3),
      q[1].outgoing[1] - (100 + 200 / 3),
    ) < 1e-10,
  );
  assert.equal(S.parsePath('M0 0h100v100h-100z M20 20h20v20h-20z').length, 2);
  const afterClose = S.parsePath('M0 0h100v100h-100z l10 10h10v10h-10z');
  assert.equal(afterClose.length, 2);
  assert.deepEqual(afterClose[1][0].point, [0, 0]);
});
test('SVG arcs handle compact flags, radii correction, rotation and zero radii', () => {
  for (const d of [
    'M0 50A50 50 0 01100 50L100 150H0Z',
    'M0 0 A10 10 35 0 1 100 0 L100 100 L0 100Z',
    'M0 0A0 10 0 0 1 100 0L100 100H0Z',
  ]) {
    const paths = S.parsePath(d);
    assert.ok(paths[0].length >= 4);
    for (const n of paths[0])
      for (const p of [n.point, n.incoming, n.outgoing].filter(Boolean))
        assert.ok(p.every(Number.isFinite));
  }
  const circle = S.parsePath(
    'M100 0A100 100 0 1 1 -100 0A100 100 0 1 1 100 0Z',
  )[0];
  for (const n of circle)
    assert.ok(Math.abs(Math.hypot(...n.point) - 100) < 1e-7);
});
test('bad or unclosed SVG data fails without executing or guessing an unsupported command', () => {
  for (const d of [
    'M0 0L10 10',
    'M0 0L10 0M20 20Z',
    'M0 0A10 10 0 2 0 100 100Z',
    'M0 0C10 10 20Z',
    'M0 0X10 10Z',
    'M0 0L1e999 0Z',
  ])
    assert.throws(() => S.parsePath(d));
});
test('SVG affine transforms apply in declared order and preserve rotated pivots', () => {
  assert.deepEqual(
    S.mapPath(
      [{ point: [1, 0] }],
      S.transform('translate(10,20) scale(2) rotate(90)'),
    )[0].point,
    [10, 22],
  );
  const p = S.mapPath(
    [{ point: [10, 20], outgoing: [20, 20] }],
    S.transform('rotate(90 10 20)'),
  )[0];
  assert.ok(Math.abs(p.point[0] - 10) < 1e-8);
  assert.ok(Math.abs(p.point[1] - 20) < 1e-8);
  assert.ok(Math.abs(p.outgoing[0] - 10) < 1e-8);
  assert.ok(Math.abs(p.outgoing[1] - 30) < 1e-8);
  for (const s of [
    'scale(1,2,3)',
    'matrix(1,0)',
    'wat(1)',
    'translate(10)garbage',
  ])
    assert.throws(() => S.transform(s));
});
test('zero-length SVG segments do not introduce duplicate geometry, and flattening meets the declared error', () => {
  const line = S.parsePath(
    'M100 200 L100 200 C100 200 100 200 100 200 H900 V1400 H100Z',
  )[0];
  assert.equal(line.length, 4);
  const path = S.parsePath('M100 200 C300 50 700 50 900 200 V1400 H100Z')[0],
    polygon = P.flatten(path, 2);
  for (let i = 0; i <= 1000; i++) {
    const point = cubic(
      path[0].point,
      path[0].outgoing,
      path[1].incoming,
      path[1].point,
      i / 1000,
    );
    const error = Math.min(
      ...polygon.map((a, j) => {
        const b = polygon[(j + 1) % polygon.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          t = Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
                (dx * dx + dy * dy),
            ),
          );
        return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
      }),
    );
    assert.ok(error <= 2 + 0.000001);
  }
});
test('SVG styles are inert before XML parsing without rewriting quoted data or comments', () => {
  let captured = '';
  const marker = Error('XML parser reached');
  const parser = {
    parseFromString(source) {
      captured = source;
      throw marker;
    },
  };
  assert.throws(
    () =>
      S.parseSVG(
        `<svg style="fill:red" data-label=" style='literal' "><!-- <g style="ignored"> --><path d="M0 0h10v10h-10z" style='opacity:0'/></svg>`,
        parser,
      ),
    (e) => e === marker,
  );
  assert.ok(captured.includes('data-contour-source-style="fill:red"'));
  assert.ok(captured.includes(`data-label=" style='literal' "`));
  assert.ok(captured.includes('<!-- <g style="ignored"> -->'));
  assert.ok(captured.includes("data-contour-source-style='opacity:0'"));
  for (const source of [
    '<svg><script>bad()</script></svg>',
    '<svg><style>path{}</style></svg>',
    '<!DOCTYPE svg [<!ENTITY a "b">]><svg/>',
    '<svg style=unquoted/>',
    '<svg onload="bad()"/>',
    '<?xml-stylesheet href="https://example.invalid/style.css"?><svg/>',
  ]) {
    captured = '';
    assert.throws(() => S.parseSVG(source, parser));
    assert.equal(captured, '');
  }
});
