import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from 'playwright';

const executable = process.argv[2];
const expectedArchitecture = process.argv[3] ?? process.arch;
assert.ok(executable, 'Pass the packaged Cardscape executable');
const executablePath = resolve(executable);
await access(executablePath);

const runtime = await mkdtemp(join(tmpdir(), 'cardscape-package-'));
let application: ElectronApplication | undefined;
try {
  application = await electron.launch({
    executablePath,
    args: ['--enable-unsafe-swiftshader', '--disable-gpu-watchdog'],
    env: { ...process.env, ATELIER_RUNTIME: runtime, ATELIER_BACKGROUND: '1' },
    timeout: 60_000,
  });
  application.process().stdout?.on('data', data => process.stdout.write(data));
  application.process().stderr?.on('data', data => process.stderr.write(data));
  const { packaged, resources, appPath, arch, version } = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    resources: process.resourcesPath,
    appPath: app.getAppPath(),
    arch: process.arch,
    version: app.getVersion(),
  }));
  assert.equal(packaged, true);
  assert.equal(arch, expectedArchitecture);
  await Promise.all([
    access(join(resources, 'godot-sdk', 'addons', 'cardscape', 'cardscape_card.gd')),
    access(join(resources, 'godot-sdk', 'README.md')),
    access(join(appPath, 'assets', 'template.json')),
    access(join(appPath, 'skills', 'card-atelier', 'SKILL.md')),
    access(join(appPath, 'native-ai', 'cutout_worker.py')),
  ]);

  const deadline = Date.now() + 60_000;
  let page = application.windows().find(window => window.url().endsWith('/index.html'));
  while (!page && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    page = application.windows().find(window => window.url().endsWith('/index.html'));
  }
  assert.ok(page, 'The editor window must open its packaged entry point');
  await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { polling: 100 });
  const bootstrap = await page.evaluate(() => window.atelier.invoke('home-bootstrap'));
  assert.equal(bootstrap.engine.engine, 'rust');
  assert.equal(bootstrap.appVersion, version);
  await page.locator('#ui-language').selectOption('zh-CN');
  await page.waitForFunction(() => document.documentElement.lang === 'zh-CN', null, { polling: 100 });
  await access(join(runtime, 'ui-language'));
  console.log(`Verified packaged Cardscape ${version} (${process.platform}/${arch})`);
} finally {
  if (application) {
    const closed = application.waitForEvent('close', { timeout: 10_000 });
    await application.evaluate(({ app }) => { setImmediate(() => app.exit()); }).catch(() => {});
    await closed.catch(() => { application!.process().kill(); });
  }
  await rm(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
