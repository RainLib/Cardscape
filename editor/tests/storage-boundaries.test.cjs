const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServices } = require('../dist/electron/services.cjs');

const card = () => ({
  schema: 'card-atelier/1',
  id: 'boundary',
  name: '边界测试',
  width: 1024,
  height: 1536,
  layers: [],
  masks: {},
  effects: {},
});

test('invalid recovery metadata falls back to saved project and a failed write does not block the queue', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'card-storage-guard-'));
  const service = createServices({ runtimeDir: dir });
  try {
    const saved = await service.invoke('save', { document: card() });
    const original = await fs.readFile(saved.file);
    await fs.mkdir(path.join(dir, 'editor-session'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'editor-session/current.json'),
      JSON.stringify({
        schema: 'card-editor-session/1',
        sourceFile: { file: saved.file },
        project: card(),
        view: {},
        revision: 1,
        savedRevision: 0,
        at: Date.now(),
      }),
    );
    const boot = await service.invoke('bootstrap');
    assert.match(boot.recoveryError, /恢复记录格式/);
    assert.equal(boot.document.name, '边界测试');
    const args = {
      token: boot.sessionToken,
      sequence: 1,
      revision: 1,
      savedRevision: 0,
      project: card(),
      view: { mode: 'edit' },
    };
    await assert.rejects(
      service.invoke('editor-session-save', { ...args, revision: '1' }),
      /版本/,
    );
    const result = await service.invoke('editor-session-save', args);
    assert.equal(result.sequence, 1);
    const recovered = await service.invoke('bootstrap');
    assert.equal(recovered.document.id, 'boundary');
    assert.equal(recovered.recovery.revision, 1);
    assert.deepEqual(await fs.readFile(saved.file), original);
  } finally {
    service.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('recent project index skips malformed entries while preserving valid summaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'card-recent-guard-'));
  const service = createServices({ runtimeDir: dir });
  try {
    const staged = await service.invoke('home-new', { document: card() });
    await service.invoke('home-activate', { ticket: staged.ticket });
    const index = path.join(dir, 'recent-projects.json');
    const valid = JSON.parse(await fs.readFile(index, 'utf8')).entries[0];
    await fs.writeFile(
      index,
      JSON.stringify({
        version: 1,
        entries: [
          null,
          {},
          { ...valid, cards: [{ id: 123, name: 'broken', thumbnail: '' }] },
          { ...valid, at: 'yesterday' },
          valid,
        ],
      }),
    );
    const home = await service.invoke('home-list');
    assert.equal(home.entries.length, 1);
    assert.equal(home.entries[0].id, valid.id);
    assert.equal(home.entries[0].cards[0].id, 'boundary');
  } finally {
    service.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('checkpoint metadata rejects unexpected field types and paths outside its checkpoint files', async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'card-checkpoint-guard-'),
  );
  const service = createServices({ runtimeDir: dir });
  try {
    const meta = await service.invoke('production-checkpoint', {
      document: card(),
    });
    const file = path.join(dir, 'production-checkpoints/boundary.json');
    await fs.writeFile(
      file,
      JSON.stringify({ ...meta, file: path.join(dir, 'outside.cardproj') }),
    );
    await assert.rejects(
      service.invoke('production-checkpoint-open', { id: 'boundary' }),
      /路径/,
    );
    await fs.writeFile(file, JSON.stringify({ ...meta, revision: '1' }));
    await assert.rejects(
      service.invoke('production-checkpoint-info', { id: 'boundary' }),
      /元数据/,
    );
  } finally {
    service.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
