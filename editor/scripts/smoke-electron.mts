import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import type { InlineConfig, ViteDevServer } from 'vite';
import type { UiLanguage } from '../shared/contracts';
import type { CardDocument } from '../shared/document';
import { smokeCharacterEditing } from './smoke-character.mts';
import { smokeCharacterPanels } from './smoke-character-panels.mts';
import { smokeRenderModels } from './smoke-render-models.mts';
import { smokeWorkshopModels } from './smoke-workshop-models.mts';
import {smokeAgentWorkspace} from './smoke-agent-workspace.mts';
import { smokeRuntimeServices } from './smoke-runtime-services.mts';
import { smokeIrregularEditing } from './smoke-irregular-editing.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = await mkdtemp(join(tmpdir(), 'cardscape-smoke-'));
const require = createRequire(import.meta.url);
const errors: string[] = [];
const development = process.argv.includes('--dev');
const angle = process.platform === 'darwin' ? 'metal' : 'swiftshader';
let server: ViteDevServer | undefined;
let developmentURL: string | undefined;
if (development) {
  const { createServer } = await import('vite');
  const configuration = (await import('../electron.vite.config.ts')).default as {renderer: InlineConfig};
  server = await createServer({ ...configuration.renderer, server: { ...configuration.renderer.server, port: 0, strictPort: false } });
  await server.listen();
  developmentURL = server.resolvedUrls!.local[0];
}
const started = performance.now();
const application = await electron.launch({
  executablePath: require('electron') as string, args: [root, '--force-device-scale-factor=1', `--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'], timeout: 60000,
  env: { ...process.env, ATELIER_RUNTIME: runtime, ATELIER_BACKGROUND: '1', ...(developmentURL ? {ELECTRON_RENDERER_URL: developmentURL} : {}) }
});
application.process().stdout?.on('data', data => process.stdout.write(data));
application.process().stderr?.on('data', data => process.stderr.write(data));
application.on('window', page => page.on('pageerror', error => { errors.push(error.message); console.error('PAGE_ERROR', error.stack); }));
const deadline = Date.now() + 60000;
while (!application.windows().some(page => page.url().endsWith('/index.html'))) {
  if (Date.now() > deadline) throw Error('Editor window did not navigate to index.html');
  await new Promise(resolve => setTimeout(resolve, 50));
}
const page = application.windows().find(page => page.url().endsWith('/index.html'))!;
const requests: string[] = [];
page.on('request', request => requests.push(request.url()));
try {
  page.on('pageerror', error => { errors.push(error.message); console.error('PAGE_ERROR', error.stack); });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000, polling: 100 });
  assert.equal(await page.locator('body').getAttribute('data-app-mode'), 'home');
  await application.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false); });
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#home-new').textContent(), 'New Card');
  const nativeLocale = (label: UiLanguage) => application.evaluate(({ Menu }, names) => {
    const view = Menu.getApplicationMenu()?.items.find(item => item.label === names.view);
    const submenu = view?.submenu?.items.find(item => item.label === names.language);
    return submenu?.submenu?.items.find(item => item.checked)?.label;
  }, label === 'en' ? { view: 'View', language: 'Interface Language' } : { view: '视图', language: '界面语言' });
  assert.equal(await nativeLocale('en'), 'English');
  await page.locator('#ui-language').selectOption('zh-CN');
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  assert.equal(await nativeLocale('zh-CN'), '简体中文');
  assert.equal(await readFile(join(runtime, 'ui-language'), 'utf8'), 'zh-CN\n');
  console.log('SMOKE_HOME_READY');
  const homeMs = performance.now() - started;
  await page.waitForLoadState('load');
  requests.length = 0;
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000, polling: 100 });
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  const startupRequests = [...requests];
  assert.ok(startupRequests.length > 0, 'The network assertion must observe actual requests');
  assert.equal(await page.locator('.cm-editor').count(), 0);
  assert.ok(!startupRequests.some(name => /\/shader-(?:editor|graph)-[A-Z0-9_-]+\.js/i.test(name) || /\/\.vite\/deps\/(?:@codemirror|litegraph)/.test(name)), 'Shader libraries should load on demand');
  const opened = performance.now();
  await page.locator('#home-new').click({ force: true });
  await page.locator('#new-name').fill('TypeScript migration smoke');
  await page.locator('#new-confirm').click({ force: true });
  await page.waitForFunction(() => document.body.dataset.appMode === 'editor', null, { timeout: 60000, polling: 100 });
  const openMs = performance.now() - opened;
  await application.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false); });
  console.log('SMOKE_EDITOR_READY');
  await page.waitForFunction(() => document.querySelector<HTMLCanvasElement>('#author-model-canvas')?.dataset.mode === 'authored-grid', null, { timeout: 30000, polling: 100 });
  await page.waitForFunction(() => !!window.atelierIKPanel && !window.cardEditorHost.state().busy, null, { timeout: 30000, polling: 100 });
  const cardState = () => page.evaluate(() => {
    const { document, revision } = window.cardEditorHost.state();
    return { name: document.name, locale: document.locale, revision };
  });
  const originalCard = await cardState();
  await page.locator('#ui-language').selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal(await page.locator('[data-command="export"]').first().textContent(), 'Export');
  assert.deepEqual(await cardState(), originalCard);
  await page.locator('#ui-language').selectOption('zh-CN');
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
  await smokeIrregularEditing(page);
  await page.evaluate(() => {
    const host = window.cardEditorHost, panel = window.atelierIKPanel;
    const original = host.state().document;
    const rig = structuredClone(original.characterRig), actions = structuredClone(original.actions);
    const ensure = (condition: boolean, message: string) => { if (!condition) throw Error(message); };
    try {
      ensure(host.mutate('IK smoke fixture', (doc: CardDocument) => {
        const layer = doc.layers.find(layer => layer.kind === 'foreground');
        if (!layer) throw Error('IK smoke requires a foreground layer');
        doc.characterRig = {
          schema: 'card-character-rig/1',
          bones: [
            { id: 'root', name: 'Root', parentId: null, x: 512, y: 768, rotation: 0, scale: 1 },
            { id: 'arm', name: 'Arm', parentId: 'root', x: 100, y: 0, rotation: 0, scale: 1, tip: [80, 0] }
          ],
          bindings: [{ layerId: layer.id, boneId: 'root' }],
          constraints: [{ id: 'ik-smoke', name: 'Smoke IK', rootId: 'root', tipId: 'arm', end: [80, 0], target: [650, 740], bend: 1, mix: 1, solver: 'ccd', enabled: true, order: 0, iterations: 48, tolerance: 0.05 }]
        };
        doc.actions = [{ id: 'idle', name: 'Idle', duration: 1, event: 'idle', loop: false, motion: 1, emission: 1, bend: 0 }];
      }), 'IK fixture transaction was rejected');
      window.atelierCharacterAdvanced.refresh();
      const list = document.querySelector<HTMLSelectElement>('#ik-list')!;
      list.value = 'ik-smoke';
      list.dispatchEvent(new Event('change'));
      const values = panel.read();
      ensure(values.solver === 'ccd' && values.iterations === 48 && values.enabled, 'IK controls lost their typed values');
      ensure(document.querySelectorAll('.ik-limit-row').length === 2, 'IK chain controls were not generated');
      const iterations = document.querySelector<HTMLInputElement>('#ik-iterations')!;
      iterations.value = '';
      let invalid = false;
      try { panel.read(); } catch { invalid = true; }
      ensure(invalid, 'IK panel accepted empty numeric input');
      iterations.value = '48';
      const checkbox = document.querySelector<HTMLInputElement>('#ik-constraints input[type=checkbox]')!;
      const revision = host.state().revision;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      ensure(host.state().revision > revision && host.state().document.characterRig.constraints[0].enabled === false, 'IK toggle was not committed');
      const stale = document.querySelector<HTMLInputElement>('#ik-constraints input[type=checkbox]')!;
      host.mutate('Remove IK smoke constraint', (doc: CardDocument) => { doc.characterRig!.constraints = []; });
      const afterRemoval = host.state().revision;
      stale.checked = true;
      stale.dispatchEvent(new Event('change'));
      ensure(host.state().revision === afterRemoval && host.state().document.characterRig.constraints.length === 0, 'A stale IK control modified the document');
      ensure(document.getElementById('ik-live-status')!.textContent!.includes('IK 约束已变化'), 'Stale IK selection did not report its error');
    } finally {
      host.mutate('Restore smoke document', (doc: CardDocument) => {
        if (rig) doc.characterRig = rig; else delete doc.characterRig;
        doc.actions = actions;
      });
      window.atelierCharacterAdvanced.refresh();
    }
  });
  console.log('SMOKE_IK_PANEL_PASSED');
  await smokeCharacterEditing(page);
  await smokeCharacterPanels(page);
  await smokeRenderModels(page);
  await smokeWorkshopModels(page);
  await smokeRuntimeServices(page);
  const agentFixture = join(runtime,'agent-ui-fixture.cjs');
  await writeFile(agentFixture, `const fs=require('node:fs');const contract=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!contract.questionAnswer){process.stdout.write('请确认名称。<atelier-question>{"questions":[{"id":"name","title":"图层采用哪个名称？","options":["Gold","Blue"]}]}</atelier-question>');}else{process.stdout.write('根据回答修改图层。<atelier-actions>'+JSON.stringify({commands:[{op:'rename',layerId:contract.context.layer.id,name:contract.questionAnswer.answers.name}]})+'</atelier-actions>');}`);
  await smokeAgentWorkspace(page,{executable:process.execPath,script:agentFixture});
  await page.locator('[data-inspector-view="shader"]').click({ force: true });
  await page.waitForFunction(() => !!document.querySelector('.cm-editor'), null, { timeout: 30000, polling: 100 });
  await page.locator('#shader-mode-nodes').click({ force: true });
  await page.waitForFunction(() => !(document.getElementById('shader-node-workbench') as HTMLElement).hidden, null, {polling:100,timeout:30000});
  await page.locator('#shader-node-close').click({ force: true });
  const file = join(runtime, 'smoke.cardproj');
  await application.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, file);
  await page.locator('[data-command="save"]').first().click({ force: true });
  await page.waitForFunction(() => document.getElementById('dirty-marker')?.textContent === '', null, {polling:100,timeout:30000});
  await page.evaluate(() => {
    (window as any).cardEditorHost.mutate('Recovery check', (doc: {name:string}) => { doc.name = 'Recovered TypeScript smoke'; });
  });
  // A completed recovery write is the durable boundary for reload.
  await page.evaluate(async () => { await (window as any).cardEditorHost.flushSession(); });
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.schema, 'card-atelier/1');
  const metrics = await page.evaluate(() => ({
    preview: { ...document.querySelector<HTMLCanvasElement>('#author-model-canvas')!.dataset },
    imageCache: (window as any).cardEditorHost.imageCacheStats()
  }));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {polling:100,timeout:30000});
  await page.getByRole('button', {name:'打开卡片 Recovered TypeScript smoke',exact:true}).first().click({ force: true });
  await page.waitForFunction(() => document.body.dataset.appMode === 'editor', null, { timeout: 60000, polling: 100 });
  assert.equal(await page.locator('body').getAttribute('data-recovered'), 'true');
  assert.deepEqual(errors, []);
  await mkdir(join(root, 'qa'), { recursive: true });
  const output = development ? 'typescript-electron-dev' : 'typescript-electron';
  // Capture a settled frame after all playback and recovery assertions.
  await page.evaluate(() => { window.atelierAnimation?.pauseContext(); window.cardPreview.setPaused?.(true); window.cardPreview.setEffectsEnabled?.(false); });
  const screenshot = await application.evaluate(async ({ BrowserWindow }) => {
    const current = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/index.html'));
    if (!current) throw Error('Screenshot requires the editor window');
    // Windows does not repaint a hidden native surface. Keep this test window
    // fully transparent, unfocused and outside the taskbar while capturing it.
    const visible=current.isVisible(), opacity=current.getOpacity();
    try {
      current.setOpacity(0);
      current.setIgnoreMouseEvents(true);
      current.setSkipTaskbar(true);
      current.showInactive();
      current.webContents.setBackgroundThrottling(false);
      current.webContents.invalidate();
      // A fast restore may complete before Windows has repainted the previously
      // hidden native surface. Require a painted capture, with a bounded retry.
      const deadline = Date.now() + 5000;
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 250));
        const image = await Promise.race([
          current.webContents.capturePage(undefined, { stayAwake: true }),
          new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(Error('Native screenshot timed out')), 30000); timer.unref(); })
        ]);
        if (image.isEmpty()) throw Error('Native screenshot is empty');
        const size = image.getSize(), bitmap = image.toBitmap(), colors = new Set<number>();
        for (let y = 100; y < size.height; y += 20)
          for (let x = 0; x < size.width; x += 20)
            colors.add(bitmap.readUInt32LE((y * size.width + x) * 4));
        if (colors.size >= 8) return image.toPNG().toString('base64');
        if (Date.now() >= deadline) throw Error('Native screenshot did not paint the editor');
        current.webContents.invalidate();
      }
    } finally {
      if(!visible) current.hide();
      current.setOpacity(opacity);
      current.setIgnoreMouseEvents(false);
      current.setSkipTaskbar(false);
    }
  });
  await writeFile(join(root, 'qa', output + '.png'), Buffer.from(screenshot, 'base64'));
  const result = { mode: development ? 'development' : 'production', renderer: `ANGLE ${angle} (functional validation)`, homeMs: Math.round(homeMs), openMs: Math.round(openMs), startupRequests: startupRequests.length, errors, ...metrics };
  await writeFile(join(root, 'qa', output + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('SMOKE_STATE', await page.evaluate(() => ({ ...document.body.dataset, homeError: document.getElementById('home-error')?.textContent, status: document.getElementById('status')?.textContent })));
  throw error;
} finally {
  const closed = application.waitForEvent('close', { timeout: 10000 });
  await application.evaluate(({ app }) => { setImmediate(() => app.exit()); }).catch(() => {});
  await closed.catch(() => { application.process().kill(); });
  await server?.close();
  await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
