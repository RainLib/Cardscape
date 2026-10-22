const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = require('../dist/renderer/runtime-model.js');
const core = require('../dist/renderer/runtime-core.js');

test('runtime compatibility entry preserves the strict sampler and rejects malformed nested settings', () => {
  assert.equal(runtime.action, core.action);
  assert.equal(runtime.vertex, core.vertex);
  assert.equal(runtime.defaults, core.defaults);
  for (const value of [null, {}, { layers: [null] }])
    assert.throws(() => runtime.validate(value));
  for (const shader of [
    { fragmentMask: ['motion'] },
    { graphs: [] },
    { graphs: { unexpected: {} } },
  ]) {
    assert.throws(
      () => runtime.validate({ layers: [], shader }),
      /Shader|GLSL/,
    );
  }
  const action = structuredClone(runtime.defaults.actions[0]);
  for (const frame of [
    null,
    { at: 0, value: 1, ease: ['linear'] },
    { at: '0', value: 1 },
  ]) {
    assert.throws(
      () =>
        runtime.validate({
          layers: [],
          actions: [{ ...action, tracks: { motion: [frame] } }],
        }),
      /动画/,
    );
  }
});

test('public runtime still invokes extension validators after splitting the strict implementation', () => {
  for (const extension of [
    { backScene: {} },
    { material: { invalid: true } },
    { cosmetics: { schema: 'invalid' } },
    { spatial: { schema: 'invalid' } },
    { frameStyle: { width: -1 } },
  ])
    assert.throws(() => runtime.validate({ layers: [], ...extension }));
});

test('browser scripts assemble runtime without CommonJS and retain nested validation', () => {
  const context = vm.createContext({
    structuredClone,
    Float32Array,
    Float64Array,
    Map,
    Set,
    console,
  });
  context.window = context;
  const names = [
    'frame-model',
    'card-stats',
    'title-model',
    'component-model',
    'cosmetics-model',
    'back-asset-model',
    'spatial-model',
    'shader-graph-model',
    'character-ik-model',
    'character-deform-model',
    'character-advanced-model',
    'character-animation-model',
    'export-profile',
    'runtime-core',
    'runtime-validation',
    'runtime-model',
  ];
  for (const name of names)
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, '../dist/renderer', name + '.js'),
        'utf8',
      ),
      context,
      { filename: name },
    );
  assert.equal(context.CardRuntime.action, context.CardRuntimeCore.action);
  const document = context.CardRuntime.ensure({ layers: [] });
  context.CardRuntime.validate(document);
  assert.equal(
    context.CardRuntime.action(document, 'flip', 0.6).rotation,
    Math.PI / 2,
  );
  assert.throws(() =>
    context.CardRuntime.validate({
      layers: [],
      shader: { graphs: { geometry: { schema: 'invalid' } } },
    }),
  );
});
