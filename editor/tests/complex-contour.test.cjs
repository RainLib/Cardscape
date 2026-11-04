const test = require('node:test'),
  assert = require('node:assert/strict');
const G = require('../dist/renderer/contour-geometry.js'),
  P = require('../dist/renderer/contour-path-model.js'),
  F = require('../dist/renderer/frame-model.js'),
  D = require('../dist/renderer/contour-field-model.js'),
  B = require('../dist/renderer/contour-boolean-model.js');
const { complexContour, rect } = require('./fixtures/complex-contour.cjs');
test('complex contours preserve six holes, nested islands, disjoint regions and every physical side', () => {
  const c = complexContour();
  F.validateContour(c);
  const paths = P.fromContour(c),
    baked = P.compile(paths);
  F.validateContour(baked);
  assert.equal(baked.windows.length, 6);
  assert.equal(baked.islands.length, 2);
  assert.equal(
    G.rings(c).reduce((n, r) => n + r.length, 0),
    164,
  );
  const style = { ...F.defaults, contour: baked },
    mesh = F.geometry(style);
  assert.equal(mesh.sides.indices.length, 164 * 6);
  assert.equal(F.contains(style, 900, 700), true);
  assert.equal(F.contains(style, 200, 440, style.width), true);
  assert.equal(F.contains(style, 220, 440, style.width), false);
  assert.equal(F.contains(style, 250, 440, style.width), true);
  assert.equal(F.contourUniforms(style).edges.length, 256);
  assert.equal(G.complex(c), true);
  assert.deepEqual(
    G.rings(P.compile(JSON.parse(JSON.stringify(paths)))),
    G.rings(c),
  );
  assert.equal(
    G.key(baked),
    G.key(c),
    'editing metadata does not duplicate field uploads',
  );
});
test('boolean operations keep split regions, nested islands and deliberately empty results', () => {
  const a = { outline: rect(100, 100, 800, 1300), windows: [] },
    cut = { outline: rect(0, 700, 1024, 100), windows: [] };
  const split = B.operate(a, cut, 'difference');
  F.validateContour(split);
  assert.equal(G.regions(split).length, 2);
  assert.equal(G.contains(split, [500, 750]), false);
  assert.equal(G.contains(split, [500, 500]), true);
  const empty = B.operate(a, a, 'difference');
  assert.deepEqual(empty, { outline: [], windows: [] });
  F.validateContour(P.compile(P.fromContour(empty)));
  assert.equal(G.contains(empty, [500, 500]), false);
  assert.equal(
    F.geometry({ ...F.defaults, contour: empty }).sides.indices.length,
    0,
  );
  assert.equal(
    F.contourUniforms({ ...F.defaults, contour: empty }).counts[1],
    1,
  );
  assert.deepEqual(B.operate(empty, a, 'union'), a);
  const hole = B.operate(
    a,
    { outline: rect(200, 200, 600, 1000), windows: [] },
    'xor',
  );
  assert.equal(hole.windows.length, 1);
  const island = B.operate(
    hole,
    { outline: rect(300, 300, 100, 100), windows: [] },
    'union',
  );
  assert.equal(island.islands.length, 1);
  const imported = B.classify(G.rings(island).map(P.linear));
  F.validateContour(P.compile(imported));
  assert.equal(imported.islands.length, 1);
  assert.equal(B.operate(a, cut, 'intersection').outline.length, 4);
});
test('invalid overlapping regions and malformed islands fail before rendering; point contacts are legal', () => {
  const a = { outline: rect(100, 100, 300, 300), windows: [] };
  for (const islands of [
    [{ outline: rect(200, 200, 300, 300), windows: [] }],
    [a],
    [{}],
  ])
    assert.throws(() => F.validateContour({ ...a, islands }));
  F.validateContour({
    ...a,
    islands: [{ outline: rect(400, 400, 200, 200), windows: [] }],
  });
  const touching = {
    ...a,
    islands: [{ outline: rect(400, 400, 200, 200), windows: [] }],
  };
  assert.equal(
    G.silhouette(touching).length,
    2,
    'point contact keeps both silhouettes',
  );
  assert.equal(
    G.apertures(touching).length,
    0,
    'point contact does not create a false aperture',
  );
  assert.throws(
    () =>
      F.validateContour({
        ...a,
        islands: [{ outline: rect(400, 100, 200, 300), windows: [] }],
      }),
    /共边/,
  );
  assert.throws(
    () =>
      F.validateContour({
        outline: rect(10, 10, 1000, 1500),
        windows: Array.from({ length: 128 }, () => rect(20, 20, 5, 5)),
      }),
    /128/,
  );
  const tooMany = P.fromContour(a);
  tooMany.outline = Array.from({ length: 4097 }, (_, i) => ({
    point: [
      500 + 400 * Math.cos((i * 2 * Math.PI) / 4097),
      750 + 700 * Math.sin((i * 2 * Math.PI) / 4097),
    ],
  }));
  assert.throws(() => P.compile(tooMany), /4096/);
});
test('packed signed distance field agrees with independent pixel distances and nested material probes', () => {
  const c = {
      outline: rect(100, 100, 800, 1300),
      windows: [rect(300, 400, 400, 400)],
    },
    field = D.create(c);
  for (const [x, y, outer, aperture] of [
    [100, 200, 0.5, -192],
    [99, 200, -0.5, -192],
    [50, 200, -49.5, -192],
    [300, 500, 192, 0.5],
    [299, 500, 192, -0.5],
    [400, 500, 192, 100.5],
  ]) {
    const d = D.decode(field, x, y);
    assert.ok(Math.abs(d[0] - outer) < 0.05, `${x},${y}: outer ${d}`);
    assert.ok(Math.abs(d[1] - aperture) < 0.05, `${x},${y}: aperture ${d}`);
  }
  const complex = D.create(complexContour());
  for (const [x, y, solid] of [
    [900, 700, true],
    [200, 440, false],
    [220, 440, true],
    [250, 440, false],
    [20, 20, false],
  ]) {
    const [outer, hole] = D.decode(complex, x, y);
    assert.equal(outer >= 0 && hole < 0, solid, `${x},${y}`);
  }
  assert.equal(D.create({ ...c, paths: P.fromContour(c) }), field);
  for (let i = 3; i < complex.data.length; i += 4)
    assert.equal(complex.data[i], 255, 'data texture alpha stays opaque');
});
test('data PNG roundtrips the exact packed bytes without an image worker or color conversion', () => {
  const {
      contourFieldPNG,
    } = require('../dist/electron/contour-field-export.cjs'),
    zlib = require('node:zlib');
  const c = complexContour(),
    field = D.create(c),
    png = contourFieldPNG({ ...F.defaults, contour: c });
  assert.equal(png.readUInt32BE(16), field.width);
  assert.equal(png.readUInt32BE(20), field.height);
  const parts = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT')
      parts.push(png.subarray(at + 8, at + 8 + len));
    at += len + 12;
  }
  const rows = zlib.inflateSync(Buffer.concat(parts)),
    data = Buffer.alloc(field.data.length);
  for (let y = 0; y < field.height; y++) {
    const stride = field.width * 4;
    assert.equal(rows[y * (stride + 1)], 0);
    rows.copy(data, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  assert.deepEqual(data, Buffer.from(field.data));
  assert.equal(contourFieldPNG(F.defaults), null);
});
test('two renderers share one field upload and release it only after the final owner', () => {
  const Renderer = require('../dist/renderer/contour-field-renderer.js');
  let uploads = 0,
    deletes = 0;
  const gl = new Proxy(
    {
      createTexture: () => ({}),
      texImage2D: () => uploads++,
      deleteTexture: () => deletes++,
    },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  const a = Renderer.create(gl),
    b = Renderer.create(gl),
    style = { ...F.defaults, contour: complexContour() };
  a.bind(style, {});
  b.bind(style, {});
  a.bind({ ...style, color: '#ffffff' }, {});
  assert.equal(uploads, 1);
  a.dispose();
  assert.equal(deletes, 0);
  b.dispose();
  assert.equal(deletes, 1);
  b.dispose();
  assert.equal(deletes, 1);
});
test('real export keeps field bytes in native and remote dependency graphs without texture downsampling', async () => {
  const fs = require('node:fs/promises'),
    path = require('node:path'),
    os = require('node:os'),
    crypto = require('node:crypto');
  const { createServices } = require('../dist/electron/services.cjs'),
    R = require('../dist/renderer/runtime-model.js');
  const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cardscape-contour-export-'),
    ),
    service = createServices({ runtimeDir: dir });
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  try {
    const doc = R.ensure({
      schema: 'card-atelier/1',
      id: 'complex',
      name: 'Complex',
      width: 1024,
      height: 1536,
      previewMode: 'authored',
      layers: [
        {
          id: 'frame',
          name: 'Frame',
          kind: 'frame',
          visible: true,
          locked: false,
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
        },
      ],
      masks: {},
      back: png,
      frameStyle: { ...F.defaults, contour: complexContour() },
    });
    doc.exportSettings = require('../dist/renderer/export-profile.js').config({
      remoteDelivery: true,
    });
    const original = JSON.stringify(doc),
      result = await service.invoke('export', {
        document: doc,
        front: png,
        layerRasters: {},
      }),
      base = result.directory;
    const manifest = JSON.parse(
      await fs.readFile(path.join(base, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.contourFieldAsset, 'contour-field.png');
    const uniforms = JSON.parse(
      await fs.readFile(path.join(base, 'uniforms.json'), 'utf8'),
    );
    assert.equal(uniforms.frameContour.texture, 1);
    assert.equal(uniforms.frameContour.fieldAsset, manifest.contourFieldAsset);
    assert.deepEqual(uniforms.frameContour.fieldSize, [2016, 1856]);
    assert.equal(
      manifest.exportProfile.textures[manifest.contourFieldAsset],
      undefined,
    );
    const bytes = await fs.readFile(
        path.join(base, manifest.contourFieldAsset),
      ),
      digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const resource = await fs.readFile(
        path.join(base, 'godot/library.tres'),
        'utf8',
      ),
      native = JSON.parse(JSON.parse(/^data_json = (.+)$/m.exec(resource)[1]));
    assert.equal(native.cards[0].contourFieldAsset, digest + '.png');
    assert.deepEqual(
      await fs.readFile(path.join(base, 'godot/assets', digest + '.png')),
      bytes,
    );
    const catalog = JSON.parse(
      await fs.readFile(path.join(base, 'remote/catalog.json'), 'utf8'),
    );
    assert.ok(catalog.cards[0].webgl.base.includes(digest));
    assert.equal(JSON.stringify(doc), original);
  } finally {
    service.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
