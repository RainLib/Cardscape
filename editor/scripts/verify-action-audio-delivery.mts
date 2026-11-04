import type { AssetManifest, CardOutput } from '../shared/export';
import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import type { CardDocument } from '../shared/document';
import type { PreviewAPI } from '../shared/preview';
import type { EditorResults } from '../shared/editor-services';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const Services = require('../dist/electron/services.cjs') as {
  createServices(options: { runtimeDir: string }): {
    invoke<K extends keyof EditorResults>(
      method: K,
      args?: unknown,
    ): Promise<EditorResults[K]>;
    close(): void;
  };
};
const W =
  require('../dist/renderer/workshop-model.js') as typeof import('../renderer/workshop/workshop-model').default;
const P =
  require('../dist/renderer/export-profile.js') as typeof import('../renderer/rendering/export-profile').default;
const source = JSON.parse(
  await readFile(
    join(root, 'qa/production-readiness/arcane-sentinel/last-run.json'),
    'utf8',
  ),
) as { project: string; directory: string };
const output = join(root, 'qa/action-audio-delivery', 'run-' + Date.now());
await mkdir(output, { recursive: true });
const services = Services.createServices({
  runtimeDir: join(output, 'runtime'),
});
let app: Awaited<ReturnType<typeof electron.launch>> | null = null;
let served = '';
const server = createServer(async (req, res) => {
  try {
    const uri = new URL(req.url || '/', 'http://localhost');
    if (uri.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    const file = resolve(served, '.' + decodeURIComponent(uri.pathname));
    if (!file.startsWith(served + sep)) throw Error('outside export');
    res.setHeader(
      'content-type',
      (
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.json': 'application/json',
          '.css': 'text/css',
          '.glsl': 'text/plain',
          '.webp': 'image/webp',
          '.png': 'image/png',
          '.wav': 'audio/wav',
        } as Record<string, string>
      )[extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
try {
  const doc = JSON.parse(
    await readFile(source.project, 'utf8'),
  ) as CardDocument;
  doc.exportSettings = P.config({ preset: 'desktop', remoteDelivery: true });
  const workshop = W.create(doc, 'audio-delivery', 'sentinel');
  const front =
    'data:image/png;base64,' +
    (await readFile(join(dirname(source.project), 'cover.png'))).toString(
      'base64',
    );
  const original = JSON.parse(
    await readFile(join(source.directory, 'manifest.json'), 'utf8'),
  ) as AssetManifest;
  const cardOutput: CardOutput = { front, layerRasters: {} };
  for (const layer of original.layers)
    if (layer.asset && !doc.layers.find((l) => l.id === layer.id)?.src) {
      const mime = layer.asset.endsWith('.webp') ? 'webp' : 'png';
      cardOutput.layerRasters![layer.id] =
        'data:image/' +
        mime +
        ';base64,' +
        (await readFile(join(source.directory, layer.asset))).toString(
          'base64',
        );
    }
  if (original.framePreview)
    cardOutput.framePreview = {
      ...original.framePreview,
      src:
        'data:image/png;base64,' +
        (
          await readFile(join(source.directory, original.framePreview.asset))
        ).toString('base64'),
    };
  const exported = await services.invoke('export-workshop', {
    workshop: await W.encode(workshop),
    outputs: { sentinel: cardOutput },
  });
  served = exported.directory;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = 'http://127.0.0.1:' + address.port,
    catalog = origin + '/remote/catalog.json';
  const main = join(output, 'main.cjs');
  await writeFile(
    main,
    "const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});w.loadURL(process.env.CARDSCAPE_AUDIO_URL);});app.on('window-all-closed',()=>app.quit());",
  );
  app = await electron.launch({
    executablePath: require('electron'),
    args: [main],
    env: {
      ...process.env,
      CARDSCAPE_AUDIO_URL:
        origin +
        '/remote/runtime/index.html?' +
        new URLSearchParams({ catalog, card: 'sentinel' }),
    },
    timeout: 60000,
  });
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' || !!document.body.dataset.error,
    null,
    { timeout: 90000 },
  );
  assert.equal(await page.locator('body').getAttribute('data-error'), null);
  await page.locator('#player-audio').click();
  await page.evaluate(() =>
    (window as unknown as { cardPreview: PreviewAPI }).cardPreview.playAction(
      'collision-cast',
      0.8,
      false,
    ),
  );
  await page.waitForFunction(
    () => {
      const a = (
        window as unknown as { cardPreview: PreviewAPI }
      ).cardPreview.getAudioState();
      return a.voices > 0 && a.level > 0.000001;
    },
    null,
    { timeout: 15000 },
  );
  const browser = await page.evaluate(() =>
    (
      window as unknown as { cardPreview: PreviewAPI }
    ).cardPreview.getAudioState(),
  );
  assert.equal(browser.error, '');
  await page.screenshot({ path: join(output, 'remote-player.png') });
  await page.evaluate(() =>
    (window as unknown as { cardPreview: PreviewAPI }).cardPreview.setPaused(
      true,
    ),
  );
  assert.equal(
    await page.evaluate(
      () =>
        (
          window as unknown as { cardPreview: PreviewAPI }
        ).cardPreview.getAudioState().voices,
    ),
    0,
  );
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  const native = join(served, 'godot-remote'),
    binary = process.env.GODOT_BIN;
  assert.ok(binary, 'Set GODOT_BIN');
  await mkdir(join(native, 'tests'), { recursive: true });
  await copyFile(
    join(root, '../sdk/godot/tests/test_action_audio_remote.gd'),
    join(native, 'tests/test_action_audio_remote.gd'),
  );
  const imported = spawnSync(
    binary,
    ['--headless', '--editor', '--path', native, '--import', '--quit'],
    { windowsHide: true, encoding: 'utf8', timeout: 60000 },
  );
  await writeFile(
    join(output, 'native-import.log'),
    imported.stdout + imported.stderr,
  );
  assert.equal(imported.status, 0);
  const verified = await new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(root, 'scripts/test-godot.cjs'),
        '--project',
        native,
        '--script',
        'tests/test_action_audio_remote.gd',
        '--timeout',
        '180000',
        '--output',
        join(output, 'native.log'),
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          CARDSCAPE_AUDIO_CATALOG: catalog,
          CARDSCAPE_AUDIO_CACHE: 'qa-audio-' + Date.now(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => child.kill(), 190000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      done({ status, stdout, stderr });
    });
  });
  await writeFile(
    join(output, 'native-runner.log'),
    verified.stdout + verified.stderr,
  );
  assert.equal(
    verified.status,
    0,
    (verified.stdout + verified.stderr).slice(-4000),
  );
  const line = verified.stdout
    .split('\n')
    .find((s) => s.startsWith('{') && s.includes('"remoteAudio"'));
  assert.ok(line);
  const result = {
    output,
    source: source.project,
    directory: served,
    status: 'passed',
    browser,
    native: JSON.parse(line) as Record<string, unknown>,
    errors,
    scope:
      'Same original real layered card; actual HTTP Web Audio and Godot remote WAV decoding/mixing; no physical device or network latency benchmark',
  };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(
    join(root, 'qa/action-audio-delivery/last-run.json'),
    JSON.stringify(result, null, 2),
  );
  console.log('ACTION_AUDIO_REMOTE_DELIVERY_PASSED ' + output);
} finally {
  if (app) await app.close();
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()));
  services.close();
}
