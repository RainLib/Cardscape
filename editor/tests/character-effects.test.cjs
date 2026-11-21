const test = require('node:test');
const assert = require('node:assert/strict');
const Effects = require('../dist/renderer/character-effects.js');
const Catalog = require('../dist/renderer/finish-catalog.js');
const Cosmetics = require('../dist/renderer/cosmetics-model.js');
const Runtime = require('../dist/renderer/runtime-model.js');
const Workshop = require('../dist/renderer/workshop-model.js');
const { snapshot } = require('../dist/renderer/core/document-snapshot.js');

const preset = 'character-neris-vale';
const layer = (id, kind, properties = {}) => ({
  id,
  name: id,
  kind,
  visible: true,
  x: 0,
  y: 0,
  scale: 1,
  opacity: 1,
  ...properties,
});
const part = (id, anatomy, role = 'front') =>
  layer(id, 'image', {
    spatial: { role, z: role === 'rear' ? 0.019 : 0.12, clip: false },
    anatomy: { schema: 'card-character-part/1', part: anatomy, side: 'center' },
    splitSourceId: 'body',
  });
function document() {
  return Runtime.ensure({
    schema: 'card-atelier/1',
    id: 'test-card',
    name: 'Test card',
    width: 1024,
    height: 1536,
    previewMode: 'authored',
    cosmetics: { level: 'common' },
    layers: [
      part('near', 'forearm'),
      part('silk', 'skirt'),
      layer('title', 'text', { text: 'Neris' }),
      layer('body', 'foreground', {
        spatial: { role: 'body', z: 0.063, clip: false },
      }),
      part('cloak', 'cape', 'rear'),
      part('locks', 'hair'),
      layer('scene', 'background'),
    ],
    masks: { inset: 'original inset', motion: 'original motion' },
    effects: { cape: true, flow: true, paused: false },
  });
}

test('the character recipe keeps the authored masks, layers and shader, and stacks with foil', () => {
  const card = document();
  const before = structuredClone(card);
  Catalog.apply(card, preset);
  Catalog.apply(card, 'material-laser-collector');
  Runtime.validate(card);
  assert.deepEqual(card.layers, before.layers);
  assert.deepEqual(card.masks, before.masks);
  assert.deepEqual(card.shader, before.shader);
  assert.equal(card.material.style, 'laser-foil');
  assert.deepEqual(card.characterEffects, Effects.nerisVale);
  assert.equal(Cosmetics.resolve(card).composition.right, true);
  assert.equal(
    Cosmetics.resolve(card).layers.find((l) => l.id === 'body').spatial.z,
    0.063,
  );
});

test('only the selected wordmark crosses the selected drawable layer', () => {
  const card = document();
  const paint = [...card.layers].reverse();
  const config = { enabled: true, layerId: 'title', occluderId: 'silk' };
  const ids = (layers) => layers.map((l) => l.id);
  assert.deepEqual(ids(Effects.order(paint, config)), ids(paint));
  const reversed = Effects.order(paint, { ...config, enabled: false });
  assert.equal(
    reversed.indexOf(card.layers[2]),
    reversed.indexOf(card.layers[1]) + 1,
  );
  assert.deepEqual(
    ids(reversed).filter((id) => id !== 'title'),
    ids(paint).filter((id) => id !== 'title'),
  );
  assert.equal(
    Effects.order(paint, { ...config, occluderId: 'missing' }),
    paint,
  );
  assert.equal(Effects.order(paint, { ...config, layerId: 'missing' }), paint);
});

test('controls, layer bindings and the original art survive separate edits and workshop reload', () => {
  const card = Catalog.apply(document(), preset);
  const edited = snapshot(card);
  edited.characterEffects.hair.speed = 2;
  edited.characterEffects.bodyMotion = 'hair';
  edited.characterEffects.cape.enabled = false;
  edited.characterEffects.glow.color = '#fa7500';
  edited.characterEffects.wordmark.occluderId = 'silk';
  assert.equal(card.characterEffects.hair.speed, Effects.nerisVale.hair.speed);
  assert.equal(edited.characterEffects.sash.enabled, true);
  Runtime.validate(edited);
  const reopened = Workshop.resolve(
    JSON.parse(JSON.stringify(Workshop.create(edited, 'pack', 'active'))),
  );
  assert.deepEqual(reopened.characterEffects, edited.characterEffects);
  assert.equal(
    Effects.motionType(
      reopened.layers.find((l) => l.id === 'body'),
      reopened.characterEffects,
    ),
    'hair',
  );
  assert.equal(
    Effects.motionType(reopened.layers.find((l) => l.id === 'cloak')),
    'cape',
  );
  assert.equal(
    Effects.motionType(reopened.layers.find((l) => l.id === 'locks')),
    'hair',
  );
  assert.equal(
    Effects.motionType(reopened.layers.find((l) => l.id === 'silk')),
    'sash',
  );
  assert.ok(Cosmetics.dynamic(reopened));
  edited.characterEffects.hair.speed = 8;
  assert.throws(() => Runtime.validate(edited), /人物动效参数无效/);
});

test('edge toggles follow the actual contour aperture', () => {
  const frame = {
    width: 25,
    contour: {
      outline: [
        [80, 100],
        [940, 100],
        [940, 1480],
        [80, 1480],
      ],
      windows: [
        [
          [110, 130],
          [910, 130],
          [910, 1450],
          [110, 1450],
        ],
      ],
    },
  };
  const outside = [920 / 1024 - 0.5, 0];
  const sides = { top: true, right: false, bottom: false, left: true };
  assert.equal(Runtime.popOutAllowed(outside, frame, sides), false);
  assert.equal(
    Runtime.popOutAllowed(outside, frame, { ...sides, right: true }),
    true,
  );
  assert.equal(
    Runtime.popOutAllowed([0, 0], frame, {
      top: false,
      right: false,
      bottom: false,
      left: false,
    }),
    false,
  );
});
