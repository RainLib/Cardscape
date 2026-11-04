import { productionAudio } from './production-audio-fixture.mts';
import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { CardDocument } from '../shared/document';
import type { CharacterAction } from '../shared/character';
import type { PreviewAPI } from '../shared/preview';
import { assembleGuardian } from './production-card-fixture.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const R = require('../dist/renderer/runtime-model.js'),
  F = require('../dist/renderer/frame-model.js'),
  C = require('../dist/renderer/character-animation-model.js');
const Stats = require('../dist/renderer/card-stats.js'),
  Batch = require('../dist/renderer/particle-batch.js'),
  Components = require('../dist/renderer/component-model.js'),
  Audit = require('../dist/renderer/character-motion-audit.js');
const Workshop = require('../dist/renderer/workshop-model.js'),
  Storage = require('../dist/electron/workshop-storage.cjs');
const assets = join(root, 'examples/production-card/arcane-sentinel'),
  runs = join(root, 'qa/production-readiness/arcane-sentinel');
const output = join(runs, 'run-' + Date.now()),
  runtime = join(output, 'runtime'),
  project = join(output, '星炉哨卫.cardproj'),
  exportBase = join(output, 'exports');
await mkdir(exportBase, { recursive: true });
const data = async (name: string) =>
  'data:image/png;base64,' +
  (await readFile(join(assets, name))).toString('base64');
const [atlas, background, back] = await Promise.all([
  data('parts-atlas.png'),
  data('background.png'),
  data('back.png'),
]);
const audio = productionAudio();
await mkdir(join(assets, 'audio'), { recursive: true });
for (const [name, bytes] of Object.entries(audio))
  await writeFile(join(assets, 'audio', name + '.wav'), bytes);
await writeFile(
  join(assets, 'audio', 'generation.json'),
  JSON.stringify(
    {
      source: 'scripts/production-audio-fixture.mts',
      kind: 'Original deterministic synthesis, no external samples',
      sampleRate: 48000,
      encoding: 'PCM16 mono WAV',
      sha256: Object.fromEntries(
        Object.entries(audio).map(([name, b]) => [
          name,
          createHash('sha256').update(b).digest('hex'),
        ]),
      ),
    },
    null,
    2,
  ),
);
const sourceHashes = Object.fromEntries(
  await Promise.all(
    ['parts-atlas.png', 'background.png', 'back.png'].map(async (name) => [
      name,
      createHash('sha256')
        .update(await readFile(join(assets, name)))
        .digest('hex'),
    ]),
  ),
);
const base = R.ensure({
  schema: 'card-atelier/1',
  name: '星炉哨卫',
  width: 1024,
  height: 1536,
  layers: [],
  masks: {},
  previewMode: 'authored',
  effects: {
    depth: 0.7,
    background: 1,
    cape: true,
    flow: true,
    frame: true,
    paused: true,
  },
  deformation: { bend: 0, wind: 0.32, speed: 0.8 },
  spatial: { schema: 'card-spatial/1', enabled: true, cameraDistance: 2.7 },
  cosmetics: {
    level: 'authored',
    finish: 'original',
    flare: 'authored',
    quality: 'balanced',
    border: 'custom',
  },
  frameStyle: {
    ...F.defaults,
    name: '星炉铜框',
    color: '#765130',
    accent: '#f3cc81',
    width: 26,
    depth: 24,
    finish: 'metal',
    animation: 'pulse',
    animationSpeed: 0.45,
    contour: {
      outline: [
        [100, 20],
        [924, 20],
        [1004, 100],
        [1004, 1436],
        [924, 1516],
        [100, 1516],
        [20, 1436],
        [20, 100],
      ],
      windows: [
        [
          [130, 96],
          [894, 96],
          [940, 142],
          [940, 1200],
          [890, 1250],
          [134, 1250],
          [84, 1200],
          [84, 142],
        ],
        [
          [160, 1330],
          [864, 1330],
          [864, 1450],
          [160, 1450],
        ],
      ],
    },
  },
  armor: {
    enabled: true,
    strength: 0.24,
    duration: 0.7,
    period: 4,
    width: 0.12,
    color: '#ffd38c',
  },
});
base.material = Components.material({ enabled: false });
base.particles = Components.particles({
  enabled: true,
  count: 24,
  visual: 'glimmer',
  color: '#83e7f5',
  palette: 'solid',
  size: 0.012,
  speed: 0.06,
  lifetime: 2.6,
  z: 0.1,
  opacity: 0.65,
  placement: 'surface',
  emitter: {
    target: 'card',
    shape: 'ellipse',
    u: 0.5,
    v: 0.46,
    width: 0.75,
    height: 0.78,
    side: 'front',
  },
});
const app = await electron.launch({
  executablePath: require('electron'),
  args: [root, '--force-device-scale-factor=1', '--disable-gpu-watchdog'],
  timeout: 60000,
  env: { ...process.env, ATELIER_RUNTIME: runtime, ATELIER_BACKGROUND: '1' },
});
const errors: string[] = [];
let servedDirectory = '';
const server = createServer(async (request, response) => {
  try {
    const file = resolve(
      servedDirectory,
      '.' +
        decodeURIComponent(
          new URL(request.url || '/', 'http://localhost').pathname,
        ),
    );
    if (!file.startsWith(servedDirectory + sep)) throw Error('Outside export');
    response.setHeader(
      'Content-Type',
      (
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.wav': 'audio/wav',
          '.png': 'image/png',
          '.webp': 'image/webp',
        } as Record<string, string>
      )[extname(file)] || 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});
try {
  const deadline = Date.now() + 60000;
  while (!app.windows().some((p) => p.url().endsWith('/index.html'))) {
    if (Date.now() > deadline) throw Error('Editor did not open');
    await new Promise((r) => setTimeout(r, 50));
  }
  const page = app.windows().find((p) => p.url().endsWith('/index.html'))!;
  const editorUrl = page.url();
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.stack);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('RENDERER', message.text());
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true',
    null,
    { timeout: 60000 },
  );
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.setBackgroundThrottling(false);
      w.setOpacity(0);
      w.setIgnoreMouseEvents(true);
      w.showInactive();
    }
  });
  const prepared = await page.evaluate(assembleGuardian, {
    atlas,
    background,
    back,
    base,
    particleBase: Components.particles(base.particles),
    audio: Object.fromEntries(
      Object.entries(audio).map(([name, bytes]) => [
        name,
        'data:audio/wav;base64,' + bytes.toString('base64'),
      ]),
    ) as { swish: string; charge: string; impact: string },
  });
  // Compare the persisted JSON domain (-0 is serialized as 0).
  const doc: CardDocument = R.ensure(
    JSON.parse(JSON.stringify(prepared.document)),
  );
  Stats.apply(doc, { cost: 4, power: 7, visible: true });
  R.validate(doc);
  const audits = [];
  for (const action of doc.actions || []) {
    const report = Audit.audit(doc, action, { fps: 120 });
    audits.push({ id: action.id, ...report });
    assert.ok(report.ok, JSON.stringify(audits.at(-1)));
  }
  await writeFile(project, JSON.stringify(doc));
  await writeFile(
    join(output, 'assembly.png'),
    Buffer.from(prepared.assembly.split(',')[1], 'base64'),
  );
  await writeFile(
    join(output, 'part-plan.json'),
    JSON.stringify(
      {
        sourceHashes,
        registrations: prepared.registrations,
        rig: doc.characterRig,
        actions: doc.actions,
        audits,
      },
      null,
      2,
    ),
  );
  console.log(
    'PRODUCTION_CARD_PREPARED',
    JSON.stringify({
      project,
      layers: doc.layers.length,
      bones: doc.characterRig!.bones.length,
      audits: audits.map((a) => ({ id: a.id, ok: a.ok })),
    }),
  );
  await app.evaluate(
    ({ dialog }, { project, exportBase }) => {
      dialog.showOpenDialog = async (
        ...args:
          | [unknown, import('electron').OpenDialogOptions]
          | [import('electron').OpenDialogOptions]
      ) => ({
        canceled: false,
        filePaths: (args.length === 2 ? args[1] : args[0]).properties?.includes(
          'openDirectory',
        )
          ? [exportBase]
          : [project],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: project,
      });
    },
    { project, exportBase },
  );
  await page.locator('#home-open').click({ force: true });
  await page.waitForFunction(
    () =>
      document.body.dataset.appMode === 'editor' &&
      !window.cardEditorHost.state().busy,
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    window.atelierWorkspace.ensurePreview();
    window.cardPreview.setPaused!(true);
  });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('#author-model-canvas')?.dataset
        .mode === 'authored-grid',
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.atelierAnimation.open());
  await page.locator('#timeline-action').selectOption('cast');
  await page
    .locator('#timeline-particles')
    .evaluate((element) => ((element as HTMLDetailsElement).open = true));
  await page.locator('#timeline-particle-add').click({ force: true });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions?.find((a) => a.id === 'cast')?.particleEvents
        ?.length === 3,
  );
  await page
    .getByRole('textbox', { name: '事件名称', exact: true })
    .fill('UI 粒子编辑验收');
  await page
    .getByRole('textbox', { name: '事件名称', exact: true })
    .dispatchEvent('change');
  assert.equal(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions!.find((a) => a.id === 'cast')!
          .particleEvents!.at(-1)!.name,
    ),
    'UI 粒子编辑验收',
  );
  await page.getByLabel('动作粒子预设', { exact: true }).selectOption('blade');
  await page
    .getByLabel('跟随骨骼', { exact: true })
    .selectOption('right-forearm');
  await page.getByLabel('提前停止发射', { exact: true }).check({ force: true });
  await page.getByLabel('发射时长（秒）', { exact: true }).fill('.3');
  await page
    .getByLabel('发射时长（秒）', { exact: true })
    .dispatchEvent('change');
  await page.getByLabel('连续剑痕', { exact: true }).check({ force: true });
  await page.getByLabel('剑痕留存（秒）', { exact: true }).fill('.4');
  await page
    .getByLabel('剑痕留存（秒）', { exact: true })
    .dispatchEvent('change');
  assert.deepEqual(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions!.find((a) => a.id === 'cast')!
          .particleEvents!.at(-1)!.trail,
    ),
    { duration: 0.4, segments: 32 },
  );
  await page.getByLabel('连续剑痕', { exact: true }).uncheck({ force: true });
  await page.getByLabel('粒子寿命（秒）', { exact: true }).fill('0.7');
  await page
    .getByLabel('粒子寿命（秒）', { exact: true })
    .dispatchEvent('change');
  await page.getByLabel('事件粒子混合', { exact: true }).selectOption('normal');
  await page.getByLabel('启用事件爆发', { exact: true }).check({ force: true });
  await page.getByLabel('爆发粒子数量', { exact: true }).fill('24');
  await page
    .getByLabel('爆发粒子数量', { exact: true })
    .dispatchEvent('change');
  await page.getByLabel('事件粒子 PNG', { exact: true }).setInputFiles({
    name: 'particle.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'cast')!
        .particleEvents!.at(-1)!.particles.visual === 'sprite',
  );
  const editedParticle = await page.evaluate(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'cast')!
        .particleEvents!.at(-1)!,
  );
  await page.getByLabel('粒子模拟空间', { exact: true }).selectOption('world');
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'cast')!
        .particleEvents!.at(-1)!.simulationSpace === 'world',
  );
  await page.getByLabel('粒子模拟空间', { exact: true }).selectOption('card');
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'cast')!
        .particleEvents!.at(-1)!.simulationSpace === 'card',
  );
  assert.equal(editedParticle.simulationSpace, 'card');
  assert.equal(editedParticle.emissionDuration, 0.3);
  assert.equal(editedParticle.particles.lifetime, 0.7);
  assert.equal(editedParticle.particles.blend, 'normal');
  assert.equal(editedParticle.particles.reveal.enabled, true);
  assert.equal(editedParticle.particles.reveal.count, 24);
  assert.match(editedParticle.particles.sprite, /^data:image\/png;base64,/);
  await page.screenshot({ path: join(output, 'particle-editor.png') });
  await page
    .getByLabel('启用此粒子事件', { exact: true })
    .uncheck({ force: true });
  assert.equal(
    await page.evaluate(
      () =>
        window.cardEditorHost
          .state()
          .document.actions!.find((a) => a.id === 'cast')!
          .particleEvents!.at(-1)!.particles.enabled,
    ),
    false,
  );
  await page.locator('#timeline-particle-delete').click({ force: true });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions?.find((a) => a.id === 'cast')?.particleEvents
        ?.length === 2,
  );
  await page.locator('#timeline-action').selectOption('collision-cast');
  await page.locator('#timeline-particle-add').click({ force: true });
  await page
    .getByLabel('启用重力与平面碰撞', { exact: true })
    .check({ force: true });
  assert.equal(
    await page.getByLabel('粒子模拟空间', { exact: true }).inputValue(),
    'card',
  );
  await page
    .getByText('物理轨迹与碰撞面', { exact: true })
    .click({ force: true });
  for (const [label, value] of [
    ['初速度 Y', '.6'],
    ['重力 Y', '-2.4'],
    ['反弹系数', '.8'],
  ] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).dispatchEvent('change');
  }
  await page.getByLabel('命中响应', { exact: true }).selectOption('slide');
  await page
    .getByRole('button', { name: '添加碰撞平面', exact: true })
    .click({ force: true });
  await page
    .getByLabel('当前碰撞平面', { exact: true })
    .selectOption('plane-1');
  await page.getByLabel('平面距离（卡宽）', { exact: true }).fill('-.4');
  await page
    .getByLabel('平面距离（卡宽）', { exact: true })
    .dispatchEvent('change');
  const physicsEdit = await page.evaluate(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'collision-cast')!
        .particleEvents!.at(-1)!.physics!,
  );
  assert.equal(physicsEdit.gravity[1], -2.4);
  assert.equal(physicsEdit.velocity[1], 0.6);
  assert.equal(physicsEdit.response, 'slide');
  assert.equal(physicsEdit.planes.at(-1)!.distance, -0.4);
  await page.screenshot({ path: join(output, 'physics-editor.png') });
  await page
    .getByRole('button', { name: '删除碰撞平面', exact: true })
    .click({ force: true });
  await page.locator('#timeline-particle-delete').click({ force: true });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'collision-cast')!
        .particleEvents!.length === 1,
  );
  await page.locator('#timeline-audio > summary').click({ force: true });
  await page.getByLabel('导入动作音效', { exact: true }).setInputFiles({
    name: 'original-swish.wav',
    mimeType: 'audio/wav',
    buffer: audio.swish,
  });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'collision-cast')!.audioEvents
        ?.length === 2,
  );
  for (const [label, value] of [
    ['音效音量', '.4'],
    ['音效速度', '1.25'],
    ['音效裁剪起点（秒）', '.1'],
    ['音效持续（秒）', '.9'],
  ] as const) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).dispatchEvent('change');
  }
  await page.getByLabel('循环音效素材', { exact: true }).check({ force: true });
  const audioEdit = await page.evaluate(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'collision-cast')!
        .audioEvents!.at(-1)!,
  );
  assert.equal(audioEdit.volume, 0.4);
  assert.equal(audioEdit.playbackRate, 1.25);
  assert.equal(audioEdit.offset, 0.1);
  assert.equal(audioEdit.loop, true);
  await page
    .getByRole('button', { name: '启用音效试听', exact: true })
    .click({ force: true });
  await page.evaluate(() =>
    window.cardPreview.playAction('collision-cast', 0.8, false),
  );
  await page.waitForFunction(
    () =>
      window.cardPreview.getAudioState().voices > 0 &&
      window.cardPreview.getAudioState().level > 0.00001,
    null,
    { timeout: 15000 },
  );
  const editorAudio = await page.evaluate(() =>
    window.cardPreview.getAudioState(),
  );
  await page.evaluate(() => window.cardPreview.setPaused(true));
  assert.equal(
    await page.evaluate(() => window.cardPreview.getAudioState().voices),
    0,
  );
  await page.locator('#timeline-audio').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'audio-editor.png') });
  await page
    .getByRole('button', { name: '关闭音效试听', exact: true })
    .click({ force: true });
  await page
    .getByRole('button', { name: '删除音效事件', exact: true })
    .click({ force: true });
  await page.waitForFunction(
    () =>
      window.cardEditorHost
        .state()
        .document.actions!.find((a) => a.id === 'collision-cast')!.audioEvents
        ?.length === 1,
  );
  await page.evaluate(() => window.atelierAnimation.close());
  await page.locator('[data-command="save"]').first().click({ force: true });
  await page.waitForFunction(
    () => document.getElementById('dirty-marker')?.textContent === '',
    null,
    { timeout: 30000 },
  );
  const saved = JSON.parse(await readFile(project, 'utf8')) as CardDocument;
  assert.deepEqual(saved.characterRig, doc.characterRig);
  assert.deepEqual(saved.actions, doc.actions);
  await page.locator('[data-command="export"]').first().click({ force: true });
  await page.locator('#export-preset').selectOption('desktop');
  await page.locator('#export-start').click({ force: true });
  let directory = '';
  const exportDeadline = Date.now() + 60000;
  while (!directory) {
    for (const name of await readdir(exportBase)) {
      const candidate = join(exportBase, name);
      try {
        await readFile(join(candidate, 'manifest.json'));
        await readFile(join(candidate, 'godot/library.tres'));
        directory = candidate;
        break;
      } catch {}
    }
    if (!directory && Date.now() > exportDeadline)
      throw Error('Actual editor export did not finish');
    if (!directory) await new Promise((r) => setTimeout(r, 100));
  }
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest.characterRig, doc.characterRig);
  const exportedActions = structuredClone(
    manifest.actions,
  ) as CharacterAction[];
  for (const action of exportedActions)
    for (const event of action.audioEvents || []) {
      const authored = doc
        .actions!.find((a) => a.id === action.id)!
        .audioEvents!.find((e) => e.id === event.id)!;
      const exportedBytes = await readFile(join(directory, event.src));
      assert.equal(
        exportedBytes.toString('base64'),
        authored.src.split(',')[1],
      );
      event.src = authored.src;
    }
  assert.deepEqual(exportedActions, doc.actions);
  const front = await readFile(join(directory, manifest.frontAsset));
  const cover = await page.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        png: canvas.toDataURL(),
      };
    },
    `data:image/${manifest.frontAsset.endsWith('.webp') ? 'webp' : 'png'};base64,${front.toString('base64')}`,
  );
  assert.equal(cover.width, 1024);
  assert.equal(cover.height, 1536);
  await writeFile(
    join(output, 'cover.png'),
    Buffer.from(cover.png.split(',')[1], 'base64'),
  );
  assert.notEqual(front.toString('base64'), back.split(',')[1]);
  await page.locator('[data-command="save"]').first().click({ force: true });
  await page.waitForFunction(
    () => document.getElementById('dirty-marker')?.textContent === '',
    null,
    { timeout: 30000 },
  );
  const reference: Array<Record<string, unknown>> = [];
  let maxGeometryError = 0;
  await page.evaluate(() => window.atelierWorkspace.view('preview'));
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('#author-model-canvas')!
        .height > 600,
  );
  const actions = (doc.actions || []).filter((a) =>
    [
      'idle',
      'sweep',
      'cast',
      'enter',
      'exit',
      'world-cast',
      'collision-cast',
    ].includes(a.id),
  );
  const angles: [[number, number], ...Array<[number, number]>] = [
    [0, 0],
    [-20, 0],
    [20, 0],
    [0, -12],
    [0, 12],
    [-20, -12],
    [-20, 12],
    [20, -12],
    [20, 12],
  ];
  await mkdir(join(output, 'frames'), { recursive: true });
  for (const action of actions)
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const seconds = action.duration * fraction,
        pose = C.sample(doc, action, seconds, { seek: true }),
        expected: Record<string, number[]> = {};
      const groups = Components.actionParticleEvents(action, fraction),
        expectedParticles: Record<string, number[]> = {},
        trailGeometry: Record<string, number[]> = {};
      for (const group of groups) {
        const output = new Float32Array(256 * 7),
          visuals = new Float32Array(256),
          worldFrames = new Float64Array(256 * 6);
        const count = Components.sampleEventInto(
          group.event,
          group.age,
          doc,
          0,
          pose,
          output,
          visuals,
          Math.floor(128 / (1 + groups.length)),
          (birth: number, boneId: string) =>
            C.sample(doc, action, group.event.at * action.duration + birth, {
              seek: true,
            })?.bones.get(boneId),
          (birth: number) => {
            const root = R.action(
              { actions: [action] },
              action.id,
              group.event.at * action.duration + birth,
              { seek: true },
            );
            return {
              angle: [root.rotation, root.pitch] as [number, number],
              root: [
                root.x / 1024,
                -root.y / 1024,
                root.z,
                root.scale,
                root.opacity,
              ] as [number, number, number, number, number],
            };
          },
          0,
          2.7,
          worldFrames,
        );
        expectedParticles[group.event.id] = Array.from(
          output.subarray(0, count * 7),
        );
        if (group.event.trail && count > 1) {
          const buffer = new Float32Array(256 * 60),
            length = Batch.packTrail(
              output,
              count,
              buffer,
              group.event.simulationSpace === 'world' ? worldFrames : undefined,
            );
          trailGeometry[group.event.id] = Array.from(
            buffer.subarray(0, length),
          );
        }
      }
      for (const layer of doc.layers) {
        const mesh = C.geometry(
          doc,
          layer,
          pose,
          R.placement(doc, layer, pose),
        );
        if (mesh) expected[layer.id] = Array.from(mesh.positions);
      }
      const result = await page.evaluate(
        ({ id, seconds }) => {
          const preview = window.cardPreview as PreviewAPI;
          document.querySelector<HTMLCanvasElement>(
            '#author-model-canvas',
          )!.dataset.particleDiagnostics = 'true';
          preview.pose(0, 0);
          preview.playAction(id, seconds, true);
          const canvas = document.querySelector<HTMLCanvasElement>(
            '#author-model-canvas',
          )!;
          return {
            geometry: preview.getCharacterGeometry(),
            bones: JSON.parse(canvas.dataset.characterPose || '[]'),
            error: canvas.getContext('webgl')!.getError(),
            particles: JSON.parse(
              canvas.dataset.particleEventSamples || '{}',
            ) as Record<string, number[]>,
            trailGeometry: JSON.parse(
              canvas.dataset.particleTrailVertices || '{}',
            ) as Record<string, number[]>,
          };
        },
        { id: action.id, seconds },
      );
      assert.equal(result.error, 0);
      assert.deepEqual(
        result.trailGeometry,
        trailGeometry,
        'actual uploaded ribbon vertices match the mesh sampler',
      );
      assert.deepEqual(
        Object.keys(result.particles).sort(),
        Object.keys(expectedParticles).sort(),
      );
      for (const [id, values] of Object.entries(expectedParticles)) {
        assert.equal(result.particles[id].length, values.length);
        assert.ok(
          values.every(
            (v, i) => Math.abs(v - result.particles[id][i]) < 0.00001,
          ),
          'GPU particle upload differs from native sampler: ' + id,
        );
      }
      for (const [id, positions] of Object.entries(expected)) {
        assert.ok(result.geometry[id], id);
        assert.equal(result.geometry[id].positions.length, positions.length);
        for (let i = 0; i < positions.length; i++)
          maxGeometryError = Math.max(
            maxGeometryError,
            Math.abs(positions[i] - result.geometry[id].positions[i]),
          );
      }
      assert.ok(
        maxGeometryError < 0.00001,
        'Renderer differs from the native character sampler',
      );
      reference.push({
        id: action.id,
        seconds,
        bones: result.bones,
        geometry: expected,
        particles: expectedParticles,
        trails: Object.fromEntries(
          groups.filter((g) => g.event.trail).map((g) => [g.event.id, true]),
        ),
        trailGeometry,
      });
      if (fraction === 0 || fraction === 0.5)
        for (const [yaw, pitch] of angles) {
          const png = await page.evaluate(
            ({ yaw, pitch }) => {
              const preview = window.cardPreview as PreviewAPI;
              preview.pose(yaw, pitch);
              return document
                .querySelector<HTMLCanvasElement>('#author-model-canvas')!
                .toDataURL();
            },
            { yaw, pitch },
          );
          await writeFile(
            join(
              output,
              'frames',
              `${action.id}-${fraction}-${yaw}-${pitch}.png`,
            ),
            Buffer.from(png.split(',')[1], 'base64'),
          );
        }
    }
  await writeFile(
    join(output, 'webgl-reference.json'),
    JSON.stringify(reference),
  );
  for (const hidden of [
    ['left-upper', 'left-forearm'],
    ['right-upper', 'right-forearm'],
    ['cape'],
  ]) {
    const png = await page.evaluate(
      ({ hidden, layers }) => {
        const p = window.cardPreview as PreviewAPI;
        p.setRenderOverrides({
          layers: layers.map((l) => ({
            ...l,
            visible: l.visible && !hidden.includes(l.id),
          })),
        });
        p.playAction('idle', 0, true);
        p.pose(0, 0);
        return document
          .querySelector<HTMLCanvasElement>('#author-model-canvas')!
          .toDataURL();
      },
      { hidden, layers: doc.layers },
    );
    await writeFile(
      join(output, 'frames', 'hidden-' + hidden[0] + '.png'),
      Buffer.from(png.split(',')[1], 'base64'),
    );
  }
  await page.evaluate(
    (layers) => window.cardPreview.setRenderOverrides({ layers }),
    doc.layers,
  );
  await page.evaluate(() => {
    const p = window.cardPreview as PreviewAPI;
    p.playAction('sweep', 1.2, true);
    p.pose(0, 0);
  });
  await page.screenshot({ path: join(output, 'editor.png') });
  await page.locator('#home-back').click({ force: true });
  await page.waitForFunction(
    () => document.body.dataset.appMode === 'home',
    null,
    { timeout: 30000 },
  );
  await page
    .getByRole('button', { name: /打开卡片 星炉哨卫/ })
    .first()
    .click({ force: true });
  await page.waitForFunction(
    () =>
      document.body.dataset.appMode === 'editor' &&
      !window.cardEditorHost.state().busy,
    null,
    { timeout: 60000 },
  );
  const reopened = await page.evaluate(() => ({
    rig: window.cardEditorHost.state().document.characterRig,
    actions: window.cardEditorHost.state().document.actions,
  }));
  assert.deepEqual(reopened.rig, doc.characterRig);
  assert.deepEqual(reopened.actions, doc.actions);
  // Open the actual exported player over HTTP, including its own loaders and
  // baked/adaptive textures, after editor persistence has been verified.
  servedDirectory = directory;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await page.goto(`http://127.0.0.1:${address.port}/index.html`);
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' || !!document.body.dataset.error,
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.locator('body').getAttribute('data-error'), null);
  await page.locator('#player-audio').click();
  await page.evaluate(() => window.cardPreview.playAction('cast', 0.5, false));
  await page.waitForFunction(
    () =>
      window.cardPreview.getAudioState().voices > 0 &&
      window.cardPreview.getAudioState().level > 0.00001,
    null,
    { timeout: 15000 },
  );
  const playerAudio = await page.evaluate(() =>
    window.cardPreview.getAudioState(),
  );
  await page.evaluate(() => window.cardPreview.setPaused(true));
  assert.equal(
    await page.evaluate(() => window.cardPreview.getAudioState().voices),
    0,
  );
  await page.evaluate(() => window.cardPreview.playAction('cast', 0.2, true));
  assert.equal(
    await page.evaluate(() => window.cardPreview.getAudioState().voices),
    0,
  );
  await page.evaluate(() => window.cardPreview.playAction('cast', 0.5, false));
  await page.waitForFunction(
    () => window.cardPreview.getAudioState().voices > 0,
  );
  await page.evaluate(() => window.cardPreview.stopAction());
  assert.equal(
    await page.evaluate(() => window.cardPreview.getAudioState().voices),
    0,
  );
  await page.locator('#player-audio').click();
  for (const action of actions) {
    const result = await page.evaluate(
      ({ id, seconds }) => {
        const p = window.cardPreview as PreviewAPI;
        document.querySelector<HTMLCanvasElement>(
          '#author-model-canvas',
        )!.dataset.particleDiagnostics = 'true';
        p.pose(0, 0);
        p.playAction(id, seconds, true);
        const canvas = document.querySelector<HTMLCanvasElement>(
          '#author-model-canvas',
        )!;
        return {
          geometry: p.getCharacterGeometry(),
          particles: JSON.parse(
            canvas.dataset.particleEventSamples || '{}',
          ) as Record<string, number[]>,
          trails: JSON.parse(
            canvas.dataset.particleTrailVertices || '{}',
          ) as Record<string, number[]>,
          total: Number(canvas.dataset.particleTotalCount || 0),
          error: canvas.getContext('webgl')!.getError(),
          png: canvas.toDataURL(),
        };
      },
      { id: action.id, seconds: action.duration * 0.5 },
    );
    assert.equal(result.error, 0);
    const particleReference = reference.find(
      (s) => s.id === action.id && s.seconds === action.duration * 0.5,
    )!;
    assert.deepEqual(
      result.particles,
      particleReference.particles,
      'standalone particle positions and alpha',
    );
    assert.deepEqual(
      result.trails,
      particleReference.trailGeometry,
      'standalone connected ribbon mesh',
    );
    assert.ok(
      result.total <= 128,
      'standalone shares one particle/ribbon budget',
    );
    const expected = reference.find(
      (s) => s.id === action.id && s.seconds === action.duration * 0.5,
    )!.geometry as Record<string, number[]>;
    for (const [id, values] of Object.entries(expected)) {
      assert.equal(result.geometry[id].positions.length, values.length);
      assert.ok(
        values.every(
          (v, i) => Math.abs(v - result.geometry[id].positions[i]) < 0.00001,
        ),
        'Standalone player geometry: ' + id,
      );
    }
    await writeFile(
      join(output, 'frames', 'player-' + action.id + '.png'),
      Buffer.from(result.png.split(',')[1], 'base64'),
    );
  }
  assert.deepEqual(errors, []);
  await copyFile(project, join(assets, '星炉哨卫.cardproj'));
  const workshop = Workshop.create(
    JSON.parse(await readFile(project, 'utf8')),
    'arcane-sentinel-acceptance',
    'sentinel',
    '星炉哨卫 · 动画与粒子验收',
  );
  await writeFile(
    join(assets, '星炉哨卫.cardworkshop'),
    JSON.stringify(Storage.pack(workshop)),
  );
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    join(assets, '星炉哨卫.cardworkshop'),
  );
  await page.goto(editorUrl);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.locator('#home-open').click({ force: true });
  await page.waitForFunction(
    () =>
      document.body.dataset.appMode === 'editor' &&
      !window.cardEditorHost.state().busy,
    null,
    { timeout: 60000 },
  );
  const example = await page.evaluate(() => ({
    rig: window.cardEditorHost.state().document.characterRig,
    actions: window.cardEditorHost.state().document.actions,
  }));
  assert.deepEqual(example.rig, doc.characterRig);
  assert.deepEqual(example.actions, doc.actions);
  assert.deepEqual(errors, []);
  const result = {
    output,
    project,
    directory,
    godot: join(directory, 'godot'),
    sourceHashes,
    layers: doc.layers.length,
    bones: doc.characterRig!.bones.length,
    actions: actions.map((a: CharacterAction) => a.id),
    audits,
    maxGeometryError,
    webglSamples: reference.length,
    viewCaptures: actions.length * 18,
    particleEditor: true,
    particleEditorFeatures: [
      'presets',
      'parameters',
      'png',
      'enable-toggle',
      'emission-stop',
      'connected-ribbon',
    ],
    particleSimulationSpaces: ['bone', 'card', 'world'],
    particlePlanePhysics: true,
    audioEditor: true,
    audioOutput: { editor: editorAudio, standalone: playerAudio },
    exampleOpened: true,
    savedReopened: true,
    actualEditorExport: true,
    standalonePlayer: true,
    hiddenPartCaptures: 3,
    frontSha256: createHash('sha256').update(front).digest('hex'),
    errors,
    visualAcceptance: 'pending inspection of actual frames',
    godotAcceptance: 'pending GPU verification',
  };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(
    join(runs, 'last-run.json'),
    JSON.stringify(
      { output, project, directory, godot: result.godot },
      null,
      2,
    ),
  );
  console.log(
    'PRODUCTION_CARD_WEBGL_PASSED',
    JSON.stringify({
      output,
      project,
      directory,
      maxGeometryError,
      samples: reference.length,
    }),
  );
} catch (error) {
  for (const page of app.windows()) {
    if (!page.url().endsWith('/index.html')) continue;
    console.error(
      'FAILURE_STATE',
      await page
        .evaluate(() => ({
          mode: document.body.dataset.appMode,
          text: document.body.innerText.slice(-12000),
        }))
        .catch(() => null),
    );
    await page
      .screenshot({ path: join(output, 'failure.png') })
      .catch(() => {});
  }
  throw error;
} finally {
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()));
  const shutdown = setTimeout(() => app.process().kill(), 10000);
  shutdown.unref();
  await app
    .evaluate(({ app }) => {
      setImmediate(() => app.exit());
    })
    .catch(() => {});
  await app.close().catch(() => {});
  clearTimeout(shutdown);
}
