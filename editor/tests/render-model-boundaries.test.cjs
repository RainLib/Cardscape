const test = require('node:test');
const assert = require('node:assert/strict');
const Graph = require('../dist/renderer/shader-graph-model.js');
const Spatial = require('../dist/renderer/spatial-model.js');
const Frame = require('../dist/renderer/frame-model.js');
const Raster = require('../dist/renderer/frame-raster.js');
const Runtime = require('../dist/renderer/runtime-model.js');

test('shader graph decoder rejects malformed nested values before code generation without editing a draft', () => {
  const valid = Graph.preset('fragment', 'wave'),
    before = structuredClone(valid);
  const mutations = [
    (g) => {
      g.stage = ['fragment'];
    },
    (g) => {
      g.nodes[0] = null;
    },
    (g) => {
      g.nodes[0].properties = [];
    },
    (g) => {
      g.nodes[0].pos = [0, '1'];
    },
    (g) => {
      g.links[0] = null;
    },
    (g) => {
      g.links[0][1] = '1';
    },
    (g) => {
      g.nodes.find((n) => n.type === 'card/mask/channel').properties.channel = [
        'a',
      ];
    },
    (g) => {
      g.nodes.find((n) => n.type === 'card/value/float').properties.value = '1';
    },
  ];
  for (const mutate of mutations) {
    const draft = structuredClone(valid);
    mutate(draft);
    const saved = structuredClone(draft);
    assert.throws(() => Graph.compile(draft), /节点|Mask/);
    assert.deepEqual(draft, saved);
  }
  const extended = structuredClone(valid);
  const clock = extended.nodes.find((n) => n.type === 'card/input/time');
  clock.properties = { value: 'vendor metadata', custom: { revision: 2 } };
  assert.deepEqual(
    Graph.validate(extended).get(clock.id).properties,
    clock.properties,
  );
  assert.equal(Graph.compile(extended), Graph.compile(valid));
  assert.equal(Graph.validate(valid).size, valid.nodes.length);
  assert.deepEqual(valid, before);
});

test('spatial context decoder retains legacy optional metadata and rejects corrupt surfaces and attachments', () => {
  const document = {
    layers: [
      {
        id: 'hero',
        name: 'Hero',
        kind: 'foreground',
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
      },
    ],
    slots: [],
  };
  const valid = Spatial.imageContext(document, document.layers[0]);
  delete valid.occlusionPairs;
  delete valid.surfaces[0].paintOrder;
  const decoded = Spatial.validateImageContext(valid, 'hero');
  assert.deepEqual(decoded, valid);
  assert.notStrictEqual(decoded, valid);
  for (const surface of [
    null,
    { ...valid.surfaces[0], slotZ: '0' },
    { ...valid.surfaces[0], parentLayerId: 'missing' },
    { ...valid.surfaces[0], role: ['body'] },
  ]) {
    assert.throws(
      () =>
        Spatial.validateImageContext({ ...valid, surfaces: [surface] }, 'hero'),
      /表面|关系/,
    );
  }
  const base = { maxOffset: 0.025, blendWidth: 64 };
  for (const attachment of [
    null,
    { ...base, mode: ['cloth'] },
    { ...base, anchor: { edge: ['top'], pin: 0, release: 64 } },
    { ...base, anchor: { edge: 'segment', root: [0, 0], tip: [1, 1] } },
  ]) {
    assert.throws(
      () => Spatial.validateAttachment(attachment),
      /连接|刚性|根部|锚点/,
    );
  }
  assert.doesNotThrow(() =>
    Spatial.validateAttachment({ ...base, anchor: { edge: 'boundary' } }),
  );
  assert.doesNotThrow(() =>
    Spatial.validateAttachment({
      ...base,
      anchor: { edge: 'segment', root: [0, 0], tip: [100, 100] },
    }),
  );
});

test('runtime keeps legacy frame shapes readable and checks stored styles without rewriting them', () => {
  const old = { ...Frame.defaults, shape: 'oval' };
  const document = Runtime.ensure({ layers: [], frameStyle: old });
  const before = structuredClone(document);
  Runtime.validate(document);
  assert.equal(Frame.resolve(document).shape, 'rect');
  assert.deepEqual(document, before);
  for (const style of [
    { ...old, width: '24' },
    { ...old, animation: ['none'] },
    { ...old, animationSpeed: Infinity },
  ]) {
    assert.throws(
      () => Runtime.validate({ ...document, frameStyle: style }),
      /边框/,
    );
  }
  assert.throws(
    () =>
      Runtime.validate({
        ...document,
        frameStyles: [
          { ...old, id: 'same' },
          { ...old, id: 'same' },
        ],
      }),
    /ID/,
  );
});

test('frame raster allocation failures release GPU resources and stop repeated initialization attempts', () => {
  for (const failure of ['program', 'shader']) {
    let attempts = 0,
      deleted = 0;
    const gl = {
      isContextLost: () => false,
      createProgram: () => (failure === 'program' ? null : {}),
      createShader: () => null,
      deleteProgram: () => deleted++,
    };
    const raster = Raster.createRenderer(() => ({
      addEventListener() {},
      getContext() {
        attempts++;
        return gl;
      },
    }));
    assert.equal(raster.raster(Frame.defaults), null);
    assert.equal(raster.draw({}, Frame.defaults), false);
    assert.equal(attempts, 1);
    assert.equal(deleted, failure === 'program' ? 0 : 1);
    assert.match(raster.stats().error, /Cannot create frame shader/);
    assert.equal(raster.stats().bytes, 0);
  }
});
