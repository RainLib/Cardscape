const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/renderer/character-animation-model.js');
const R = require('../dist/renderer/runtime-model.js');
const S = require('../dist/renderer/spine-import-model.js');
const P = require('../dist/renderer/export-profile.js');
const { parseAssetManifest } = require('../dist/electron/export-manifest.cjs');

const manifest = () => ({
  schema: 'card-atelier-assets/1',
  name: 'Typed export',
  width: 1024,
  height: 1536,
  layers: [],
  masks: [],
  fontDependencies: [],
});

test('Spine read-only inspection keeps its optional target document contract', () => {
  const source = { skeleton: { spine: '4.2.00' }, bones: [{ name: 'root' }] };
  assert.deepEqual(S.inspect(source).unsupported, []);
  assert.equal(S.convert(source).characterRig.bones[0].name, 'root');
  source.slots = [{ name: 'slot', bone: 'root', attachment: 'image' }];
  const report = S.inspect(source);
  assert.match(report.unsupported.join(','), /请映射图片/);
});

test('Spine import and native preview agree on registered pixels with slot scaling, rotation and pivot', () => {
  const layer = {
    id: 'art',
    name: 'Artwork',
    kind: 'image',
    x: 25,
    y: -15,
    scale: 0.8,
    rotation: 12,
    opacity: 1,
    slotId: 'mount',
    pivot: { u: 0.3, v: 0.4 },
  };
  const doc = R.ensure({
    layers: [layer],
    slots: [
      {
        id: 'mount',
        name: 'Mount',
        u: 0.7,
        v: 0.6,
        scale: 0.9,
        rotation: 25,
        z: 0.1,
        clip: false,
        effect: 'none',
        strength: 0,
        speed: 1,
      },
    ],
  });
  const source = {
    skeleton: { spine: '4.2.00' },
    bones: [{ name: 'root', x: 100 }],
    slots: [{ name: 'slot', bone: 'root', attachment: 'image' }],
    skins: [
      {
        name: 'default',
        attachments: {
          slot: { image: { width: 100, height: 80, x: 20, y: 10 } },
        },
      },
    ],
  };
  const before = JSON.stringify(doc),
    plan = S.convert(source, { document: doc, layerMap: { slot: 'art' } });
  const imported = {
      ...doc,
      characterRig: plan.characterRig,
      actions: plan.actions,
    },
    base = R.placement(doc, layer);
  const mesh = C.geometry(imported, layer, C.rest(imported), base);
  const transform = C.matrix(
    512 + base.x,
    768 + base.y,
    (base.rotation * 180) / Math.PI,
    base.scale,
  );
  const expected = [
    [582, 718],
    [682, 718],
    [682, 798],
    [582, 798],
  ];
  for (let i = 0; i < 4; i++) {
    const point = C.point(
      transform,
      mesh.positions[i * 3] * 1024,
      -mesh.positions[i * 3 + 1] * 1024,
    );
    assert.ok(Math.abs(point.x - expected[i][0]) < 0.001);
    assert.ok(Math.abs(point.y - expected[i][1]) < 0.001);
  }
  assert.equal(JSON.stringify(doc), before);
});

test('generated manifest decoding preserves validated rig data and extension metadata', () => {
  const value = {
    ...manifest(),
    characterRig: { schema: 'card-character-rig/1', bones: [], bindings: [] },
    editorMetadata: { note: 'preserved' },
    frontAsset: 'front.png',
    backAsset: null,
  };
  assert.deepEqual(
    parseAssetManifest(JSON.parse(JSON.stringify(value))),
    value,
  );
});

test('manifest decoding rejects malformed containers, asset references and Shader mappings', () => {
  for (const patch of [
    { layers: {} },
    { masks: [123] },
    { frontAsset: 123 },
    { backAsset: {} },
    { shaderAssets: { vertex: 'card.vert' } },
    { framePreview: { asset: 'frame.png', bounds: { x: 0 }, time: 0 } },
    { particles: { sprite: 123 } },
    {
      fontDependencies: [
        {
          layerId: 'title',
          family: 'Font',
          locale: null,
          portableRaster: 123,
          embedded: null,
        },
      ],
    },
  ])
    assert.throws(
      () => parseAssetManifest({ ...manifest(), ...patch }),
      /清单/,
    );
});

test('manifest variants share validated export policy and reject invalid presets or texture references', () => {
  const profile = {
    schema: 'card-export-profile/1',
    settings: P.config({ preset: 'mobile-detail' }),
    textures: {
      front: {
        small: { asset: 'small.webp', width: 512, height: 768 },
        large: { asset: 'large.webp', width: 1024, height: 1536 },
      },
    },
  };
  assert.deepEqual(
    parseAssetManifest({ ...manifest(), exportProfile: profile }).exportProfile,
    profile,
  );
  assert.throws(
    () =>
      parseAssetManifest({
        ...manifest(),
        exportProfile: {
          ...profile,
          settings: { ...profile.settings, preset: 'missing' },
        },
      }),
    /预设/,
  );
  assert.throws(
    () =>
      parseAssetManifest({
        ...manifest(),
        exportProfile: {
          ...profile,
          textures: {
            front: { small: { asset: 123 }, large: { asset: 'large.webp' } },
          },
        },
      }),
    /纹理/,
  );
});
