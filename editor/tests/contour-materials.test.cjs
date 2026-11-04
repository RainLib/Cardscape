const test = require('node:test'),
  assert = require('node:assert/strict');
const F = require('../dist/renderer/frame-model.js'),
  D = require('../dist/renderer/contour-field-model.js'),
  G = require('../dist/renderer/contour-geometry.js');
const { rect, complexContour } = require('./fixtures/complex-contour.cjs');
test('padded atlas encodes stable clockwise arc length and separate loop ownership', () => {
  const c = {
      outline: rect(100, 100, 800, 1300),
      windows: [rect(300, 400, 400, 400)],
    },
    f = D.create(c);
  assert.deepEqual(
    [f.width, f.height, f.padding, f.step],
    [2016, 1856, 160, 1],
  );
  for (const [x, y, phase, ring, window] of [
    [500, 100, 400 / 4200, 0, false],
    [900, 700, 1400 / 4200, 0, false],
    [400, 1400, 2600 / 4200, 0, false],
    [100, 500, 3800 / 4200, 0, false],
    [700, 600, 600 / 1600, 1, true],
  ]) {
    const p = D.path(f, x, y);
    assert.equal(p.ring, ring);
    assert.equal(p.window, window);
    assert.ok(Math.abs(p.phase - phase) < 0.001);
  }
  const reversed = {
      outline: c.outline.slice().reverse(),
      windows: [
        c.windows[0].slice(2).concat(c.windows[0].slice(0, 2)).reverse(),
      ],
    },
    r = D.create(reversed);
  for (const [x, y] of [
    [500, 100],
    [900, 700],
    [700, 600],
  ])
    assert.deepEqual(
      D.path(r, x, y),
      D.path(f, x, y),
      'winding and start point do not change flow',
    );
  assert.ok(
    Math.abs(D.decode(f, -50, 200)[0] + 149.5) < 0.05,
    'distance extends into the aura padding',
  );
  assert.equal(D.create(c), f);
  const reduced = D.create(c, 2);
  assert.deepEqual([reduced.width, reduced.height], [1008, 928]);
  assert.throws(() => D.create(c, 3), /步长/);
});
const area = (ring) =>
  Math.abs(
    ring.reduce((n, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return n + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
function audit(shape, b = 5) {
  const s = { ...F.defaults, contour: shape, bevel: b },
    g = F.geometry(s),
    edges = new Map();
  let capArea = 0;
  for (const [name, m] of Object.entries({
    rim: g.rim,
    rear: g.rear,
    sides: g.sides,
  }))
    for (let i = 0; i < m.indices.length; i += 3) {
      const p = m.indices
        .slice(i, i + 3)
        .map((id) => m.positions.slice(id * 3, id * 3 + 3));
      if (name === 'rim')
        capArea +=
          (Math.abs(
            (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
              (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]),
          ) *
            1024 *
            1024) /
          2;
      const key = (p) => p.map((v) => Math.round(v * 1024 * 1e4)).join(',');
      for (let e = 0; e < 3; e++) {
        const a = key(p[e]),
          b = key(p[(e + 1) % 3]),
          k = a < b ? a + '|' + b : b + '|' + a,
          edge = edges.get(k) || { count: 0, balance: 0 };
        edge.count++;
        edge.balance += a < b ? 1 : -1;
        edges.set(k, edge);
      }
    }
  const contacts = new Map();
  for (const r of G.regions(shape))
    for (const p of r.outline) {
      const k = [
        Math.round((p[0] - 512) * 1e4),
        Math.round((768 - p[1]) * 1e4),
      ].join(',');
      contacts.set(k, (contacts.get(k) || 0) + 1);
    }
  for (const [key, edge] of edges) {
    const [a, b] = key.split('|').map((p) => p.split(',')),
      xy = a.slice(0, 2).join(','),
      touching = xy === b.slice(0, 2).join(',') && (contacts.get(xy) || 0) > 1;
    assert.equal(edge.count, touching ? 4 : 2, 'closed edge: ' + key);
    assert.equal(edge.balance, 0, 'opposite winding: ' + key);
  }
  const expected = G.regions(shape).reduce(
    (n, r) => n + area(r.outline) - r.windows.reduce((n, h) => n + area(h), 0),
    0,
  );
  assert.ok(
    Math.abs(capArea - expected) < 1,
    'cap neither bridges a window nor overlaps material',
  );
  assert.ok(g.rim.positions.every(Number.isFinite));
  assert.ok(g.rim.positions.length / 3 < 65000);
  assert.equal(F.geometry(s).rim, g.rim, 'unchanged bevels reuse their mesh');
  return g;
}
test('bevels have closed, consistently wound caps and walls around holes, islands and point contacts', () => {
  audit(complexContour());
  audit({
    outline: rect(100, 100, 800, 1300),
    windows: [rect(130, 130, 740, 1240)],
  });
  audit({
    outline: rect(100, 100, 300, 300),
    windows: [],
    islands: [{ outline: rect(400, 400, 200, 200), windows: [] }],
  });
  const thin = audit({ outline: rect(100, 100, 8, 1000), windows: [] });
  const heights = thin.rim.positions
    .filter((_, i) => i % 3 === 2)
    .map((z) => (z - (0.045 - 5 / 1024)) * 1024);
  assert.ok(
    Math.max(...heights) > 3 && Math.max(...heights) < 5,
    'collapsed insets keep a real ridge',
  );
});
test('bevel depth and aura bounds remain finite for thin cards and empty material', () => {
  assert.equal(F.bevel({ ...F.defaults, depth: 8, bevel: 16 }), 3.6);
  assert.equal(F.bevel({ ...F.defaults, bevel: 0.001 }), 0);
  const c = { outline: rect(0, 0, 1024, 1536), windows: [] };
  for (const finish of ['glow', 'halloween-stickers']) {
    const s = { ...F.defaults, contour: c, finish },
      g = F.geometry(s),
      pad = F.auraPadding(s);
    assert.equal(F.hasAura(s), true);
    assert.equal(Math.min(...g.aura.uv), -pad / 1024);
    assert.equal(
      Math.max(...g.aura.positions.filter((_, i) => i % 3 === 1)),
      0.75 + pad / 1024,
    );
  }
  assert.equal(
    F.geometry({ ...F.defaults, contour: { outline: [], windows: [] } }).rim
      .indices.length,
    0,
  );
});
