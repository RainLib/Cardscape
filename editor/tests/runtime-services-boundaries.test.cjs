const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const Remote = require('../dist/renderer/remote-assets.js');
const Adaptive = require('../dist/renderer/adaptive-textures.js');
const Project = require('../dist/electron/material-maker-project.cjs');
const {
  createMaterialMaker,
} = require('../dist/electron/material-maker-service.cjs');

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));
const hash = (value) => createHash('sha256').update(value).digest('hex');
function catalog(payload) {
  const id = hash(payload);
  const dependency = { definition: id, base: [id], detail: [] };
  return {
    schema: 'cardscape-remote/1',
    runtimeVersion: 1,
    release: 'a'.repeat(64),
    objects: {
      [id]: {
        path: `objects/${id}.json`,
        mime: 'application/json',
        compression: 'identity',
        bytes: payload.length,
        downloadBytes: payload.length,
      },
    },
    cards: [{ id: 'card', webgl: dependency, godot: dependency }],
  };
}

test('remote catalog validation rejects malformed JSON fields before requests begin', () => {
  const valid = catalog(bytes({ manifest: {} }));
  assert.equal(Remote.validate(valid), valid);
  for (const invalid of [
    null,
    [],
    { ...valid, objects: [] },
    { ...valid, release: 1 },
    { ...valid, cards: [null] },
    { ...valid, cards: [{ ...valid.cards[0], id: 1 }] },
  ]) {
    assert.throws(() => Remote.validate(invalid), /远端/);
  }
  const id = Object.keys(valid.objects)[0];
  for (const replacement of [
    null,
    { ...valid.objects[id], mime: 1 },
    { ...valid.objects[id], bytes: '20' },
    { ...valid.objects[id], compression: { toString: () => 'gzip' } },
  ]) {
    assert.throws(
      () => Remote.validate({ ...valid, objects: { [id]: replacement } }),
      /对象/,
    );
  }
  const inherited = { definition: 'toString', base: [], detail: [] };
  assert.throws(
    () =>
      Remote.validate({
        ...valid,
        cards: [{ id: 'card', webgl: inherited, godot: inherited }],
      }),
    /依赖/,
  );
});

test('remote component expansion preserves opaque JSON keys without changing prototypes', async () => {
  const payload = bytes(
    JSON.parse(
      '{"manifest":{},"__proto__":{"extension":true},"metadata":{"constructor":{"tag":"plugin"}}}',
    ),
  );
  const index = catalog(payload);
  const client = Remote.create({
    fetcher: async (url) =>
      new Response(
        String(url).endsWith('catalog.json') ? bytes(index) : payload,
      ),
  });
  try {
    await client.open('https://example.com/catalog.json');
    const content = await client.loadCard('card');
    assert.equal(Object.getPrototypeOf(content), Object.prototype);
    assert.equal(Object.hasOwn(content, '__proto__'), true);
    assert.deepEqual(content.__proto__, { extension: true });
    assert.deepEqual(content.metadata.constructor, { tag: 'plugin' });
    assert.equal({}.extension, undefined);
  } finally {
    client.close();
  }
});

test('remote loading reports non-Error retries and rejects scalar definitions', async () => {
  const payload = bytes(7),
    index = catalog(payload),
    progress = [];
  let calls = 0;
  const client = Remote.create({
    progress: (state) => progress.push(state),
    fetcher: async (url) => {
      if (++calls === 1) throw 'temporary transport failure';
      return new Response(
        String(url).endsWith('catalog.json') ? bytes(index) : payload,
      );
    },
  });
  try {
    await client.open('https://example.com/catalog.json');
    assert.equal(
      progress.find((state) => state.stage === 'retry').message,
      'temporary transport failure',
    );
    await assert.rejects(client.loadCard('card'), /定义无效/);
  } finally {
    client.close();
  }
});

test('adaptive texture batches retain entry identities, cap parallel decodes and survive non-Error failures', async () => {
  const entries = Array.from({ length: 10 }, (_, id) => ({
    id,
    variants: { large: { asset: `image-${id}` } },
  }));
  let active = 0,
    peak = 0,
    fail = false;
  const commits = [],
    statuses = [];
  const loader = Adaptive.create({
    entries: () => entries,
    load: async (src) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(setImmediate);
      active--;
      if (fail) throw 'decode unavailable';
      return { src };
    },
    apply: (batch) => commits.push(batch),
    status: (state) => statuses.push(state),
  });
  try {
    await loader.set('large');
    assert.equal(peak, 4);
    assert.equal(commits[0].length, 10);
    assert.equal(commits[0][0].entry, entries[0]);
    assert.equal(commits[0][0].variant, entries[0].variants.large);
    fail = true;
    await loader.set('small');
    assert.equal(loader.current, 'large');
    assert.equal(commits.length, 1);
    assert.equal(statuses.at(-1).error, 'decode unavailable');
    fail = false;
    await loader.set('small');
    assert.equal(loader.current, 'small');
  } finally {
    loader.dispose();
  }
});

test('Material Maker validates consumed graph fields while retaining extension metadata', () => {
  const valid = Project.prepare(null, { source: '/tmp/input.png' });
  valid.plugin = { metadata: [1, 2] };
  valid.nodes[0].parameters.plugin = { quality: 'high' };
  assert.deepEqual(Project.portable(valid).plugin, valid.plugin);
  for (const mutate of [
    (p) => p.nodes.push(null),
    (p) => (p.nodes[0].parameters = []),
    (p) => (p.nodes[0].shader_model = []),
    (p) => p.connections.push(null),
    (p) => (p.nodes[1].shader_model.exports[Project.PROFILE].files = [null]),
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => Project.validateProject(invalid), /Material Maker/);
  }
  delete valid.nodes.find((n) => n.name === 'CardscapeInput_source').parameters;
  assert.equal(
    Project.portable(valid).nodes.find(
      (n) => n.name === 'CardscapeInput_source',
    ).parameters.image,
    'source.png',
  );
});

test('Material Maker rejects corrupt persisted jobs and ignores malformed heartbeat fields', async () => {
  const runtimeDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'cardscape-typed-mm-'),
  );
  const id = randomUUID(),
    directory = path.join(runtimeDir, 'material-maker/jobs', id);
  const service = createMaterialMaker({
    runtimeDir,
    write: fs.writeFile,
    processImage: async () => {
      throw Error('Unexpected image processing');
    },
  });
  try {
    await fs.mkdir(directory, { recursive: true });
    const job = {
      id,
      documentToken: 'token',
      documentId: 'card',
      layerId: 'layer',
      revision: 1,
      exportHash: null,
      plugin: { retained: true },
    };
    for (const invalid of [
      null,
      { ...job, revision: '1' },
      { ...job, documentToken: 1 },
      { ...job, id: randomUUID() },
    ]) {
      await fs.writeFile(
        path.join(directory, 'job.json'),
        JSON.stringify(invalid),
      );
      await assert.rejects(
        service.invoke('material-maker-inspect', { id }),
        /任务数据无效/,
      );
    }
    await fs.writeFile(path.join(directory, 'job.json'), JSON.stringify(job));
    await fs.writeFile(
      path.join(directory, 'native-state.json'),
      JSON.stringify({
        pid: String(process.pid),
        at: Date.now() / 1000,
        phase: ['exported'],
      }),
    );
    const inspected = await service.invoke('material-maker-inspect', { id });
    assert.equal(inspected.running, false);
    assert.equal(inspected.native.phase, undefined);
    assert.deepEqual(inspected.plugin, { retained: true });
    // A frame or other procedural layer has no source bitmap to capture.
    await fs.writeFile(
      path.join(directory, 'native-state.json'),
      JSON.stringify({
        pid: process.pid,
        at: Date.now() / 1000,
        phase: 'ready',
      }),
    );
    const reattached = await service.invoke('material-maker-open', {
      documentId: 'card',
      documentToken: 'token',
      layerId: 'layer',
      revision: 1,
      source: null,
      masks: null,
    });
    assert.equal(reattached.reattached, true);
    await service.invoke('material-maker-bind', {
      id,
      documentToken: 'token',
      layerId: 'layer',
      revision: 2,
    });
    const saved = JSON.parse(
      await fs.readFile(path.join(directory, 'job.json')),
    );
    assert.equal(saved.revision, 2);
    assert.equal(saved.directory, undefined);
    assert.deepEqual(saved.plugin, { retained: true });
    await assert.rejects(
      service.invoke('material-maker-inspect', null),
      /任务数据无效/,
    );
  } finally {
    service.close();
    await fs.rm(runtimeDir, { recursive: true, force: true });
  }
});
