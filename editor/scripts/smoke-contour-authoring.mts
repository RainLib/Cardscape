import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { verifyContourMaterials } from './verify-contour-materials.mts';
import type { CardDocument } from '../shared/document';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const Frame = require('../dist/renderer/frame-model.js');
const Geometry = require('../dist/renderer/contour-geometry.js');
const materials = process.argv.includes('--materials'),
  complex = materials || process.argv.includes('--complex'),
  qa = materials
    ? 'contour-materials'
    : complex
      ? 'complex-contour'
      : 'contour-authoring';
const output = join(root, 'qa/' + qa + '/run-' + Date.now()),
  project = join(output, '轮廓验收.cardproj'),
  exports = join(output, 'exports');
await mkdir(exports, { recursive: true });
const Workshop = require('../dist/renderer/workshop-model.js'),
  Storage = require('../dist/electron/workshop-storage.cjs');
const example = JSON.parse(
  await readFile(
    join(
      root,
      'examples/production-card/arcane-sentinel/星炉哨卫.cardworkshop',
    ),
    'utf8',
  ),
);
const initial: CardDocument = Workshop.resolve(Storage.unpack(example));
if (materials) {
  const { png } = require('../tests/fixtures/character-animation.cjs');
  for (const [i, [x, y]] of [
    [400, 140],
    [900, 700],
    [250, 415],
  ].entries())
    initial.layers.unshift({
      id: 'material-marker-' + i,
      name: '图片边饰配准 ' + i,
      kind: 'image',
      role: 'frame-artwork',
      src: png(
        [x - 9, y - 9, 18, 18],
        [i === 0 ? 255 : 0, i === 1 ? 255 : 0, i === 2 ? 255 : 0, 255],
        1024,
        1536,
      ),
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      visible: true,
      locked: false,
      spatial: { role: 'surface', z: 0.08, clip: false },
    });
}
await writeFile(project, JSON.stringify(initial));
const app = await electron.launch({
  executablePath: require('electron'),
  args: [
    root,
    '--force-device-scale-factor=1',
    '--disable-gpu-watchdog',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  env: {
    ...process.env,
    ATELIER_RUNTIME: join(output, 'runtime'),
    ATELIER_BACKGROUND: '1',
  },
  timeout: 60000,
});
const errors: string[] = [];
let served = '';
const server = createServer(async (req, res) => {
  try {
    if (
      materials &&
      new URL(req.url || '/', 'http://localhost').pathname ===
        '/qa-frame-raster.js'
    ) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(await readFile(join(root, 'dist/renderer/frame-raster.js')));
      return;
    }
    const file = resolve(
      served,
      '.' +
        decodeURIComponent(
          new URL(req.url || '/', 'http://localhost').pathname,
        ),
    );
    if (!file.startsWith(served + sep)) throw Error('Outside export');
    res.setHeader(
      'Content-Type',
      (
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.json': 'application/json',
          '.css': 'text/css',
          '.png': 'image/png',
          '.webp': 'image/webp',
        } as Record<string, string>
      )[extname(file)] || 'application/octet-stream',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
try {
  const readyDeadline = Date.now() + 60000;
  while (!app.windows().some((page) => page.url().endsWith('/index.html'))) {
    if (Date.now() > readyDeadline)
      throw Error('Editor main window did not open');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const page = app
    .windows()
    .find((page) => page.url().endsWith('/index.html'))!;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (/^CONTOUR_(PROFILE|MATERIAL_FINISH)/.test(m.text())) console.log(m.text());
    if (m.type() === 'error') {
      errors.push('console: ' + m.text());
      console.error('RENDERER', m.text());
    }
  });
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await app.evaluate(
    ({ BrowserWindow, dialog }, { project, exports }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.setBackgroundThrottling(false);
        window.setOpacity(0);
        window.setIgnoreMouseEvents(true);
        window.showInactive();
      }
      dialog.showOpenDialog = async (
        ...args:
          | [unknown, import('electron').OpenDialogOptions]
          | [import('electron').OpenDialogOptions]
      ) => ({
        canceled: false,
        filePaths: (args.length === 2 ? args[1] : args[0]).properties?.includes(
          'openDirectory',
        )
          ? [exports]
          : [project],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: project,
      });
    },
    { project, exports },
  );
  await page.locator('#home-open').click({ force: true });
  await page.waitForFunction(
    () =>
      document.body.dataset.appMode === 'editor' &&
      !window.cardEditorHost.state().busy,
    null,
    { timeout: 60000 },
  );
  const original = await page.evaluate(() =>
    structuredClone(window.cardEditorHost.state().document.frameStyle?.contour),
  );
  await page.evaluate(() => {
    window.atelierFrame.open();
    window.cardEditorHost.unlockFrame();
  });
  await page
    .locator('#frame-contour-editor')
    .evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await page.locator('#frame-contour-preset').selectOption('double');
  await page.locator('#frame-contour-target').selectOption('1');
  await page.locator('#frame-contour-point-add').click({ force: true });
  assert.equal(
    (await page.locator('#frame-contour-window').inputValue()).split('\n')
      .length,
    5,
  );
  async function drag(selector: string, to: [number, number]) {
    await page.locator('#frame-contour-canvas').scrollIntoViewIfNeeded();
    const points = await page.evaluate(
      ({ selector, to }) => {
        const svg = document.querySelector<SVGSVGElement>(
            '#frame-contour-canvas',
          )!,
          node = document.querySelector<SVGCircleElement>(selector)!;
        const matrix = svg.getScreenCTM()!,
          a = new DOMPoint(
            Number(node.getAttribute('cx')),
            Number(node.getAttribute('cy')),
          ).matrixTransform(matrix),
          b = new DOMPoint(...to).matrixTransform(matrix);
        return { a: [a.x, a.y], b: [b.x, b.y] };
      },
      { selector, to },
    );
    await page.mouse.move(points.a[0], points.a[1]);
    await page.mouse.down();
    await page.mouse.move(points.b[0], points.b[1], { steps: 5 });
    await page.mouse.up();
  }
  const marker = (index: number, handle = 'point') =>
    `#frame-contour-canvas circle[data-knot="${index}"][data-handle="${handle}"]`;
  await drag(marker(1), [500, 145]);
  assert.equal(
    (await page.locator('#frame-contour-window').inputValue()).split('\n')[1],
    '500,145',
  );
  await page.locator('#frame-contour-draft-undo').click({ force: true });
  assert.equal(
    (await page.locator('#frame-contour-window').inputValue()).split('\n')[1],
    '512,120',
  );
  await page.locator('#frame-contour-draft-redo').click({ force: true });
  await page.locator('#frame-contour-point-smooth').click({ force: true });
  await drag(marker(1, 'outgoing'), [650, 80]);
  await page.locator('#frame-contour-canvas').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(
    (await page.locator('#frame-contour-window').inputValue()).split('\n')[1],
    '501,145',
  );
  await page.keyboard.press('Control+z');
  assert.equal(
    (await page.locator('#frame-contour-window').inputValue()).split('\n')[1],
    '500,145',
  );
  const viewBox = await page
    .locator('#frame-contour-canvas')
    .getAttribute('viewBox');
  await page.locator('#frame-contour-canvas').hover();
  await page.mouse.wheel(0, -200);
  assert.notEqual(
    await page.locator('#frame-contour-canvas').getAttribute('viewBox'),
    viewBox,
  );
  await page.locator('#frame-contour-fit').click({ force: true });
  assert.equal(
    await page.locator('#frame-contour-canvas').getAttribute('viewBox'),
    viewBox,
  );
  await page.locator('#frame-contour-apply').click({ force: true });
  const edited = await page.evaluate(() =>
    structuredClone(
      window.cardEditorHost.state().document.frameStyle!.contour!,
    ),
  );
  assert.deepEqual(edited.paths!.windows[0][1].outgoing, [650, 80]);
  await page.locator('#frame-contour-target').selectOption('1');
  await page.locator(marker(1)).first().click({ force: true });
  await page.locator('#frame-contour-canvas').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'curve-controls.png') });
  await page.locator('[data-command="undo"]').first().click({ force: true });
  assert.deepEqual(
    await page.evaluate(
      () => window.cardEditorHost.state().document.frameStyle!.contour,
    ),
    original,
  );
  await page.locator('[data-command="redo"]').first().click({ force: true });
  assert.deepEqual(
    await page.evaluate(
      () => window.cardEditorHost.state().document.frameStyle!.contour,
    ),
    edited,
  );
  await page.locator('#frame-contour-target').selectOption('1');
  const revision = await page.evaluate(
    () => window.cardEditorHost.state().revision,
  );
  await drag(marker(0), [1000, 1500]);
  await page.locator('#frame-contour-apply').click({ force: true });
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    revision,
  );
  assert.equal(
    await page.locator('#frame-contour-note').getAttribute('data-invalid'),
    'true',
  );
  await page.locator('#frame-contour-draft-undo').click({ force: true });
  await page
    .locator('#frame-contour-svg')
    .evaluate((el) => (el.closest('details')!.open = true));
  await page
    .locator('#frame-contour-svg')
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>document.body.dataset.contourAttack="yes"</script></svg>',
    );
  await page.locator('#frame-contour-import').click({ force: true });
  assert.equal(
    await page.evaluate(() => document.body.dataset.contourAttack),
    undefined,
  );
  assert.equal(
    await page.evaluate(() => window.cardEditorHost.state().revision),
    revision,
  );
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 768"><defs><path d="M0 0h2v2h-2z"/></defs><g transform="translate(10 10)"><rect width="492" height="748"/><ellipse cx="246" cy="270" rx="190" ry="240"/><rect x="50" y="550" width="392" height="130"/></g></svg>';
  await page
    .locator('#frame-contour-svg')
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg"><g style="transform: translateX(3px)"><rect width="900" height="1400"/><rect x="100" y="100" width="700" height="1200"/></g></svg>',
    );
  await page.locator('#frame-contour-import').click({ force: true });
  assert.match(await page.locator('#frame-status').innerText(), /几何样式/);
  const rounded =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1536"><rect x="20" y="20" width="984" height="1496"/><rect x="462" y="100" width="100px " height="600" rx="500"/><rect x="120" y="1120" width="784" height="260"/></svg>';
  await page.locator('#frame-contour-svg').fill(rounded);
  await page.locator('#frame-contour-import').click({ force: true });
  assert.equal(
    await page.locator('#frame-contour-note').getAttribute('data-invalid'),
    'false',
  );
  await page.locator('#frame-contour-apply').click({ force: true });
  const capsule = await page.evaluate(() =>
    window.cardEditorHost
      .state()
      .document.frameStyle!.contour!.paths!.windows.find((path) =>
        path.some(
          (n) => Math.hypot(n.point[0] - 562, n.point[1] - 400) < 0.001,
        ),
      ),
  );
  assert.ok(capsule);
  assert.equal(capsule.length, 8);
  await writeFile(join(output, 'source.svg'), svg);
  await page.locator('#frame-contour-svg').fill(svg);
  await page.locator('#frame-contour-import').click({ force: true });
  assert.equal(
    await page.locator('#frame-contour-note').getAttribute('data-invalid'),
    'false',
  );
  await page.locator('#frame-contour-apply').click({ force: true });
  let contour = await page.evaluate(() =>
    structuredClone(
      window.cardEditorHost.state().document.frameStyle!.contour!,
    ),
  );
  assert.deepEqual(contour.outline[0], [20, 20]);
  assert.equal(contour.paths!.windows.length, 2);
  assert.ok(contour.paths!.windows[0].some((n) => n.incoming && n.outgoing));
  let exampleSVG = await readFile(
    join(root, 'examples/contour/dual-window.svg'),
    'utf8',
  );
  await page
    .locator('#frame-contour-file')
    .setInputFiles(join(root, 'examples/contour/dual-window.svg'));
  await page.waitForFunction(() =>
    document
      .querySelector<HTMLTextAreaElement>('#frame-contour-svg')!
      .value.includes('异形卡体'),
  );
  await page.locator('#frame-contour-apply').click({ force: true });
  assert.deepEqual(
    await page.evaluate(
      () => window.cardEditorHost.state().document.frameStyle!.contour,
    ),
    contour,
  );
  if (complex) {
    const importDraft = async (text: string, operation: string) => {
      await page
        .locator('#frame-contour-import-target')
        .selectOption(operation);
      await page.locator('#frame-contour-svg').fill(text);
      await page.locator('#frame-contour-import').click({ force: true });
      assert.equal(
        await page.locator('#frame-contour-note').getAttribute('data-invalid'),
        'false',
      );
    };
    const base = 'M100 100H900V1400H100Z',
      cut = 'M0 700H1024V800H0Z';
    await importDraft(base, 'all');
    await importDraft(cut, 'difference');
    assert.equal(
      await page.locator('#frame-contour-target option').count(),
      2,
      'boolean split preserves two entities',
    );
    await page.locator('#frame-contour-draft-undo').click({ force: true });
    assert.equal(await page.locator('#frame-contour-target option').count(), 1);
    await page.locator('#frame-contour-draft-redo').click({ force: true });
    assert.equal(await page.locator('#frame-contour-target option').count(), 2);
    await importDraft(base, 'all');
    await importDraft(base, 'difference');
    assert.equal(
      await page.locator('#frame-contour-target option').count(),
      0,
      'empty result remains empty',
    );
    for (const op of ['union', 'intersection', 'xor']) {
      await importDraft(base, 'all');
      await importDraft(cut, op);
    }
    exampleSVG = await readFile(
      join(root, 'examples/contour/complex-islands.svg'),
      'utf8',
    );
    await writeFile(join(output, 'complex.svg'), exampleSVG);
    await importDraft(exampleSVG, 'all');
    const extraWindow = 'M360 560H440V620H360Z';
    await importDraft(extraWindow, 'difference');
    // The browser oracle performs even/odd fill of the independently authored
    // source plus a contained cutout, rather than drawing our computed polygons.
    exampleSVG = exampleSVG.replace('d="', 'd="' + extraWindow + ' ');
    await writeFile(join(output, 'boolean-source-oracle.svg'), exampleSVG);
    await page.locator('#frame-contour-apply').click({ force: true });
    contour = await page.evaluate(() =>
      structuredClone(
        window.cardEditorHost.state().document.frameStyle!.contour!,
      ),
    );
    assert.equal(contour.windows.length, 7);
    assert.equal(contour.islands!.length, 2);
    assert.ok(
      Geometry.rings(contour).reduce(
        (n: number, r: number[][]) => n + r.length,
        0,
      ) > 64,
    );
    const disjointRing = Geometry.rings(contour).findIndex((r: number[][]) =>
      r.every((p) => p[0] > 800),
    );
    assert.ok(disjointRing > 0);
    await page
      .locator('#frame-contour-target')
      .selectOption(String(disjointRing));
    assert.equal(
      await page
        .locator('#frame-contour-canvas')
        .getAttribute('data-selected-ring'),
      String(disjointRing),
    );
    await page.locator('#frame-contour-region-remove').click({ force: true });
    assert.equal(
      await page.locator('#frame-contour-target option').count(),
      10,
    );
    await page.locator('#frame-contour-draft-undo').click({ force: true });
    assert.equal(
      await page.locator('#frame-contour-target option').count(),
      11,
    );
  }
  if (materials) {
    for (const finish of ['glow', 'fire', 'metal']) {
      await page.locator('#frame-finish').selectOption(finish, { force: true });
      assert.equal(
        await page.evaluate(
          () => window.cardEditorHost.state().document.frameStyle!.finish,
        ),
        finish,
      );
      console.log('CONTOUR_MATERIAL_SELECTED', finish);
    }
  }
  await page.locator('[data-command="save"]').first().click({ force: true });
  await page.waitForFunction(
    () => document.getElementById('dirty-marker')?.textContent === '',
  );
  const saved = JSON.parse(await readFile(project, 'utf8')) as CardDocument;
  assert.deepEqual(saved.frameStyle!.contour, contour);
  await page.screenshot({ path: join(output, 'editor.png') });
  await page.locator('#home-back').click({ force: true });
  await page.waitForFunction(() => document.body.dataset.appMode === 'home');
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
  assert.deepEqual(
    await page.evaluate(
      () => window.cardEditorHost.state().document.frameStyle!.contour,
    ),
    contour,
  );
  await page.locator('[data-command="export"]').first().click({ force: true });
  await page.locator('#export-preset').selectOption('desktop');
  await page.locator('#export-start').click({ force: true });
  let directory = '';
  const deadline = Date.now() + 60000;
  while (!directory) {
    for (const name of await readdir(exports)) {
      const folder = join(exports, name);
      try {
        await readFile(join(folder, 'godot/library.tres'));
        await readFile(join(folder, 'manifest.json'));
        directory = folder;
        break;
      } catch {}
    }
    if (!directory && Date.now() > deadline) throw Error('Export timed out');
    if (!directory) await new Promise((r) => setTimeout(r, 100));
  }
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest.frameStyle.contour, contour);
  served = directory;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  if (materials)
    await page.addInitScript({
      content: `
    for(const [key,methods] of Object.entries({CardContourField:['create'],CardContourCoordinates:['create'],CardContourBevel:['create'],CardFrame:['geometry','validate'],CardShaderVariants:['frameFragment']})){
      let value;Object.defineProperty(window,key,{configurable:true,get(){return value},set(next){value=next;for(const method of methods){const original=next[method];if(typeof original==='function')next[method]=function(...args){const at=performance.now();try{return original.apply(this,args)}finally{const ms=performance.now()-at;if(ms>20)console.log('CONTOUR_PROFILE '+key+'.'+method+' '+ms.toFixed(1));}};}}});
    }
  `,
    });
  await page.goto(`http://127.0.0.1:${address.port}/index.html`);
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows())
      w.webContents.setBackgroundThrottling(false);
  });
  const loadedAt = Date.now(),
    playerDeadline = loadedAt + 60000;
  // Poll from the test process: an opacity-zero Electron window may suspend
  // page timers after a file:// -> HTTP renderer swap even when CDP is ready.
  while (
    !(await page.evaluate(
      () =>
        document.body.dataset.ready === 'true' || !!document.body.dataset.error,
    ))
  ) {
    if (Date.now() > playerDeadline)
      throw Error('Exported player did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const playerReadyMs = Date.now() - loadedAt;
  console.log('CONTOUR_PLAYER_READY', playerReadyMs);
  assert.ok(
    playerReadyMs < 60000,
    'player first load exceeds the existing 60-second acceptance budget',
  );
  if (materials) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    console.log(
      'CONTOUR_METRICS',
      JSON.stringify(await cdp.send('Performance.getMetrics')),
    );
    await cdp.detach();
  }
  assert.equal(await page.locator('body').getAttribute('data-error'), null);
  const preview = await page.evaluate(() => {
    window.cardPreview.playAction('idle', 0, true);
    window.cardPreview.pose(20, 12);
    const canvas = document.querySelector<HTMLCanvasElement>(
      '#author-model-canvas',
    )!;
    return {
      png: canvas.toDataURL(),
      error: canvas.getContext('webgl')!.getError(),
    };
  });
  assert.equal(preview.error, 0);
  await writeFile(
    join(output, 'player.png'),
    Buffer.from(preview.png.split(',')[1], 'base64'),
  );
  const probes: Array<{ x: number; y: number; solid: boolean }> = [];
  const style = Frame.resolve(saved),
    rings = Geometry.rings(contour);
  for (let x = 0; x <= 1024; x += 64)
    for (let y = 0; y <= 1536; y += 64) {
      const near = rings.some((ring) =>
        ring.some((a, i) => {
          const b = ring[(i + 1) % ring.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy),
              ),
            );
          return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < 8;
        }),
      );
      if (!near)
        probes.push({
          x,
          y,
          solid:
            Frame.contains(style, x, y) &&
            !Frame.contains(style, x, y, style.width),
        });
    }
  const mask = await page.evaluate(
    ({ probes, layers, particles }) => {
      const preview = window.cardPreview,
        canvas = document.querySelector<HTMLCanvasElement>(
          '#author-model-canvas',
        )!,
        gl = canvas.getContext('webgl')!;
      preview.setRenderOverrides({
        layers: layers.map((l) => ({ ...l, visible: l.kind === 'frame' })),
        particles: { ...particles, enabled: false },
      });
      preview.setZoom(1);
      preview.playAction('idle', 0, true);
      preview.pose(0, 0);
      const fit = Math.min(1, canvas.width / canvas.height / 0.85),
        aspect = canvas.width / canvas.height;
      const samples = probes.map(({ x, y }) => {
        const p = ((x / 1024 - 0.5) * 2.9 * fit) / aspect / (2.7 - 0.045),
          q = ((0.75 - y / 1024) * 2.9 * fit) / (2.7 - 0.045),
          rgba = new Uint8Array(4);
        gl.readPixels(
          Math.round(((p + 1) * canvas.width) / 2),
          Math.round(((q + 1) * canvas.height) / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          rgba,
        );
        return rgba[3];
      });
      return { samples, png: canvas.toDataURL(), error: gl.getError() };
    },
    { probes, layers: saved.layers, particles: saved.particles },
  );
  const sourceMask = await page.evaluate(
    async ({ source, probes }) => {
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      parsed.documentElement.setAttribute('width', '1024');
      parsed.documentElement.setAttribute('height', '1536');
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(parsed)], {
          type: 'image/svg+xml',
        }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1536;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0, 1024, 1536);
        return {
          samples: probes.map((p) => ctx.getImageData(p.x, p.y, 1, 1).data[3]),
          png: canvas.toDataURL(),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { source: exampleSVG, probes },
  );
  assert.equal(mask.error, 0);
  for (let i = 0; i < probes.length; i++)
    assert.ok(
      probes[i].solid ? mask.samples[i] > 240 : mask.samples[i] < 15,
      JSON.stringify({ probe: probes[i], alpha: mask.samples[i] }),
    );
  for (let i = 0; i < probes.length; i++)
    assert.ok(
      probes[i].solid
        ? sourceMask.samples[i] > 240
        : sourceMask.samples[i] < 15,
      'Native SVG differs at ' + JSON.stringify(probes[i]),
    );
  await writeFile(
    join(output, 'webgl-frame-mask.png'),
    Buffer.from(mask.png.split(',')[1], 'base64'),
  );
  await writeFile(
    join(output, 'svg-oracle.png'),
    Buffer.from(sourceMask.png.split(',')[1], 'base64'),
  );
  const materialVerification = materials
    ? await verifyContourMaterials(page, saved, output)
    : undefined;
  assert.deepEqual(errors, []);
  const result = {
    materialVerification,
    playerReadyMs,
    output,
    project,
    directory,
    godot: join(directory, 'godot'),
    contour,
    complex,
    booleanOperations: complex,
    booleanResultExported: complex,
    dragHandles: true,
    draftUndoRedo: true,
    documentUndoRedo: true,
    invalidDraftProtected: true,
    svgImported: true,
    sourceReopened: true,
    webglPlayer: true,
    webglPixelProbes: probes.length,
    nativeSVGOracle: true,
    errors,
  };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await writeFile(
    join(root, 'qa/' + qa + '/last-run.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(
    'CONTOUR_AUTHORING_PASSED',
    JSON.stringify({
      output,
      directory,
      points: Geometry.rings(contour).reduce(
        (n: number, r: number[][]) => n + r.length,
        0,
      ),
    }),
  );
} catch (error) {
  console.error('ERRORS', errors);
  for (const page of app.windows())
    if (page.url().includes('index.html')) {
      console.error(
        'STATE',
        await page
          .evaluate(() => ({
            mode: document.body.dataset.appMode,
            ready: document.body.dataset.ready,
            finish: document.getElementById('frame-finish')?.outerHTML,
            text: document.body.innerText.slice(-6000),
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
