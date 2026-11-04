import {
  _electron as electron,
  type Page,
  type ElectronApplication,
} from 'playwright';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'cardscape-player-smoke-'));
const { fixture, png } = require('../tests/fixtures/character-animation.cjs');
const { createServices } = require('../dist/electron/services.cjs');
const W = require('../dist/renderer/workshop-model.js');
const C = require('../dist/renderer/component-model.js');
const B = require('../dist/renderer/back-asset-model.js');
const P = require('../dist/renderer/export-profile.js');
const service = createServices({ runtimeDir: join(temp, 'runtime') });
let server: Server | undefined;
let app: ElectronApplication | undefined;
try {
  const doc = fixture();
  doc.exportSettings = P.config({
    preset: 'mobile-list',
    remoteDelivery: true,
  });
  doc.backScene = B.create(doc.back);
  doc.particles = C.particles({
    enabled: true,
    visual: 'sprite',
    sprite: png([0, 0, 4, 4], [255, 255, 255, 255], 4, 4),
    count: 8,
    reveal: { enabled: true },
  });
  doc.layers.unshift({
    id: 'title',
    name: 'Localized title',
    kind: 'text',
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    visible: true,
    titleArt: {
      variants: [
        {
          locale: 'zh-CN',
          text: '英雄',
          src: png([1, 1, 30, 10], [255, 240, 210, 255], 32, 16),
        },
        {
          locale: 'en',
          text: 'Hero',
          src: png([2, 2, 25, 8], [210, 240, 255, 255], 32, 16),
        },
      ],
    },
  });
  const workshop = W.create(doc, 'typed-player-smoke', 'first');
  const exported = await service.invoke('export-workshop', {
    workshop: await W.encode(workshop),
    outputs: { first: { front: doc.back } },
  });
  const directory = resolve(exported.directory);
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url || '/', 'http://localhost').pathname,
      );
      const file = resolve(directory, '.' + pathname);
      if (!file.startsWith(directory + sep)) throw Error('Outside export');
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };
      response.setHeader(
        'Content-Type',
        mime[extname(file)] || 'application/octet-stream',
      );
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('No player HTTP port');
  const origin = `http://127.0.0.1:${address.port}`;
  const entry = join(temp, 'main.cjs');
  await writeFile(
    entry,
    `const {app,BrowserWindow}=require('electron');app.setPath('userData',require('path').join(__dirname,'profile'));app.on('window-all-closed',()=>{});let window;app.whenReady().then(()=>{window=new BrowserWindow({show:false,width:400,height:650,webPreferences:{backgroundThrottling:false}});window.loadURL(process.env.CARDSCAPE_PLAYER_URL);});`,
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
      CARDSCAPE_PLAYER_URL: `${origin}/cards/first/index.html`,
    },
  });
  const errors: string[] = [];
  const network = new Map<string, string>();
  let page = await app.firstWindow();
  function observe(page: Page) {
    page.on('request', (request) => network.set(request.url(), 'pending'));
    page.on('response', (response) =>
      network.set(response.url(), String(response.status())),
    );
    page.on('requestfailed', (request) =>
      network.set(request.url(), request.failure()?.errorText || 'failed'),
    );
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(error.stack);
    });
  }
  observe(page);
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const mode of ['local', 'remote', 'cached'] as const) {
      if (mode !== 'local') {
        await page.evaluate(() => {
          window.cardPreview.setPaused?.(true);
          window.cardPreview.setActive?.(false);
        });
        const [next] = await Promise.all([
          app.waitForEvent('window'),
          app.evaluate(
            ({ BrowserWindow }, url) => {
              const window = new BrowserWindow({
                show: false,
                width: 400,
                height: 650,
                webPreferences: { backgroundThrottling: false },
              });

              void window.loadURL(url);
            },
            `${origin}/remote/runtime/index.html?catalog=${encodeURIComponent(`${origin}/remote/catalog.json`)}&card=first`,
          ),
        ]);
        page = next;
        observe(page);
      }
      await page.waitForFunction(
        () =>
          document.body.dataset.ready === 'true' ||
          !!document.body.dataset.error,
        null,
        { timeout: 60000 },
      );
      const error = await page.locator('body').getAttribute('data-error');
      assert.equal(error, null, `${mode}: ${error}`);
      await page.locator('#player-pause').click();
      assert.equal(
        await page.evaluate(() => window.cardPreview.getView!().paused),
        true,
      );
      await page.locator('#player-locale').selectOption('en');
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLCanvasElement>('#author-model-canvas')
            ?.dataset.locale === 'en' &&
          document.body.dataset.textureLoading !== 'true',
      );
      const pausedView = await page.evaluate(() =>
        window.cardPreview.getView(),
      );
      const tierSwaps = [];
      for (const zoom of [300, 25, 300, 25, 300]) {
        const tier = zoom === 25 ? 'small' : 'large';
        await page
          .locator('#player-zoom')
          .evaluate((input: HTMLInputElement, zoom: number) => {
            input.value = String(zoom);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }, zoom);
        await page.waitForFunction(
          (tier) =>
            document.body.dataset.textureLevel === tier &&
            document.body.dataset.textureLoading !== 'true',
          tier,
          { timeout: 30000 },
        );
        assert.deepEqual(
          await page.evaluate(() => window.cardPreview.getView()),
          pausedView,
          'zoom and complete texture batches preserve the paused action clock',
        );
        tierSwaps.push({ zoom, tier });
      }
      await page.locator('[data-pose="180"]').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLCanvasElement>('#author-model-canvas')
            ?.dataset.backReady === 'true',
        null,
        { timeout: 30000 },
      );
      await page.locator('[data-pose="0"]').click();
      await page.locator('#player-reveal').click();
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLCanvasElement>('#author-model-canvas')
            ?.dataset.particleSpriteState === 'ready',
        null,
        { timeout: 30000 },
      );
      const snapshot = await page.evaluate(() => ({
        remoteRequests: document.body.dataset.remoteRequests,
        remoteCacheHits: document.body.dataset.remoteCacheHits,
        mode: '',
        ...document.body.dataset,
        preview: {
          ...document.querySelector<HTMLCanvasElement>('#author-model-canvas')!
            .dataset,
        },
      }));
      assert.equal(snapshot.preview.glError, '0');
      assert.equal(snapshot.preview.locale, 'en');
      assert.equal(snapshot.preview.backReady, 'true');
      if (mode !== 'local') assert.ok(Number(snapshot.remoteRequests) > 0);
      if (mode === 'cached') assert.ok(Number(snapshot.remoteCacheHits) > 0);
      results.push({ ...snapshot, mode, tierSwaps });
      console.log(`SMOKE_EXPORTED_PLAYER_${mode.toUpperCase()}_PASSED`);
    }
    assert.deepEqual(errors, []);
    await mkdir(join(root, 'qa'), { recursive: true });
    await writeFile(
      join(root, 'qa/preview-player-browser.json'),
      JSON.stringify(
        { renderer: 'SwiftShader functional validation', errors, results },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error('EXPORTED_PLAYER_NETWORK', [...network]);
    console.error(
      'EXPORTED_PLAYER_STATE',
      await page
        .evaluate(() => ({
          ...document.body.dataset,
          status: document.querySelector('#player-status')?.textContent,
          preview: {
            ...document.querySelector<HTMLCanvasElement>('#author-model-canvas')
              ?.dataset,
          },
        }))
        .catch(() => ({})),
    );
    throw error;
  }
} finally {
  if (app) {
    const running = app;
    const shutdown = setTimeout(() => running.process().kill(), 10000);
    shutdown.unref();
    await app
      .evaluate(({ app }) => {
        setImmediate(() => app.exit());
      })
      .catch(() => {});
    await app.close().catch(() => {});
    clearTimeout(shutdown);
  }
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  service.close();
  await rm(temp, { recursive: true, force: true });
}
