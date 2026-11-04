import { analyzePresentationTrace } from './presentation-trace-model.mts';
import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cpus, totalmem, release } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { measureScene, type PerformanceScene } from './performance-scene.mts';
import type { CardDocument } from '../shared/document';
import type { AssetManifest } from '../shared/export';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  require = createRequire(import.meta.url);
const option = (name: string, fallback: string) =>
  process.argv
    .find((a) => a.startsWith('--' + name + '='))
    ?.split('=')
    .slice(1)
    .join('=') || fallback;
const seconds = Number(option('seconds', '8')),
  soak = Number(option('soak', '120'));
const runtime = option('runtime', 'current');
const action = option('action', 'alternating');
const adaptive = process.argv.includes('--adaptive');
const presentationTrace = process.argv.includes('--presentation-trace');
const soakCount = Number(option('soak-count', '8'));
const soakMode = option('soak-mode', 'adaptive');
assert.ok(['current', 'fixture'].includes(runtime));
assert.ok([1, 4, 8, 16].includes(soakCount));
assert.ok(soakMode === 'small' || soakMode === 'adaptive');
assert.ok(Number.isFinite(seconds) && seconds >= 2 && seconds <= 60);
assert.ok(Number.isFinite(soak) && soak >= 2 && soak <= 3600);
const fixtureIndex = resolve(
  root,
  option('fixture', 'qa/production-readiness/arcane-sentinel/last-run.json'),
);
const fixture = JSON.parse(await readFile(fixtureIndex, 'utf8')) as {
  project: string;
  directory: string;
};
if (adaptive && runtime === 'fixture')
  for (const name of [
    'adaptive-textures.js',
    'player-textures.js',
    'export-profile.js',
  ])
    await readFile(join(fixture.directory, name));
const doc = JSON.parse(await readFile(fixture.project, 'utf8')) as CardDocument;
const manifest = JSON.parse(
  await readFile(join(fixture.directory, 'manifest.json'), 'utf8'),
) as AssetManifest;
if (adaptive)
  assert.ok(
    manifest.exportProfile,
    'Export the real fixture with a texture profile first',
  );
const textureAssets = manifest.exportProfile
  ? {
      profile: manifest.exportProfile,
      layers: Object.fromEntries(
        manifest.layers
          .filter((layer) => layer.asset)
          .map((layer) => [layer.id, layer.asset!]),
      ),
      back: manifest.backAsset || undefined,
    }
  : undefined;
const output = join(root, 'qa/card-performance', 'run-' + Date.now());
await mkdir(output, { recursive: true });
console.log('PERF_OUTPUT', output);
const measurementSources: Record<string, string> = {};
for (const name of [
  'performance-scene.mts',
  'measure-card-performance.mts',
  'presentation-trace-model.mts',
]) {
  const bytes = await readFile(join(root, 'scripts', name));
  await writeFile(join(output, name), bytes);
  measurementSources[name] = createHash('sha256').update(bytes).digest('hex');
}
const textAssets: Record<string, string> = {};
for (const layer of manifest.layers)
  if (layer.kind === 'text' && layer.asset) {
    const bytes = await readFile(join(fixture.directory, layer.asset));
    textAssets[layer.id] =
      'data:image/' +
      (layer.asset.endsWith('.webp') ? 'webp' : 'png') +
      ';base64,' +
      bytes.toString('base64');
  }
const hashes: Record<string, string> = {};
// Use current portable modules with the previously verified real export's
// assets. This permits before/after profiling without changing user projects.
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url || '/', 'http://localhost').pathname,
    );
    const current =
      runtime === 'current' &&
      (pathname.endsWith('.js') || pathname === '/index.html');
    const folder = current ? join(root, 'dist/renderer') : fixture.directory;
    const file = resolve(
      folder,
      current && pathname === '/index.html' ? 'player.html' : '.' + pathname,
    );
    if (!file.startsWith(folder + sep)) throw Error('Outside fixture');
    const bytes = await readFile(file);
    if (pathname.endsWith('.js'))
      hashes[pathname] = createHash('sha256').update(bytes).digest('hex');
    const mime: Record<string, string> = {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    res.setHeader(
      'Content-Type',
      mime[extname(file)] || 'application/octet-stream',
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('Missing fixture resource');
  }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/index.html`;
const entry = join(output, 'main.cjs');
await writeFile(
  entry,
  `const{app,BrowserWindow}=require('electron');app.setPath('userData',require('node:path').join(__dirname,'profile'));app.on('window-all-closed',()=>{});app.whenReady().then(()=>{const w=new BrowserWindow({width:1320,height:1040,show:false,webPreferences:{backgroundThrottling:false}});${presentationTrace ? 'w.setOpacity(1);w.setAlwaysOnTop(true);w.setIgnoreMouseEvents(true);w.setSkipTaskbar(true);w.showInactive();' : 'w.setOpacity(0);w.setIgnoreMouseEvents(true);w.setSkipTaskbar(true);w.showInactive();'}w.loadURL(process.env.CARDSCAPE_PERF_URL);});`,
);
const app = await electron.launch({
  executablePath: require('electron') as string,
  args: [
    entry,
    '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  env: { ...process.env, CARDSCAPE_PERF_URL: url },
  timeout: 60000,
});
const errors: string[] = [];
const execute = promisify(execFile);
let progressWrite = Promise.resolve();
let lastProgressAt = 0;
let succeeded = false;
try {
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.exposeFunction(
    'cardscapeBenchmarkProgress',
    (progress: {
      seconds: number;
      frames: number;
      count: number;
      resources: Record<string, number | undefined>;
    }) => {
      const point = {
        status: 'running',
        at: new Date().toISOString(),
        ...progress,
      };
      progressWrite = progressWrite
        .then(() =>
          writeFile(
            join(output, 'progress.json'),
            JSON.stringify(point, null, 2),
          ),
        )
        .catch((error) => {
          errors.push('Progress persistence: ' + String(error));
        });
      if (Date.now() - lastProgressAt >= 30000) {
        lastProgressAt = Date.now();
        console.log('PERF_PROGRESS', JSON.stringify(point));
      }
      return progressWrite;
    },
  );
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true',
    null,
    { polling: 100, timeout: 180000 },
  );
  await page.evaluate(() => {
    const host = window as unknown as {
      cardscapeBenchmarkProgress(detail: unknown): Promise<void>;
    };
    window.addEventListener('cardscape-benchmark-progress', (event) => {
      void host.cardscapeBenchmarkProgress(
        (event as CustomEvent<unknown>).detail,
      );
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  if (process.argv.includes('--profile')) await cdp.send('Profiler.enable');
  const gpu = await app.evaluate(async ({ app }) => ({
    features: app.getGPUFeatureStatus(),
    info: await app.getGPUInfo('basic'),
  }));
  const result: { [key: string]: unknown } = {
    output,
    runtime,
    measurementSources,
    presentationTrace,
    windowMode: presentationTrace
      ? 'visible opaque always-on-top noninteractive window'
      : 'transparent inactive window',
    fixture: fixture.project,
    fixtureIndex,
    fixtureSha256: createHash('sha256')
      .update(await readFile(fixture.project))
      .digest('hex'),
    host: {
      os: process.platform,
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memory: totalmem(),
    },
    gpu,
    scope: adaptive
      ? 'Desktop actual hardware, real published large/small texture files and original masks. Shared GL context; isolate image tier from effects LOD and exercise complete-batch swaps. Not a physical-phone benchmark.'
      : 'Desktop actual hardware; current compiled portable runtime, real saved project and exported text. Shared WebGL context, full-resolution textures; not a mobile-device or adaptive-loader benchmark.',
    scenarios: [],
    errors,
  };
  const scenarios: Array<
    Awaited<ReturnType<typeof measureScene>> & {
      processMemory?: unknown[];
      heap?: unknown;
    }
  > = [];
  const cases: Array<
    Omit<PerformanceScene, 'doc' | 'textAssets' | 'textureAssets'> & {
      variant?: string;
    }
  > = adaptive
    ? process.argv.includes('--soak-only')
      ? [
          {
            count: soakCount,
            quality: 'balanced',
            large: false,
            seconds: soak,
            cycles: 10,
            textureMode: soakMode,
            retainSmallEffects: soakMode === 'small',
            transitionCycles: 10,
          },
        ]
      : (process.argv.includes('--quick') ? [1, 4] : [1, 4, 8, 16]).flatMap(
          (count) => [
            {
              count,
              quality: 'balanced',
              large: false,
              seconds,
              cycles: 0,
              textureMode: 'large' as const,
            },
            {
              count,
              quality: 'balanced',
              large: false,
              seconds,
              cycles: 0,
              textureMode: 'small' as const,
              retainSmallEffects: true,
            },
            {
              count,
              quality: 'balanced',
              large: false,
              seconds,
              cycles: 2,
              textureMode: 'adaptive' as const,
              transitionCycles: 3,
            },
          ],
        )
    : process.argv.includes('--soak-only')
      ? [
          {
            count: soakCount,
            quality: 'balanced',
            large: false,
            seconds: soak,
            cycles: 10,
          },
        ]
      : process.argv.includes('--parity')
        ? ['original', 'transparent', 'replacement', 'frosted'].map(
            (variant) => ({
              count: 1,
              quality: 'balanced',
              large: false,
              seconds: 2,
              cycles: 0,
              variant,
            }),
          )
        : process.argv.includes('--quick')
          ? [
              {
                count: 1,
                quality: 'balanced',
                large: false,
                seconds,
                cycles: 2,
              },
              {
                count: 4,
                quality: 'balanced',
                large: false,
                seconds,
                cycles: 3,
              },
            ]
          : [
              ...['low', 'balanced', 'high'].map((quality) => ({
                count: 1,
                quality,
                large: false,
                seconds,
                cycles: 0,
              })),
              ...[4, 8, 16].map((count) => ({
                count,
                quality: 'balanced',
                large: false,
                seconds,
                cycles: 0,
              })),
              { count: 4, quality: 'high', large: true, seconds, cycles: 0 },
              {
                count: 4,
                quality: 'high',
                large: false,
                seconds,
                cycles: 0,
                stress: true,
              },
              {
                count: 8,
                quality: 'balanced',
                large: false,
                seconds: soak,
                cycles: 10,
              },
            ];
  const selectedCounts = option('counts', '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const selectedModes = option('modes', '').split(',').filter(Boolean);
  assert.ok(selectedCounts.every((n) => [1, 4, 8, 16].includes(n)));
  assert.ok(
    selectedModes.every((mode) =>
      ['source', 'large', 'small', 'adaptive'].includes(mode),
    ),
  );
  const selected = cases.filter(
    (c) =>
      (!selectedCounts.length || selectedCounts.includes(c.count)) &&
      (!selectedModes.length ||
        selectedModes.includes(c.textureMode || 'source')),
  );
  assert.ok(selected.length > 0, 'No selected benchmark scenarios');
  for (const scenario of selected) {
    console.log('PERF_SCENE_START', JSON.stringify(scenario));
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await cdp.send('Runtime.getHeapUsage');
    const clock = await cdp.send('Performance.getMetrics');
    if (process.argv.includes('--profile')) await cdp.send('Profiler.start');
    const sceneDoc = structuredClone(doc);
    const variant = 'variant' in scenario ? scenario.variant : 'original';
    if (variant === 'transparent') {
      if (!sceneDoc.shader) throw Error('Fixture has no authored shader');
      sceneDoc.shader = {
        ...sceneDoc.shader,
        fragmentBody:
          'return vec4(color.rgb + vec3(.2,.05,.08), max(color.a,.2));',
        fragmentStrength: 1,
        fragmentMask: 'none',
        fragmentTarget: 'all',
      };
      sceneDoc.layers = sceneDoc.layers.map((l) => ({
        ...l,
        shaderTransparent: l.kind !== 'frame',
      }));
    }
    if (variant === 'replacement' || variant === 'frosted') {
      sceneDoc.layers.find((l) => l.kind === 'background')!.src =
        sceneDoc.layers.find((l) => l.id === 'head')!.src;
      sceneDoc.material = {
        enabled: true,
        style: variant === 'replacement' ? 'gold' : 'frosted',
        target: 'background',
        strength: 0.8,
        backgroundMode: variant === 'replacement' ? 'replace' : 'overlay',
      };
    }
    const processMemory: unknown[] = [];
    let lastWindowsGPU = -Infinity;
    const collectProcess = async () => {
      const values = await app.evaluate(({ app }) =>
        app.getAppMetrics().map((p) => ({
          pid: p.pid,
          type: p.type,
          memory: p.memory,
          cpu: p.cpu,
        })),
      );
      let windowsGPU: unknown;
      if (
        process.platform === 'win32' &&
        Date.now() - lastWindowsGPU >= 30000
      ) {
        lastWindowsGPU = Date.now();
        const pids = values
          .filter((p) => p.type === 'GPU' && Number.isSafeInteger(p.pid))
          .map((p) => p.pid);
        if (pids.length)
          try {
            const command =
              "$ErrorActionPreference='Stop'; $ids=@(" +
              pids.join(',') +
              "); Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Where-Object { $ids -contains [int](($_.Name -split '_')[1]) } | Select-Object Name,DedicatedUsage,SharedUsage,TotalCommitted | ConvertTo-Json -Compress";
            const response = await execute(
              'powershell.exe',
              ['-NoProfile', '-NonInteractive', '-Command', command],
              { windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024 },
            );
            windowsGPU = response.stdout.trim()
              ? JSON.parse(response.stdout)
              : [];
          } catch (error) {
            windowsGPU = {
              unavailable:
                error instanceof Error ? error.message : String(error),
            };
          }
      }
      processMemory.push({ at: Date.now(), values, windowsGPU });
    };
    await collectProcess();
    const processTimer = setInterval(() => {
      void collectProcess().catch(() => {});
    }, 10000);
    const traceTag = 'cardscape-scene-' + scenarios.length;
    let traceFile = '';
    if (presentationTrace)
      await app.evaluate(({ contentTracing }) =>
        contentTracing.startRecording({
          included_categories: [
            'benchmark',
            'cc',
            'viz',
            'blink.user_timing',
            'disabled-by-default-display.framedisplayed',
          ],
          recording_mode: 'record-until-full',
          trace_buffer_size_in_kb: 65536,
        }),
      );
    let measured: Awaited<ReturnType<typeof measureScene>>;
    try {
      measured = await page.evaluate(measureScene, {
        action,
        traceTag: presentationTrace ? traceTag : undefined,
        gpuDrawProfile: process.argv.includes('--gpu-draw-profile'),
        doc: sceneDoc,
        textAssets,
        textureAssets,
        ...scenario,
      });
    } finally {
      clearInterval(processTimer);
      if (presentationTrace)
        traceFile = await app.evaluate(
          ({ contentTracing }, file) => contentTracing.stopRecording(file),
          join(output, `scene-${scenarios.length}.trace.json`),
        );
    }
    if (traceFile) {
      const windowCount = await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      );
      const presentation = analyzePresentationTrace(
        JSON.parse(await readFile(traceFile, 'utf8')),
        traceTag,
        windowCount,
      );
      Object.assign(measured, {
        presentationTrace: {
          file: traceFile,
          tag: traceTag,
          windowCount,
          ...presentation,
        },
      });
      await writeFile(
        join(output, `scene-${scenarios.length}.presentation.json`),
        JSON.stringify(presentation, null, 2),
      );
    }
    await collectProcess();
    assert.ok(
      !measured.backgrounded && !measured.cancelled,
      'A backgrounded/cancelled scene is not a completed measurement',
    );
    if (process.argv.includes('--profile')) {
      const profile = await cdp.send('Profiler.stop');
      await writeFile(
        join(output, `scene-${scenarios.length}.cpuprofile`),
        JSON.stringify({
          ...profile.profile,
          navigationStart: clock.metrics.find(
            (m) => m.name === 'NavigationStart',
          )?.value,
          steadyWindow: measured.steadyWindow,
        }),
      );
    }
    const png = measured.canvasPNG;
    delete (measured as Partial<typeof measured>).canvasPNG;
    await writeFile(
      join(
        output,
        `cards-${scenarios.length}-${scenario.count}-${scenario.quality}.png`,
      ),
      Buffer.from(png.split(',')[1], 'base64'),
    );
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await cdp.send('Runtime.getHeapUsage');
    const compare = option('compare', '');
    if (compare) {
      const reference = await readFile(
        join(
          dirname(resolve(compare)),
          `cards-${scenarios.length}-${scenario.count}-${scenario.quality}.png`,
        ),
      );
      const pixels = await page.evaluate(
        async ({ before, after }) => {
          const load = async (src: string) => {
            const im = new Image();
            im.src = src;
            await im.decode();
            const c = document.createElement('canvas');
            c.width = im.naturalWidth;
            c.height = im.naturalHeight;
            c.getContext('2d')!.drawImage(im, 0, 0);
            return c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
              .data;
          };
          const a = await load(before),
            b = await load(after);
          if (a.length !== b.length) throw Error('Parity dimensions differ');
          let max = 0,
            changed = 0;
          for (let i = 0; i < a.length; i++) {
            const d = Math.abs(a[i] - b[i]);
            max = Math.max(max, d);
            if (d) changed++;
          }
          return {
            maxChannelDifference: max,
            changedChannels: changed,
            channels: a.length,
          };
        },
        {
          before: 'data:image/png;base64,' + reference.toString('base64'),
          after: png,
        },
      );
      result['parity-' + String(variant)] = pixels;
      Object.assign(measured, { pixelParity: pixels });
      assert.ok(
        pixels.maxChannelDifference <= 2,
        'actual shader pixels must preserve ' +
          variant +
          ': ' +
          JSON.stringify(pixels),
      );
    }
    scenarios.push({ ...measured, processMemory, heap: { before, after } });
    result.scenarios = scenarios;
    result.runtimeSha256 = hashes;
    result.lastHeap = { before, after };
    await writeFile(
      join(output, 'result.json'),
      JSON.stringify(result, null, 2),
    );
    console.log(
      'PERF_SCENE_PASSED',
      JSON.stringify({
        count: scenario.count,
        quality: scenario.quality,
        textureMode: measured.textureMode,
        initialTier: measured.initialTier,
        submittedFps: measured.submittedFps,
        submitP95: measured.submitMs.p95,
        textureMiB: measured.steady.textureBytes / 1048576,
        released: measured.final,
      }),
    );
  }
  if (adaptive) {
    for (const count of new Set(scenarios.map((scene) => scene.count))) {
      const group = scenarios.filter((scene) => scene.count === count);
      const large = group.find((scene) => scene.textureMode === 'large');
      const small = group.find((scene) => scene.textureMode === 'small');
      if (large && small) {
        assert.equal(
          small.particles,
          large.particles,
          'forced small images must keep the same particle budget as large',
        );
        assert.equal(
          small.triangles,
          large.triangles,
          'image-only tier changes must preserve the same geometry',
        );
      }
      for (const scene of group.filter(
        (scene) => scene.textureMode === 'adaptive',
      )) {
        if (!manifest.exportProfile?.settings.smallParticles) {
          if (scene.initialTier === 'small')
            assert.equal(
              scene.particles,
              0,
              'automatic small policy disables particles',
            );
          for (const sample of scene.transitions)
            if (sample.tier === 'small')
              assert.equal(
                sample.particles,
                0,
                'particle LOD follows actual loaded tier',
              );
        }
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(root, 'qa/card-performance/last-run.json'),
    JSON.stringify(result, null, 2),
  );
  console.log('CARD_PERFORMANCE_PASSED', output);
  succeeded = true;
} finally {
  await progressWrite;
  await writeFile(
    join(output, 'progress.json'),
    JSON.stringify(
      { status: succeeded ? 'passed' : 'failed', at: new Date().toISOString() },
      null,
      2,
    ),
  ).catch((error) =>
    process.stderr.write('Progress persistence: ' + String(error) + '\n'),
  );
  const shutdown = setTimeout(() => app.process().kill(), 10000);
  shutdown.unref();
  await app
    .evaluate(({ app }) => setImmediate(() => app.exit()))
    .catch(() => {});
  await app.close().catch(() => {});
  clearTimeout(shutdown);
  await new Promise<void>((done) => server.close(() => done()));
}
