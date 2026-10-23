const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const Model = require('../dist/renderer/player-model.js');
const R = require('../dist/renderer/runtime-model.js');
const C = require('../dist/renderer/component-model.js');
const B = require('../dist/renderer/back-asset-model.js');
const { extractFunction } = require('./fixtures/source-node.cjs');

test('failed mesh replacement releases partial allocations and preserves the complete mesh', async () => {
  const source = await fs.readFile(
    path.join(__dirname, '../dist/renderer/author-preview.js'),
    'utf8',
  );
  const deleted = [],
    oldBuffers = Array.from({ length: 7 }, (_, id) => ({ old: id }));
  const previous = Object.fromEntries(
    ['p', 'uv', 'fx', 'guard', 'join', 'idx', 'lines'].map((key, i) => [
      key,
      oldBuffers[i],
    ]),
  );
  const meshes = new Map([['foreground', previous]]);
  let allocations = 0,
    failAt = 3;
  const gl = {
    ARRAY_BUFFER: 1,
    ELEMENT_ARRAY_BUFFER: 2,
    DYNAMIC_DRAW: 3,
    createBuffer() {
      return ++allocations === failAt ? null : { allocation: allocations };
    },
    bindBuffer() {},
    bufferData() {},
    deleteBuffer(value) {
      deleted.push(value);
    },
  };
  const context = vm.createContext({
    gl,
    meshes,
    count() {},
    Float32Array,
    Uint16Array,
  });
  vm.runInContext(
    extractFunction(source, 'required') +
      '\n' +
      extractFunction(source, 'mesh'),
    context,
  );
  const geometry = R.grid(1);
  assert.throws(() => context.mesh('foreground', geometry), /预览资源/);
  assert.equal(meshes.get('foreground'), previous);
  assert.equal(deleted.length, 2);
  assert.ok(oldBuffers.every((b) => !deleted.includes(b)));
  failAt = -1;
  const next = context.mesh('foreground', geometry);
  assert.equal(meshes.get('foreground'), next);
  assert.equal(next.geometry, geometry);
  assert.ok(oldBuffers.every((b) => deleted.includes(b)));
});

test('portable mesh decoder rejects malformed topology before GPU upload', () => {
  assert.deepEqual(Model.mesh(R.grid(2)), R.grid(2));
  for (const value of [
    null,
    {},
    { positions: [0, 0], uv: [], indices: [] },
    { positions: [0, 0, 0], uv: [0, 0], indices: [0, 0, 2] },
    { positions: [0, 0, 0], uv: [0, 0], indices: [0, 0, 0.5] },
    { positions: [NaN, 0, 0], uv: [0, 0], indices: [0, 0, 0] },
  ]) {
    assert.throws(() => Model.mesh(value), /播放器/);
  }
});

test('portable decoder checks texture maps, actions, layer transforms and nested components', () => {
  const base = {
    schema: 'card-atelier-assets/1',
    name: 'Player',
    width: 1024,
    height: 1536,
    layers: [
      {
        id: 'image',
        name: 'Image',
        kind: 'image',
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        asset: 'image.png',
      },
    ],
    masks: [],
  };
  for (const change of [
    { layers: [null] },
    { masks: [4] },
    { shaderAssets: { vertex: 7, fragment: 'card.frag' } },
    {
      exportProfile: {
        schema: 'card-export-profile/1',
        settings: {},
        textures: { a: { large: { asset: 7 }, small: { asset: 'a.png' } } },
      },
    },
  ])
    assert.throws(() => Model.manifest({ ...base, ...change }), /播放器|设置/);
  for (const change of [
    { layers: [{ ...base.layers[0], x: '0' }] },
    { actions: [null] },
    { slots: [null] },
    { effects: { depth: 'deep' } },
    { particles: { ...C.particles(), speed: 'fast' } },
    { componentScenes: { frame: { document: { layers: [null] } } } },
  ])
    assert.throws(
      () => Model.document({ ...base, ...change }),
      /播放器|动作|Slot|粒子|槽位/,
    );
  const decoded = Model.document(
    { ...base, plugin: { format: 'custom' } },
    [],
    [],
    R.grid(1),
  );
  assert.deepEqual(decoded.plugin, { format: 'custom' });
  assert.equal(decoded.layers[0].asset, 'image.png');
  assert.equal(decoded.schema, 'card-atelier/1');
});

test('real single-card export decodes with portable sprites, back scenes and nested authoring scenes', async () => {
  const { createServices } = require('../dist/electron/services.cjs');
  const { fixture, png } = require('./fixtures/character-animation.cjs');
  const temp = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cardscape-player-types-'),
  );
  const service = createServices({ runtimeDir: temp });
  try {
    const doc = fixture(),
      sprite = png([0, 0, 4, 4], [255, 255, 255, 255], 4, 4);
    doc.particles = C.particles({
      enabled: true,
      visual: 'sprite',
      sprite,
      count: 4,
    });
    doc.backScene = B.create(doc.back);
    doc.componentScenes = {
      frame: {
        document: R.ensure({
          ...structuredClone(doc),
          id: 'frame-scene',
          componentScenes: undefined,
          backScene: undefined,
          particles: undefined,
        }),
      },
    };
    const result = await service.invoke('export', {
      document: doc,
      front: doc.back,
    });
    const read = async (file) =>
      JSON.parse(await fs.readFile(path.join(result.directory, file), 'utf8'));
    const manifest = Model.manifest(await read('manifest.json'));
    const model = Model.document(
      manifest,
      await read('actions.json'),
      await read('slots.json'),
      await read('foreground-mesh.json'),
    );
    assert.equal(model.layers.length, doc.layers.length);
    assert.deepEqual(model.actions, doc.actions);
    assert.equal(model.particles.sprite, 'particles/sprite.png');
    assert.ok(model.backScene.layers[0].src.endsWith('.png'));
    assert.equal(
      model.componentScenes.frame.document.layers.length,
      doc.layers.length,
    );
    const html = await fs.readFile(
      path.join(result.directory, 'index.html'),
      'utf8',
    );
    assert.match(
      html,
      /defer src="player-model\.js"[\s\S]*defer src="player\.js"/,
    );
    await fs.stat(path.join(result.directory, 'player-model.js'));
  } finally {
    service.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('CLI capture returns bounded typed results for spawn failure and timeout', async () => {
  const { capture } = require('../dist/electron/agent-setup.cjs');
  const missing = await capture(
    path.join(os.tmpdir(), 'missing-cardscape-executable'),
    [],
  );
  assert.equal(missing.code, null);
  assert.equal(missing.output, '');
  const timeout = await capture(
    process.execPath,
    ['-e', 'setTimeout(() => {}, 10000)'],
    20,
  );
  assert.equal(timeout.timeout, true);
  assert.equal(timeout.code, null);
});
