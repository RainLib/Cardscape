const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/renderer/component-model.js');
const B = require('../dist/renderer/back-asset-model.js');
const W = require('../dist/renderer/workshop-model.js');
const K = require('../dist/renderer/cosmetics-model.js');
const R = require('../dist/renderer/runtime-model.js');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const document = () =>
  R.ensure({
    schema: 'card-atelier/1',
    name: 'Contract',
    width: 1024,
    height: 1536,
    layers: [],
    masks: {},
    effects: {},
    back: png,
  });
const project = () =>
  W.publish(W.create(document(), 'workshop', 'card'), {
    kind: 'back',
    id: 'back',
    value: { src: png },
  }).workshop;

test('component and cosmetics boundaries reject malformed nested settings without changing the source', () => {
  const p = C.particles({ enabled: true }),
    before = structuredClone(p);
  for (const fields of [
    { reveal: [] },
    { reveal: 'burst' },
    { emitter: [] },
    { emitter: { width: '1' } },
    { count: '64' },
  ])
    assert.throws(
      () => C.validateParticles({ ...p, ...fields }),
      /粒子|揭示|发射/,
    );
  assert.deepEqual(p, before);
  for (const settings of [
    { quality: ['balanced'] },
    { level: ['epic'] },
    { finish: {} },
    [],
  ])
    assert.throws(() => K.validate(settings), /预设/);
  assert.doesNotThrow(() => K.validate({}));
});

test('legacy back layers preserve their source identity and sample through the shared camera contract', () => {
  const asset = B.create(png),
    doc = { backScene: asset };
  const p = C.particles({
    enabled: true,
    emitter: { target: 'back', layerId: 'base', side: 'both' },
  });
  assert.strictEqual(C.source(doc, 'back'), asset);
  const emitter = C.resolveEmitter(p, doc);
  assert.equal(emitter.ok, true);
  assert.strictEqual(emitter.document, asset);
  assert.strictEqual(emitter.layer, asset.layers[0]);
  const output = new Float64Array(64 * 7),
    before = structuredClone(asset);
  assert.equal(C.sampleInto(p, 0.5, doc, 0, output), 64);
  assert.ok(output.every(Number.isFinite));
  assert.deepEqual(asset, before);
});

test('workshop graph decoder rejects broken resources, bindings, drafts and raster maps before changing a project', () => {
  const valid = project(),
    before = structuredClone(valid);
  const mutate = [
    (w) => {
      w.resources[0] = null;
    },
    (w) => {
      w.resources[0].kind = 'toString';
    },
    (w) => {
      w.resources[0].versions[0].value = [];
    },
    (w) => {
      w.cards[0].bindings.back = { resourceId: 'back', version: '1' };
    },
    (w) => {
      w.cards[0].bindings.back = { resourceId: 'missing', version: 1 };
    },
    (w) => {
      w.resources[0].versions[0].value.layerRasters = { hero: { src: png } };
    },
    (w) => {
      w.resources[0].versions[0].value.titleRasters = { title: [png] };
    },
    (w) => {
      w.assetDrafts = {
        bad: { key: 'bad', kind: 'back', version: '1', document: document() },
      };
    },
    (w) => {
      w.backgroundArchive = [{ resources: [null] }];
    },
  ];
  for (const change of mutate) {
    const input = structuredClone(valid);
    change(input);
    const saved = structuredClone(input);
    assert.throws(() => W.validate(input));
    assert.deepEqual(input, saved);
  }
  assert.deepEqual(valid, before);
});

test('workshop serialization keeps extension metadata and deduplicates image strings across resources', async () => {
  let w = project();
  w = W.publish(w, {
    kind: 'base',
    id: 'base',
    value: { src: png, custom: { owner: 'plugin' } },
  }).workshop;
  const before = structuredClone(w),
    encoded = await W.encode(w);
  assert.equal(Object.keys(encoded.blobs).length, 1);
  assert.deepEqual(encoded.project.resources[1].versions[0].value.custom, {
    owner: 'plugin',
  });
  assert.deepEqual(w, before);
});

test('public runtime validates component documents after the entire model graph enters strict', () => {
  for (const fields of [
    { material: C.material({ strength: Infinity }) },
    { particles: { ...C.particles(), reveal: [] } },
    { backScene: { ...B.create(png), adjustments: [] } },
  ])
    assert.throws(() => R.validate({ ...document(), ...fields }));
  for (const raw of [null, [], { cards: [], resources: [] }])
    assert.throws(() => W.migrate(raw), /工坊/);
});

test('particle normalization preserves serialized resource identity including emitter and preset key order', () => {
  const value = {
    ...C.particles(),
    emitter: C.emitter({ target: 'frame' }),
    preset: 'custom',
  };
  assert.equal(JSON.stringify(C.particles(value)), JSON.stringify(value));
});

test('component raster cache handles an absent inset on first draw and invalidates changed adjustments and masks', () => {
  const fs = require('node:fs'),
    vm = require('node:vm');
  const { extractFunction } = require('./fixtures/source-node.cjs');
  let canvases = 0;
  const cache = new WeakMap(),
    versions = new Map();
  const canvasFor = () => ({
    id: ++canvases,
    getContext: () => ({
      drawImage() {},
      getImageData: () => ({
        data: new Uint8ClampedArray([255, 255, 255, 255]),
      }),
      putImageData() {},
    }),
  });
  const context = vm.createContext({
    popRasterCache: cache,
    maskVersions: versions,
    window: { CardImageAssets: { canvasFor } },
    adjustedImage: (_, image) => image,
  });
  const source = fs.readFileSync(
    require.resolve('../dist/renderer/app.js'),
    'utf8',
  );
  const raster = vm.runInContext(
    extractFunction(source, 'popRaster') + '; popRaster;',
    context,
  );
  const image = {},
    layer = {};
  const first = raster(layer, image, undefined);
  assert.equal(canvases, 1);
  assert.strictEqual(raster(layer, image, undefined), first);
  layer.adjustments = { brightness: 10 };
  const changed = raster(layer, image, undefined);
  assert.notStrictEqual(changed, first);
  const mask = {};
  versions.set(mask, 1);
  const masked = raster(layer, image, mask);
  assert.notStrictEqual(masked, changed);
  versions.set(mask, 2);
  assert.notStrictEqual(raster(layer, image, mask), masked);
  assert.equal(raster(layer, null, undefined), null);
});
