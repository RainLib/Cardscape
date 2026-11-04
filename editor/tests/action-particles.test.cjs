const { test } = require('node:test'),
  assert = require('node:assert/strict');
const C = require('../dist/renderer/component-model.js'),
  A = require('../dist/renderer/character-animation-model.js'),
  R = require('../dist/renderer/runtime-model.js');
const World = require('../dist/renderer/particle-world-model.js');
function fixture() {
  const event = {
    id: 'spark',
    name: 'Spark',
    at: 0.25,
    duration: 1,
    boneId: 'root',
    particles: C.particles({
      enabled: true,
      count: 8,
      speed: 0,
      spread: 0,
      size: 0.01,
      emitter: {
        target: 'layer',
        layerId: 'arm',
        shape: 'point',
        u: 0.6,
        v: 0.6,
      },
    }),
  };
  const action = {
    id: 'cast',
    name: 'Cast',
    event: 'trigger',
    duration: 4,
    loop: false,
    motion: 1,
    emission: 1,
    bend: 0,
    particleEvents: [event],
    boneTracks: {
      root: {
        x: [{ at: 0, value: 50 }],
        rotation: [{ at: 0, value: 90 }],
        scale: [{ at: 0, value: 1.5 }],
        opacity: [{ at: 0, value: 0.5 }],
      },
    },
  };
  return R.ensure({
    spatial: { schema: 'card-spatial/1', enabled: true, cameraDistance: 2.7 },
    layers: [
      {
        id: 'arm',
        name: 'Arm',
        kind: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        spatial: { role: 'front', z: 0.12, clip: false },
      },
    ],
    characterRig: {
      schema: 'card-character-rig/1',
      bones: [
        {
          id: 'root',
          name: 'Root',
          parentId: null,
          x: 512,
          y: 768,
          rotation: 0,
          scale: 1,
        },
      ],
      bindings: [{ layerId: 'arm', boneId: 'root' }],
    },
    actions: [action],
  });
}
test('particle cues are half-open deterministic windows and multiple cues coexist', () => {
  const d = fixture(),
    a = d.actions[0];
  R.validate(d);
  assert.equal(C.actionParticleEvents(a, 0.2499).length, 0);
  assert.equal(C.actionParticleEvents(a, 0.25)[0].age, 0);
  assert.equal(C.actionParticleEvents(a, 0.5).length, 0);
  a.particleEvents.push({
    ...structuredClone(a.particleEvents[0]),
    id: 'second',
  });
  assert.equal(C.actionParticleEvents(a, 0.375).length, 2);
  assert.deepEqual(
    C.actionParticleEvents(a, 0.375),
    C.actionParticleEvents(a, 0.375),
  );
});
test('cue validation rejects invalid time, budgets, missing bones and corrupt particles', () => {
  for (const patch of [
    { at: NaN },
    { at: -0.1 },
    { at: 2 },
    { duration: 0 },
    { duration: 20 },
    { at: 0.99, duration: 1 },
    { boneId: 'missing' },
    { simulationSpace: 'invalid' },
    { id: 'bad/path' },
    { particles: {} },
  ]) {
    const d = fixture();
    Object.assign(d.actions[0].particleEvents[0], patch);
    assert.throws(() => R.validate(d));
  }
  const d = fixture();
  d.actions[0].particleEvents = Array.from({ length: 17 }, (_, i) => ({
    ...structuredClone(d.actions[0].particleEvents[0]),
    id: 'e' + i,
  }));
  assert.throws(() => R.validate(d), /16/);
  const duplicate = fixture();
  duplicate.actions[0].particleEvents.push(
    structuredClone(duplicate.actions[0].particleEvents[0]),
  );
  assert.throws(() => R.validate(duplicate), /事件/);
});
test('bone-follow particles transform registered source points, size, angle and opacity', () => {
  const d = fixture(),
    a = d.actions[0],
    event = a.particleEvents[0],
    pose = A.sample(d, a, 1.5, { seek: true });
  const base = new Float32Array(256 * 7),
    follow = new Float32Array(256 * 7),
    visuals = new Float32Array(256);
  const count = C.sampleCompositionInto(
    event.particles,
    0.5,
    d,
    0,
    base,
    visuals,
    5,
    0.5,
  );
  assert.equal(
    C.sampleEventInto(event, 0.5, d, 0, pose, follow, visuals, 5),
    count,
  );
  const registration = (2.7 - 0.165) / (2.7 - 0.045),
    m = pose.bones.get('root').matrix;
  for (let i = 0; i < count; i++) {
    const k = i * 7,
      x = (base[k] / registration) * 1024 + 512,
      y = 768 - (base[k + 1] / registration) * 1024;
    assert.ok(
      Math.abs(
        follow[k] - ((m[0] * x + m[2] * y + m[4] - 512) / 1024) * registration,
      ) < 1e-6,
    );
    assert.ok(
      Math.abs(
        follow[k + 1] +
          ((m[1] * x + m[3] * y + m[5] - 768) / 1024) * registration,
      ) < 1e-6,
    );
    assert.ok(Math.abs(follow[k + 3] - base[k + 3] * 1.5) < 1e-6);
    assert.ok(Math.abs(follow[k + 4] - base[k + 4] * 0.5) < 1e-6);
    assert.ok(Math.abs(follow[k + 5] - (base[k + 5] - Math.PI / 2)) < 1e-6);
  }
});
test('disabled, hidden and expired cues emit nothing without retaining stale samples', () => {
  const d = fixture(),
    a = d.actions[0],
    e = a.particleEvents[0],
    out = new Float32Array(256 * 7),
    visuals = new Float32Array(256),
    pose = A.sample(d, a, 1.5, { seek: true });
  for (const age of [-1, 1, 2, NaN])
    assert.equal(C.sampleEventInto(e, age, d, 0, pose, out, visuals), 0);
  d.layers[0].visible = false;
  assert.equal(C.sampleEventInto(e, 0.5, d, 0, pose, out, visuals), 0);
  R.validate(d);
  d.layers[0].visible = true;
  e.particles.enabled = false;
  assert.equal(C.actionParticleEvents(a, 0.375).length, 0);
  assert.equal(C.sampleEventInto(e, 0.5, d, 0, pose, out, visuals), 0);
});
test('card-space particles keep the exact birth bone transform across seeks and replay', () => {
  const d = fixture(),
    a = d.actions[0],
    event = a.particleEvents[0];
  event.simulationSpace = 'card';
  event.duration = 2;
  event.particles.lifetime = 0.6;
  a.boneTracks.root = {
    x: [
      { at: 0, value: 0 },
      { at: 1, value: 300 },
    ],
    rotation: [
      { at: 0, value: 0 },
      { at: 1, value: 120 },
    ],
    scale: [
      { at: 0, value: 1 },
      { at: 1, value: 2 },
    ],
    opacity: [
      { at: 0, value: 1 },
      { at: 1, value: 0.3 },
    ],
  };
  R.validate(d);
  function sample(age) {
    const out = new Float32Array(256 * 7),
      visuals = new Float32Array(256);
    const pose = A.sample(d, a, a.duration * event.at + age, { seek: true });
    const n = C.sampleEventInto(
      event,
      age,
      d,
      0,
      pose,
      out,
      visuals,
      16,
      (birth, id) =>
        A.sample(d, a, a.duration * event.at + birth, { seek: true }).bones.get(
          id,
        ),
    );
    const base = new Float32Array(256 * 7);
    C.sampleCompositionInto(event.particles, age, d, 0, base, visuals, 16, age);
    let differing = false;
    const registration = (2.7 - 0.165) / (2.7 - 0.045);
    for (let i = 0; i < n; i++) {
      const birth = C.particleBirth(event.particles, i, age);
      assert.ok(birth >= 0 && birth <= age);
      const bone = A.sample(d, a, a.duration * event.at + birth, {
        seek: true,
      }).bones.get('root');
      const [aa, b, c, dd, x, y] = bone.matrix,
        k = i * 7;
      const px = (base[k] / registration) * 1024 + 512,
        py = 768 - (base[k + 1] / registration) * 1024;
      assert.ok(
        Math.abs(
          out[k] - ((aa * px + c * py + x - 512) / 1024) * registration,
        ) < 1e-6,
      );
      assert.ok(
        Math.abs(
          out[k + 1] + ((b * px + dd * py + y - 768) / 1024) * registration,
        ) < 1e-6,
      );
      assert.ok(
        Math.abs(
          out[k + 3] - base[k + 3] * Math.sqrt(Math.abs(aa * dd - b * c)),
        ) < 1e-6,
      );
      assert.ok(
        Math.abs(out[k + 5] - (base[k + 5] - Math.atan2(b, aa))) < 1e-6,
      );
      assert.ok(Math.abs(out[k + 4] - base[k + 4] * bone.opacity) < 1e-6); // samples are away from event fades
      differing ||=
        Math.abs(bone.matrix[4] - pose.bones.get('root').matrix[4]) > 1;
    }
    assert.ok(
      differing,
      'old particles do not inherit the current moving emitter transform',
    );
    return Array.from(out.subarray(0, n * 7));
  }
  const expected = sample(0.8);
  sample(1.2);
  sample(0.2);
  assert.deepEqual(
    sample(0.8),
    expected,
    'reverse seeks and replay reconstruct the same particles',
  );
  assert.throws(
    () =>
      C.sampleEventInto(
        event,
        0.5,
        d,
        0,
        A.sample(d, a, 1.5, { seek: true }),
        new Float32Array(1792),
        new Float32Array(256),
      ),
    /出生姿态/,
  );
});
test('birth times respect grouped halo cycles, varied lifetimes and delayed reveal rays', () => {
  const p = C.particles({ enabled: true, lifetime: 0.6, trajectory: 'halo' });
  for (const visual of C.particleVisuals) {
    p.visual = visual;
    for (const time of [0, 0.1, 0.9, 2.1])
      for (let i = 0; i < 12; i++) {
        const born = C.particleBirth(p, i, time);
        assert.ok(Number.isFinite(born) && born >= 0 && born <= time + 0.13);
        if (!['krackle', 'starcore'].includes(visual))
          assert.ok(born <= time + 1e-12);
      }
  }
  p.visual = 'krackle';
  const t = 1.2,
    seed = (() => {
      const x = Math.sin(202 * 127.1 + p.seed * 311.7) * 43758.5453;
      return x - Math.floor(x);
    })(),
    cycle = Math.floor(t / p.lifetime + seed);
  for (let i = 0; i < 3; i++)
    assert.ok(
      Math.abs(
        C.particleBirth(p, i, t) -
          Math.max(0, (cycle - seed + i * 0.1) * p.lifetime),
      ) < 1e-10,
    );
  p.reveal = C.reveal({ profile: 'trails', stagger: 0.8, duration: 1 });
  assert.ok(C.particleBirth(p, 0, 0.5, 0) > C.particleBirth(p, 1, 0.5, 1));
  p.reveal.profile = 'burst';
  assert.equal(C.particleBirth(p, 0, 0.5, 0), 0);
  p.trajectory = 'field';
  assert.equal(C.particleBirth(p, 0, 100), 0);
});
test('action sprite assets survive real WebGL and Godot export', async () => {
  const fs = require('node:fs/promises'),
    path = require('node:path'),
    os = require('node:os');
  const { createServices } = require('../dist/electron/services.cjs');
  const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cardscape-particle-export-'),
    ),
    service = createServices({ runtimeDir: dir });
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  try {
    const d = fixture();
    Object.assign(d, {
      schema: 'card-atelier/1',
      id: 'cue-export',
      name: 'Cue export',
      width: 1024,
      height: 1536,
      masks: {},
      back: png,
    });
    d.layers[0].src = png;
    d.layers[0].locked = false;
    d.exportSettings = require('../dist/renderer/export-profile.js').config({
      remoteDelivery: true,
    });
    d.actions[0].particleEvents[0].particles = {
      ...d.actions[0].particleEvents[0].particles,
      visual: 'sprite',
      sprite: png,
    };
    d.actions[0].particleEvents[0].simulationSpace = 'card';
    d.actions[0].particleEvents[0].emissionDuration = 0.5;
    d.actions[0].particleEvents.push({
      ...structuredClone(d.actions[0].particleEvents[0]),
      id: 'ribbon',
      trail: { duration: 0.3, segments: 32 },
    });
    const result = await service.invoke('export', {
        document: d,
        front: png,
        layerRasters: {},
      }),
      base = result.directory;
    const manifest = JSON.parse(
      await fs.readFile(path.join(base, 'manifest.json'), 'utf8'),
    );
    const sprite = manifest.actions[0].particleEvents[0].particles.sprite;
    assert.equal(manifest.actions[0].particleEvents[0].simulationSpace, 'card');
    assert.equal(manifest.actions[0].particleEvents[0].emissionDuration, 0.5);
    assert.deepEqual(manifest.actions[0].particleEvents[1].trail, {
      duration: 0.3,
      segments: 32,
    });
    assert.match(
      await fs.readFile(
        path.join(base, 'godot/addons/cardscape/action_trail.gdshader'),
        'utf8',
      ),
      /section_alpha/,
    );
    assert.equal(sprite, 'particles/action-0-0.png');
    assert.deepEqual(
      await fs.readFile(path.join(base, sprite)),
      Buffer.from(png.split(',')[1], 'base64'),
    );
    const actions = JSON.parse(
      await fs.readFile(path.join(base, 'actions.json'), 'utf8'),
    );
    assert.equal(actions[0].particleEvents[0].particles.sprite, sprite);
    const resource = await fs.readFile(
        path.join(base, 'godot/library.tres'),
        'utf8',
      ),
      catalog = JSON.parse(JSON.parse(/^data_json = (.+)$/m.exec(resource)[1]));
    const nativeSprite =
      catalog.cards[0].actions[0].particleEvents[0].particles.sprite;
    assert.equal(
      catalog.cards[0].actions[0].particleEvents[0].simulationSpace,
      'card',
    );
    assert.match(nativeSprite, /^[a-f0-9]{64}\.png$/);
    assert.deepEqual(
      await fs.readFile(path.join(base, 'godot/assets', nativeSprite)),
      Buffer.from(png.split(',')[1], 'base64'),
    );
    const remoteRoot = path.join(base, 'remote'),
      catalogRemote = JSON.parse(
        await fs.readFile(path.join(remoteRoot, 'catalog.json'), 'utf8'),
      );
    const remote = require('../dist/renderer/remote-assets.js').create({
      fetcher: async (url) =>
        new Response(
          await fs.readFile(
            path.join(remoteRoot, new URL(url).pathname.slice(1)),
          ),
        ),
    });
    try {
      await remote.open('https://test.example/catalog.json');
      const loaded = await remote.loadCard(catalogRemote.cards[0].id),
        remoteSprite = loaded.actions[0].particleEvents[0].particles.sprite;
      assert.match(remoteSprite, /^blob:/);
      const bytes = Buffer.from(png.split(',')[1], 'base64'),
        digest = require('node:crypto')
          .createHash('sha256')
          .update(bytes)
          .digest('hex');
      assert.ok(catalogRemote.cards[0].webgl.base.includes(digest));
      assert.deepEqual(
        Buffer.from(await (await fetch(remoteSprite)).arrayBuffer()),
        bytes,
      );
    } finally {
      remote.close();
    }
    assert.equal(d.actions[0].particleEvents[0].particles.sprite, png);
  } finally {
    service.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
const B = require('../dist/renderer/particle-batch.js');
test('emission cutoff keeps old identities and stops later births, including zero duration', () => {
  const d = fixture(),
    a = d.actions[0],
    e = a.particleEvents[0];
  e.duration = 2;
  e.emissionDuration = 0.5;
  e.particles.lifetime = 0.6;
  const out = new Float32Array(256 * 7),
    base = new Float32Array(256 * 7),
    visuals = new Float32Array(256);
  const get = (age) => C.sampleEventInto(e, age, d, 0, null, out, visuals, 16);
  for (const age of [0.4, 0.5, 0.7, 1.2]) {
    const n = get(age);
    C.sampleCompositionInto(e.particles, age, d, 0, base, visuals, 16, age);
    for (let i = 0; i < n; i++) {
      assert.equal(
        out[i * 7],
        base[i * 7],
        'identity is not compacted/reseeded',
      );
      const allowed = C.particleBirth(e.particles, i, age) < e.emissionDuration;
      assert.equal(out[i * 7 + 4], allowed ? base[i * 7 + 4] : 0);
    }
  }
  get(1.2);
  assert.ok(
    Array.from(out.subarray(0, e.particles.count * 7))
      .filter((_, i) => i % 7 === 4)
      .every((v) => v === 0),
  );
  e.emissionDuration = 0;
  get(0.2);
  for (let i = 0; i < e.particles.count; i++) assert.equal(out[i * 7 + 4], 0);
  for (const trajectory of ['float', 'field']) {
    e.emissionDuration = 0.1;
    e.particles.trajectory = trajectory;
    get(0.8);
    for (let i = 0; i < e.particles.count; i++)
      assert.equal(
        out[i * 7 + 4],
        0,
        'non-cyclic fields drain within lifetime',
      );
  }
  for (const value of [-1, 3, NaN, '0.5']) {
    e.emissionDuration = value;
    assert.throws(() => R.validate(d), /发射时长/);
  }
});
test('connected ribbons sample historical bone/IK positions, join exactly and replay deterministically', () => {
  const d = fixture(),
    a = d.actions[0],
    e = a.particleEvents[0];
  e.duration = 2;
  e.trail = { duration: 0.4, segments: 32 };
  e.emissionDuration = 1;
  a.boneTracks.root.x = [
    { at: 0, value: 0 },
    { at: 1, value: 400 },
  ];
  a.boneTracks.root.rotation = [
    { at: 0, value: -45 },
    { at: 1, value: 135 },
  ];
  const out = new Float32Array(256 * 7),
    visuals = new Float32Array(256),
    packed = new Float32Array(256 * 60);
  const sample = (age) => {
    const n = C.sampleEventInto(
      e,
      age,
      d,
      0,
      A.sample(d, a, 1 + age, { seek: true }),
      out,
      visuals,
      16,
      (t, id) => A.sample(d, a, 1 + t, { seek: true }).bones.get(id),
    );
    return { n, data: Array.from(out.subarray(0, n * 7)) };
  };
  const first = sample(0.8);
  assert.equal(first.n, 17, 'segments consume the shared budget');
  const registration = (2.7 - 0.165) / (2.7 - 0.045);
  for (let i = 0; i < first.n; i++) {
    const t = 0.4 + (0.4 * i) / 16,
      m = A.sample(d, a, 1 + t, { seek: true }).bones.get('root').matrix;
    const x = 0.6 * 1024,
      y = 0.6 * 1536;
    assert.ok(
      Math.abs(
        out[i * 7] - ((m[0] * x + m[2] * y + m[4] - 512) / 1024) * registration,
      ) < 1e-6,
    );
    assert.ok(
      Math.abs(
        out[i * 7 + 1] +
          ((m[1] * x + m[3] * y + m[5] - 768) / 1024) * registration,
      ) < 1e-6,
    );
    assert.equal(visuals[i], -2);
  }
  const len = B.packTrail(out, first.n, packed);
  assert.equal(len, 16 * 6 * 10);
  for (let i = 0; i < 15; i++) {
    const current = (i * 6 + 2) * 10,
      next = (i + 1) * 6 * 10;
    assert.deepEqual(
      Array.from(packed.subarray(current, current + 3)),
      Array.from(packed.subarray(next, next + 3)),
      'adjacent triangles share their left edge',
    );
  }
  sample(1.1);
  sample(0.1);
  assert.deepEqual(sample(0.8), first);
  const fading = sample(1.2);
  assert.equal(fading.n, 17);
  assert.ok(
    out[(fading.n - 1) * 7 + 5] < 1,
    'head stays at the last emission while the tail catches up',
  );
  assert.equal(sample(1.41).n, 0);
  assert.throws(
    () =>
      C.sampleEventInto(
        e,
        0.5,
        d,
        0,
        A.sample(d, a, 1.5, { seek: true }),
        out,
        visuals,
      ),
    /历史姿态/,
  );
  d.layers[0].visible = false;
  assert.equal(sample(0.8).n, 0);
  d.layers[0].visible = true;
  e.particles.enabled = false;
  assert.equal(sample(0.8).n, 0);
  e.particles.enabled = true;
  for (const trail of [
    { duration: 0, segments: 32 },
    { duration: 0.4, segments: 65 },
    { duration: 0.4, segments: 4.5 },
    null,
  ]) {
    e.trail = trail;
    assert.throws(() => R.validate(d), /剑痕/);
  }
});
test('ribbon packing remains finite at static and reversing emitters, with bounded miter joins', () => {
  const samples = new Float32Array([
    0, 0, 0, 0.02, 1, -1, 0, 1, 0, 0, 0.02, 1, 0, 0, 0, 0, 0, 0.02, 1, 1, 0,
  ]);
  const packed = new Float32Array(120);
  assert.equal(B.packTrail(samples, 3, packed), 120);
  assert.ok(Array.from(packed).every(Number.isFinite));
  for (let i = 0; i < 3; i++) {
    samples[i * 7] = 0;
    samples[i * 7 + 1] = 0;
  }
  B.packTrail(samples, 3, packed);
  assert.ok(Array.from(packed).every(Number.isFinite));
  assert.throws(() => B.packTrail(samples, 3, new Float32Array(10)), /缓冲区/);
});
test('bone removal protects connected ribbon bindings before changing the document', () => {
  const d = fixture(),
    e = d.actions[0].particleEvents[0];
  e.trail = { duration: 0.3, segments: 16 };
  const before = JSON.stringify(d);
  assert.throws(() => A.removeBone(d, 'root'), /连续剑痕/);
  assert.equal(JSON.stringify(d), before);
  delete e.trail;
  A.removeBone(d, 'root');
  assert.equal(e.boneId, undefined);
  R.validate(d);
});


test('world particles freeze the complete birth root, including size, alpha and face selection', () => {
  const doc = fixture(), action = doc.actions[0], event = action.particleEvents[0];
  event.duration=2; event.particles.lifetime=.6; event.particles.emitter.side='both';
  const sampleBone=(birth,id)=>A.sample(doc,action,action.duration*event.at+birth,{seek:true}).bones.get(id);
  const sample=(mode,facing=0,sampler=()=>({angle:[Math.PI/2,0],root:[2,3,4,1.5,.25]}))=>{
    event.simulationSpace=mode; const output=new Float64Array(256*7),visuals=new Float32Array(256);
    const n=C.sampleEventInto(event,.8,doc,facing,A.sample(doc,action,1.8,{seek:true}),output,visuals,32,sampleBone,sampler);
    return Array.from(output.subarray(0,n*7));
  };
  const local=sample('card');
  const world=sample('world',Math.PI);
  assert.ok(world.length>0);
  for(let k=0;k<world.length;k+=7){
    assert.ok(Math.abs(world[k]-(local[k+2]*1.5+2))<1e-10);
    assert.ok(Math.abs(world[k+1]-(local[k+1]*1.5+3))<1e-10);
    assert.ok(Math.abs(world[k+2]-(-local[k]*1.5+4))<1e-10);
    assert.ok(Math.abs(world[k+3]-local[k+3]*1.5)<1e-10);
    assert.ok(Math.abs(world[k+4]-local[k+4]*.25)<1e-10);
  }
  assert.deepEqual(sample('world',0),world,'current card facing does not move or hide existing particles');
  event.particles.emitter.side='front';
  const front=sample('world',Math.PI,()=>({angle:[0,0],root:[0,0,0,1,1]}));
  assert.ok(front.filter((_,i)=>i%7===4).some(v=>v>0));
  const back=sample('world',0,()=>({angle:[Math.PI,0],root:[0,0,0,1,1]}));
  assert.ok(back.filter((_,i)=>i%7===4).every(v=>v===0),'front-only births on the back stay invisible');
});

test('world particles require a historical sampler and reject malformed GPU transforms',()=>{
  const doc=fixture(),event=doc.actions[0].particleEvents[0];event.simulationSpace='world';delete event.boneId;
  const out=new Float64Array(256*7),visuals=new Float32Array(256);
  assert.throws(()=>C.sampleEventInto(event,.5,doc,0,null,out,visuals),/整卡历史变换/);
  for(const pose of [{angle:[0,0],root:[]},{angle:[NaN,0],root:[0,0,0,1,1]}])
    assert.throws(()=>C.sampleEventInto(event,.5,doc,0,null,out,visuals,32,undefined,()=>pose),/变换无效/);
});

test('world ribbon sections and Cosmic offsets use their individual historical roots',()=>{
  const doc=fixture(),action=doc.actions[0],event=action.particleEvents[0];
  event.duration=2;event.trail={duration:.3,segments:8};
  const bone=(t,id)=>A.sample(doc,action,action.duration*event.at+t,{seek:true}).bones.get(id);
  function sample(mode,offset=0){event.simulationSpace=mode;const out=new Float64Array(256*7),visuals=new Float32Array(256);const n=C.sampleEventInto(event,.8,doc,0,A.sample(doc,action,1.8,{seek:true}),out,visuals,32,bone,t=>({angle:[0,0],root:[t*2,0,0,2,.5]}),offset);return Array.from(out.subarray(0,n*7));}
  const local=sample('card'),world=sample('world');assert.equal(world.length,9*7);
  for(let i=0;i<9;i++){const k=i*7,t=.5+.3*i/8;assert.ok(Math.abs(world[k]-(local[k]*2+t*2))<1e-10);assert.equal(world[k+3],local[k+3]*2);assert.equal(world[k+4],local[k+4]*.5);}
  delete event.trail;const main=sample('world'),front=sample('world',.2);
  for(let k=0;k<main.length;k+=7)assert.ok(Math.abs(front[k+2]-main[k+2]-.4)<1e-10);
});

test('world placement history interpolates, isolates inputs, preserves paused/reverse history and stays bounded',()=>{
  const h=World.history(),a={angle:[359*Math.PI/180,0],root:[0,0,0,1,1]},b={angle:[Math.PI/180,0],root:[2,4,6,2,.5]};
  h.record(0,a);h.record(1,b);a.root[0]=900;const middle=h.sample(.5);
  assert.ok(Math.abs(Math.sin(middle.angle[0]))<1e-10);assert.deepEqual(middle.root,[1,2,3,1.5,.75]);
  const end=h.sample(1);h.record(1,a);h.record(.5,a);assert.deepEqual(h.sample(1),end);
  end.root[0]=700;assert.equal(h.sample(1).root[0],2);
  for(let i=2;i<10000;i++)h.record(i/30+1,b);assert.ok(h.size<=1024);
  assert.deepEqual(h.sample(-1).root,b.root,'unobserved old history holds the nearest retained placement');
  h.clear();assert.equal(h.size,0);assert.equal(h.sample(0),undefined);
});


test('world ribbon width follows its birth plane in 3D instead of flattening to screen XY',()=>{
 const samples=new Float64Array([-1,0,0,.1,1,-1,0,0,0,0,.1,1,0,0,1,0,0,.1,1,1,0]);
 const frames=new Float64Array(18);for(let i=0;i<3;i++)World.frame(frames,i*6,{angle:[0,Math.PI/2],root:[0,0,0,1,1]});
 const buffer=new Float32Array(256*60),length=B.packTrail(samples,3,buffer,frames);assert.equal(length,120);
 for(let at=0;at<length;at+=B.stride){assert.ok(Math.abs(buffer[at+1])<1e-8);assert.ok(Math.abs(Math.abs(buffer[at+2])-.1)<1e-7);}
 assert.deepEqual(Array.from(buffer.subarray(20,23)),Array.from(buffer.subarray(60,63)),'the shared cross section has identical 3D vertices');
});


test('physical cues launch in emitter coordinates, collide in simulation space and preserve seek identities',()=>{
 const P=require('../dist/renderer/particle-physics-model.js'),doc=fixture(),action=doc.actions[0],event=action.particleEvents[0];
 delete event.boneId;event.simulationSpace='card';event.duration=2;
 event.particles=C.particles({enabled:true,count:8,lifetime:12,size:.01,z:0,emitter:{target:'card',shape:'point',u:.5,v:.5,side:'both'}});
 event.physics={...P.defaults(),velocity:[1,0,0],spread:[0,0,0],gravity:[0,0,0],planes:[],radius:0};R.validate(doc);
 function sample(age,root){const out=new Float64Array(256*7),visuals=new Float32Array(256);const n=C.sampleEventInto(event,age,doc,0,null,out,visuals,32,undefined,root);return Array.from(out.subarray(0,n*7));}
 const card=sample(.2);for(let i=0;i<card.length/7;i++)assert.ok(Math.abs(card[i*7]-(.2-C.particleBirth(event.particles,i,.2)))<1e-8);
 event.simulationSpace='world';event.physics.restitution=1;event.physics.planes=[{id:'depth-wall',normal:[0,0,1],distance:-.15}];
 const root=()=>({angle:[Math.PI/2,0],root:[.1,0,0,2,1]});const world=sample(.15,root);
 for(let i=0;i<world.length/7;i++){const dt=.15-C.particleBirth(event.particles,i,.15),z=dt>.075?-.15+2*(dt-.075)+1e-6:-2*dt;assert.ok(Math.abs(world[i*7+2]-z)<2e-6);assert.ok(Math.abs(world[i*7]-.1)<1e-8);}
 sample(.6,root);sample(.05,root);assert.deepEqual(sample(.15,root),world);
 event.simulationSpace='bone';assert.throws(()=>R.validate(doc),/物理需要/);event.simulationSpace='world';event.physics.drag=.2;assert.throws(()=>R.validate(doc),/不支持的粒子物理/);
});
