import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import type PlayerTextures from '../renderer/rendering/player-textures.ts';
import type { CardLayer } from '../shared/document';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const { output: directory } = JSON.parse(
  await readFile(join(root, 'qa/device-benchmark/last-run.json'), 'utf8'),
) as { output: string };
const output = join(root, 'qa/device-benchmark', 'desktop-smoke-' + Date.now());
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
        new URL(req.url || '/', 'http://localhost').pathname,
      ),
      file = resolve(
        directory,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
    if (!file.startsWith(directory + sep)) throw Error('Outside fixture');
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    res.setHeader(
      'Content-Type',
      mime[extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const entry = join(output, 'main.cjs');
await writeFile(
  entry,
  `const {app,BrowserWindow,session}=require('electron'),path=require('node:path');app.setPath('userData',path.join(__dirname,'profile'));app.on('window-all-closed',()=>{});app.whenReady().then(()=>{session.defaultSession.on('will-download',(_,item)=>item.setSavePath(path.join(__dirname,'device-result.json')));const w=new BrowserWindow({show:false,width:430,height:940,webPreferences:{backgroundThrottling:false}});w.setOpacity(0);w.setIgnoreMouseEvents(true);w.setSkipTaskbar(true);w.showInactive();w.loadURL(process.env.CARDSCAPE_BENCHMARK_URL);});`,
);
const app = await electron.launch({
  executablePath: require('electron') as string,
  args: [
    entry,
    '--force-device-scale-factor=1',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
  env: {
    ...process.env,
    CARDSCAPE_BENCHMARK_URL: `http://127.0.0.1:${address.port}/`,
  },
  timeout: 60000,
});
const errors: string[] = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.waitForFunction(
    () =>
      typeof document.querySelector<HTMLButtonElement>('#run')?.onclick ===
      'function',
    null,
    { timeout: 60000 },
  );
  await page.locator('#count').selectOption('4');
  await page.locator('#transitions').dispatchEvent('click');
  assert.equal(await page.locator('#transitions').isChecked(), true);
  const registration = await page.evaluate(async () => {
    const helper = (
      window as unknown as { CardPlayerTextures: typeof PlayerTextures }
    ).CardPlayerTextures;
    const source = document.createElement('canvas');
    source.width = 1024;
    source.height = 1536;
    const context = source.getContext('2d')!;
    context.fillStyle = '#ff00ff';
    context.fillRect(0, 0, 1024, 1536);
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    colors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(
        128 + (index % 2) * 256,
        192 + Math.floor(index / 2) * 384,
        256,
        384,
      );
    });
    const layer: CardLayer = {
      id: 'registration-oracle',
      name: 'Registration oracle',
      kind: 'image',
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      visible: true,
      sourceWindow: { x: 128, y: 192, width: 512, height: 768 },
    };
    const results = [];
    for (const factor of [1, 0.25]) {
      const scaled = document.createElement('canvas');
      scaled.width = 1024 * factor;
      scaled.height = 1536 * factor;
      scaled
        .getContext('2d')!
        .drawImage(source, 0, 0, scaled.width, scaled.height);
      const image = new Image();
      image.src = scaled.toDataURL();
      await image.decode();
      const picture = helper.registered(
        layer,
        image,
        [1024, 1536],
      ) as HTMLCanvasElement;
      const pixels = colors.map((_, index) =>
        Array.from(
          picture
            .getContext('2d')!
            .getImageData(
              Math.floor(picture.width * ((index % 2) * 0.5 + 0.25)),
              Math.floor(picture.height * (Math.floor(index / 2) * 0.5 + 0.25)),
              1,
              1,
            ).data,
        ),
      );
      if (
        helper.registered(
          { ...layer, kind: 'background' },
          image,
          [1024, 1536],
        ) !== image
      )
        throw Error('Background registration changed');
      results.push({ width: picture.width, height: picture.height, pixels });
    }
    return results;
  });
  assert.deepEqual(
    registration.map((result) => [result.width, result.height]),
    [
      [1024, 1536],
      [256, 384],
    ],
  );
  for (const result of registration)
    assert.deepEqual(result.pixels, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ]);
  await page.locator('#quality').selectOption('low');
  await page.locator('#run').dispatchEvent('click');
  await page.waitForFunction(
    () =>
      /^(完成：|测试未完成：)/.test(
        document.getElementById('status')?.textContent || '',
      ),
    null,
    { polling: 100, timeout: 90000 },
  );
  assert.ok(
    (await page.locator('#status').innerText()).startsWith('完成：'),
    await page.locator('#status').innerText(),
  );
  const first = JSON.parse(
    (await page.locator('#results').textContent()) || '',
  ) as {
    metrics: {
      initialTier: string;
      textureMode: string;
      transitions: Array<{ tier: string }>;
      count: number;
      pauseStable: boolean;
      cancelled: boolean;
      final: { textures: number; buffers: number; programs: number };
      particles: number;
    };
  };
  assert.equal(first.metrics.count, 4);
  assert.equal(first.metrics.textureMode, 'adaptive');
  assert.equal(first.metrics.initialTier, 'small');
  assert.equal(first.metrics.transitions.length, 6);
  assert.equal(first.metrics.pauseStable, true);
  assert.equal(first.metrics.cancelled, false);
  assert.equal(
    first.metrics.final.textures +
      first.metrics.final.buffers +
      first.metrics.final.programs,
    0,
  );
  assert.ok(first.metrics.particles <= 48);
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLImageElement>('#capture')!.naturalWidth > 0,
  );
  await page.screenshot({
    path: join(output, 'completed.png'),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    'narrow layout has no horizontal overflow',
  );
  await page.locator('#duration').selectOption('60');
  // Exercise actual physical effects with small images retaining effects;
  // automatic list LOD intentionally disables particles and is insufficient.
  await page.locator('#action').selectOption('collision-cast');
  await page.locator('#audio').check();
  await page.locator('#textures').selectOption('small');
  await page.locator('#count').selectOption('1');
  await page.locator('#duration').selectOption('8');
  await page.locator('#run').click({ force: true });
  await page.waitForFunction(
    () =>
      /^(完成：|测试未完成：)/.test(
        document.getElementById('status')?.textContent || '',
      ),
    null,
    { timeout: 90000 },
  );
  assert.ok(
    (await page.locator('#status').innerText()).startsWith('完成：'),
    await page.locator('#status').innerText(),
  );
  const physical = JSON.parse(
    (await page.locator('#results').textContent()) || '',
  ) as {
    metrics: {
      action: string;
      audio: {
        enabled: boolean;
        beforePause: Array<{ starts: number; voices: number; error: string }>;
        paused: Array<{ voices: number }>;
        released: Array<{ voices: number; sources: number }>;
      };
      particles: number;
      pauseStable: boolean;
      final: { textures: number; buffers: number; programs: number };
    };
  };
  assert.equal(physical.metrics.action, 'collision-cast');
  assert.equal(physical.metrics.audio.enabled, true);
  assert.ok(physical.metrics.audio.beforePause.some((s) => s.starts > 0));
  assert.ok(physical.metrics.audio.beforePause.every((s) => s.error === ''));
  assert.ok(physical.metrics.audio.paused.every((s) => s.voices === 0));
  assert.ok(
    physical.metrics.audio.released.every(
      (s) => s.voices === 0 && s.sources === 0,
    ),
  );
  assert.ok(physical.metrics.particles > 0);
  assert.equal(physical.metrics.pauseStable, true);
  assert.equal(
    physical.metrics.final.textures +
      physical.metrics.final.buffers +
      physical.metrics.final.programs,
    0,
  );
  await page.screenshot({
    path: join(output, 'physics-completed.png'),
    fullPage: true,
  });
  await page.locator('#duration').selectOption('60');
  await page.locator('#textures').selectOption('source');
  await page.locator('#count').selectOption('8');
  await page.locator('#run').dispatchEvent('click');
  await page.waitForFunction(
    () =>
      document.getElementById('status')?.textContent?.startsWith('测试中：'),
    null,
    { polling: 100, timeout: 60000 },
  );
  await page.locator('#stop').dispatchEvent('click');
  await page.waitForFunction(
    () =>
      document.getElementById('status')?.textContent === '已停止，资源已释放。',
    null,
    { polling: 100, timeout: 30000 },
  );
  const cancelled = JSON.parse(
    (await page.locator('#results').textContent()) || '',
  ) as typeof first;
  assert.equal(cancelled.metrics.cancelled, true);
  assert.equal(cancelled.metrics.textureMode, 'source');
  assert.ok(cancelled.metrics.particles <= 48);
  assert.equal(
    cancelled.metrics.final.textures +
      cancelled.metrics.final.buffers +
      cancelled.metrics.final.programs,
    0,
  );
  await page.locator('#save').dispatchEvent('click');
  let saved: string | undefined;
  const deadline = Date.now() + 15000;
  while (!saved && Date.now() < deadline) {
    try {
      saved = await readFile(join(output, 'device-result.json'), 'utf8');
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  assert.ok(saved);
  assert.equal(JSON.parse(saved).metrics.cancelled, true);
  assert.deepEqual(errors, []);
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        status: 'passed',
        scope:
          'Desktop narrow-viewport functional check; not target-phone performance evidence',
        complete: first,
        physical,
        registration,
        cancelled,
        downloaded: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log('DEVICE_BENCHMARK_DESKTOP_SMOKE_PASSED', output);
} catch (error) {
  const page = app.windows()[0];
  if (page) {
    console.error(
      'DEVICE_BENCHMARK_FAILURE',
      await page
        .evaluate(() => ({
          status: document.getElementById('status')?.textContent,
          text: document.body.innerText.slice(0, 1600),
        }))
        .catch(() => null),
      errors,
    );
    await page
      .screenshot({ path: join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  const timeout = setTimeout(() => app.process().kill(), 10000);
  timeout.unref();
  await app
    .evaluate(({ app }) => setImmediate(() => app.exit()))
    .catch(() => {});
  await app.close().catch(() => {});
  clearTimeout(timeout);
  await new Promise<void>((done) => server.close(() => done()));
}
