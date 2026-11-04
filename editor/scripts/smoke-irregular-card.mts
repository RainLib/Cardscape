import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import type { CardDocument } from '../shared/document';
import type { PreviewAPI } from '../shared/preview';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const output = join(root, 'qa', 'irregular-card-2026-11-02');
await mkdir(output, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'cardscape-irregular-'));
const { createServices } = require('../dist/electron/services.cjs'),
  { irregular } = require('../tests/fixtures/irregular-card.cjs');
const service = createServices({ runtimeDir: join(output, 'runtime') }),
  doc: CardDocument = irregular();
doc.backScene = require('../dist/renderer/back-asset-model.js').create(
  doc.back,
);
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
const server = createServer();
try {
  await service.invoke('save', { document: doc });
  const reopened = (await service.invoke('open')).document;
  assert.deepEqual(reopened.frameStyle, doc.frameStyle);
  assert.deepEqual(reopened.actions, doc.actions);
  const exported = await service.invoke('export', {
      document: doc,
      front: doc.back,
      layerRasters: {},
    }),
    directory = resolve(exported.directory);
  const uniforms = JSON.parse(
    await readFile(join(directory, 'uniforms.json'), 'utf8'),
  );
  assert.deepEqual(uniforms.frameContour.counts, [9, 18]);
  assert.equal(uniforms.frameContour.edges.length, 256);
  await writeFile(
    join(output, 'package.json'),
    JSON.stringify({ directory, godot: join(directory, 'godot') }, null, 2),
  );
  server.on('request', async (req, res) => {
    try {
      const file = resolve(
        directory,
        '.' +
          decodeURIComponent(
            new URL(req.url || '/', 'http://localhost').pathname,
          ),
      );
      if (!file.startsWith(directory + sep)) throw Error('Outside export');
      res.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
          } as Record<string, string>
        )[extname(file)] || 'application/octet-stream',
      );
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const entry = join(temp, 'main.cjs');
  await writeFile(
    entry,
    `const {app,BrowserWindow}=require('electron');app.setPath('userData',require('path').join(__dirname,'profile'));app.whenReady().then(()=>{let w=new BrowserWindow({show:false,width:700,height:960,webPreferences:{backgroundThrottling:false}});w.loadURL(process.env.CARDSCAPE_PLAYER_URL);});`,
  );
  app = await electron.launch({
    executablePath: require('electron'),
    args: [
      entry,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-watchdog',
      '--force-device-scale-factor=1',
    ],
    env: {
      ...process.env,
      CARDSCAPE_PLAYER_URL: `http://127.0.0.1:${address.port}/index.html`,
    },
  });
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.setBackgroundThrottling(false);
      w.setOpacity(0);
      w.setIgnoreMouseEvents(true);
      w.showInactive();
    }
  });
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' || !!document.body.dataset.error,
    null,
    { timeout: 60000 },
  );
  assert.equal(await page.locator('body').getAttribute('data-error'), null);
  const pixels = await page.evaluate(() => {
    const preview = window.cardPreview as PreviewAPI,
      canvas = document.querySelector<HTMLCanvasElement>(
        '#author-model-canvas',
      )!,
      gl = canvas.getContext('webgl')!;
    const capture = (seconds: number) => {
      preview.pose(0, 0);
      preview.playAction('idle', seconds, true);
      const fit = Math.min(1, canvas.width / canvas.height / 0.85),
        aspect = canvas.width / canvas.height;
      const pixel = (x: number, y: number) => {
        const a = ((x / 1024 - 0.5) * 2.9 * fit) / aspect / (2.7 - 0.045),
          b = ((0.75 - y / 1024) * 2.9 * fit) / (2.7 - 0.045),
          rgba = new Uint8Array(4);
        gl.readPixels(
          Math.round(((a + 1) * canvas.width) / 2),
          Math.round(((b + 1) * canvas.height) / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba,
        );
        return Array.from(rgba);
      };
      return {
        outside: pixel(0, 0),
        notch: pixel(990, 700),
        bridge: pixel(512, 740),
        upper: pixel(512, 420),
        lower: pixel(512, 1100),
        error: gl.getError(),
        order: canvas.dataset.drawOrder,
        image: canvas.toDataURL(),
      };
    };
    const first = capture(0.2),
      second = capture(1.2);
    return { first, second };
  });
  for (const p of [pixels.first, pixels.second]) {
    assert.equal(p.error, 0);
    assert.equal(p.outside[3], 0);
    assert.equal(p.notch[3], 0);
    assert.ok(p.bridge[1] > p.bridge[0] + 50 && p.bridge[1] > p.bridge[2] + 50);
  }
  assert.ok(pixels.first.upper[2] > pixels.first.upper[0] + 80);
  assert.ok(pixels.second.upper[0] > pixels.second.upper[2] + 80);
  assert.ok(pixels.first.lower[2] > pixels.first.lower[0] + 80);
  assert.ok(pixels.second.lower[0] > pixels.second.lower[2] + 80);
  for (const [name, p] of Object.entries(pixels))
    await writeFile(
      join(output, name + '.png'),
      Buffer.from(p.image.split(',')[1], 'base64'),
    );
  await page.evaluate(() => {
    (window.cardPreview as PreviewAPI).pose(180);
  });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('#author-model-canvas')?.dataset
        .backReady === 'true',
    null,
    { timeout: 15000 },
  );
  const views = await page.evaluate(() => {
    const preview = window.cardPreview as PreviewAPI,
      canvas = document.querySelector<HTMLCanvasElement>(
        '#author-model-canvas',
      )!,
      gl = canvas.getContext('webgl')!;
    return [
      [180, 0],
      [-25, 15],
      [25, -15],
    ].map(([yaw, pitch]) => {
      preview.pose(yaw, pitch);
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      let covered = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) covered++;
      return {
        yaw,
        pitch,
        covered,
        error: gl.getError(),
        image: canvas.toDataURL(),
      };
    });
  });
  for (const view of views) {
    assert.equal(view.error, 0);
    assert.ok(view.covered > 100);
    await writeFile(
      join(output, 'view-' + view.yaw + '.png'),
      Buffer.from(view.image.split(',')[1], 'base64'),
    );
  }
  await page.evaluate(() => {
    (window.cardPreview as PreviewAPI).pose(0);
  });
  const transition = await page.evaluate(async () => {
    const preview = window.cardPreview as PreviewAPI,
      canvas = document.querySelector<HTMLCanvasElement>(
        '#author-model-canvas',
      )!;
    preview.playAction('idle', 0.2, true);
    const before = canvas.dataset.characterPose;
    preview.playAction('raise');
    const start = canvas.dataset.characterPose;
    await new Promise((r) => setTimeout(r, 220));
    preview.setPaused(true);
    const middle = canvas.dataset.characterPose,
      weight = Number(canvas.dataset.actionTransition);
    await new Promise((r) => setTimeout(r, 100));
    const paused = canvas.dataset.characterPose === middle;
    preview.playAction('idle');
    const interrupted = canvas.dataset.characterPose === middle;
    preview.setPaused(false);
    const deadline = performance.now() + 15000;
    while (
      Number(canvas.dataset.actionTransition) < 1 &&
      performance.now() < deadline
    )
      await new Promise((r) => setTimeout(r, 50));
    preview.setPaused(true);
    return {
      sameStart: before === start,
      changed: middle !== start,
      paused,
      interrupted,
      weight,
      complete: Number(canvas.dataset.actionTransition) === 1,
      gl: canvas.getContext('webgl')!.getError(),
    };
  });
  console.log('IRREGULAR_TRANSITION', JSON.stringify(transition));
  assert.ok(
    transition.sameStart &&
      transition.changed &&
      transition.paused &&
      transition.interrupted &&
      transition.complete,
  );
  assert.equal(transition.gl, 0);
  assert.deepEqual(errors, []);
  const result = {
    directory,
    godot: join(directory, 'godot'),
    pixels: Object.fromEntries(
      Object.entries(pixels).map(([k, { image, ...v }]) => [k, v]),
    ),
    transition,
    views: views.map(({ image, ...view }) => view),
    errors,
  };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log('SMOKE_IRREGULAR_CARD_PASSED', JSON.stringify(result));
} finally {
  if (app) {
    const running = app,
      shutdown = setTimeout(() => running.process().kill(), 10000);
    shutdown.unref();
    await app
      .evaluate(({ app }) => {
        setImmediate(() => app.exit());
      })
      .catch(() => {});
    await app.close().catch(() => {});
    clearTimeout(shutdown);
  }
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()));
  service.close();
  await rm(temp, { recursive: true, force: true });
}
