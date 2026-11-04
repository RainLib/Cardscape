import {
  readFile,
  writeFile,
  copyFile,
  cp,
  mkdir,
  readdir,
} from 'node:fs/promises';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const fixture = JSON.parse(
  await readFile(
    join(root, 'qa/production-readiness/arcane-sentinel/last-run.json'),
    'utf8',
  ),
) as { godot: string };
const binary = process.env.GODOT_BIN;
if (!binary) throw Error('Set GODOT_BIN');
const output = join(root, 'qa/godot-startup', 'run-' + Date.now());
await mkdir(output, { recursive: true });
const specializer = require('../dist/renderer/shader-variants.js') as {
  frameFragment(source: string, finish: number): string;
};
const results: Array<Record<string, unknown>> = [];
const nonce = String((Date.now() % 1000000) / 1000);
const cacheScope =
  'Fresh project .godot and identical novel probe hook. Shipping exporter variants and SDK selection; baseline removes only variant registrations after loading the same resources. Driver and OS caches uncontrolled. One local pair, not a fleet/cold-cache guarantee.';
const save = async (extra: Record<string, unknown> = {}) =>
  writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      { output, fixture: fixture.godot, nonce, cacheScope, results, ...extra },
      null,
      2,
    ),
  );
for (const variant of ['original', 'specialized']) {
  const project = join(output, variant);
  await cp(fixture.godot, project, {
    recursive: true,
    filter: (src) => basename(src) !== '.godot',
  });
  await copyFile(
    join(root, '../sdk/godot/tests/test_startup.gd'),
    join(project, 'tests/test_startup.gd'),
  );
  const directory = join(project, 'shaders');
  const names = (await readdir(directory)).filter((name) =>
    name.endsWith('.gdshader'),
  );
  assert.ok(
    names.some((name) => /-finish-1\.gdshader$/.test(name)),
    'Run a fresh production-card export with native finish variants first',
  );
  const sizes: Array<{ file: string; before: number; after: number }> = [];
  const probe = (source: string) => {
    const replaced = source.replace(
      /(vec4 surfaceEffect\([^)]*\)\s*)\{[\s\S]*?\n\}/,
      '$1{\nreturn color*(.98+.02*cos(time*.173+' + nonce + '));\n}',
    );
    assert.notEqual(
      replaced,
      source,
      'known fixture receives an identical novel hook',
    );
    return replaced;
  };
  for (const name of names.filter(
    (name) => !/-finish-\d+\.gdshader$/.test(name),
  )) {
    const raw = await readFile(join(directory, name), 'utf8');
    const source = probe(raw);
    sizes.push({ file: name, before: raw.length, after: source.length });
    await writeFile(join(directory, name), source);
    for (const specialized of names.filter((file) =>
      file.startsWith(name.slice(0, -9) + '-finish-'),
    )) {
      const finish = Number(specialized.match(/-finish-(\d+)\.gdshader$/)?.[1]);
      assert.ok(Number.isInteger(finish));
      const existing = await readFile(join(directory, specialized), 'utf8');
      assert.equal(
        existing,
        specializer.frameFragment(raw, finish),
        'actual exporter variant matches the shared specializer',
      );
      const code = specializer.frameFragment(source, finish);
      sizes.push({
        file: specialized,
        before: existing.length,
        after: code.length,
      });
      await writeFile(join(directory, specialized), code);
    }
  }
  const imported: SpawnSyncReturns<string> = spawnSync(
    binary,
    ['--headless', '--editor', '--path', project, '--import'],
    { windowsHide: true, encoding: 'utf8', timeout: 90000 },
  );
  await writeFile(
    join(output, variant + '-import.log'),
    imported.stdout + imported.stderr,
  );
  assert.equal(imported.status, 0, imported.stdout + imported.stderr);
  const checked: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [
      join(root, 'scripts/test-godot.cjs'),
      '--project',
      project,
      '--script',
      'tests/test_startup.gd',
      '--timeout',
      '180000',
      '--captures',
      join(output, variant + '-frames'),
      '--output',
      join(output, variant + '.log'),
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 190000,
      env: {
        ...process.env,
        GODOT_BIN: binary,
        CARDSCAPE_PROBE_HOOK: '1',
        CARDSCAPE_GENERIC_ONLY: variant === 'original' ? '1' : '0',
      },
    },
  );
  process.stdout.write(checked.stdout + checked.stderr);
  assert.equal(checked.status, 0);
  const line = checked.stdout
    .split('\n')
    .find((line) => line.startsWith('{') && line.includes('library_ms'));
  assert.ok(line);
  const processLine = checked.stdout
    .split('\n')
    .find((line) => line.startsWith('{') && line.includes('elapsedMs'));
  assert.ok(processLine);
  const processResult = JSON.parse(processLine) as { elapsedMs: number };
  results.push({
    variant,
    sizes,
    processElapsedMs: processResult.elapsedMs,
    ...(JSON.parse(line) as Record<string, unknown>),
  });
  await save();
}

// Compare actual GPU captures after both measurements, outside their timers.
const browser = await chromium.launch({ headless: true });
let comparison: {
  width: number;
  height: number;
  maxChannelDifference: number;
  differentPixels: number;
};
try {
  const page = await browser.newPage();
  const images = await Promise.all(
    ['original', 'specialized'].map(
      async (variant) =>
        'data:image/png;base64,' +
        (
          await readFile(join(output, variant + '-frames/startup.png'))
        ).toString('base64'),
    ),
  );
  comparison = await page.evaluate(async (images) => {
    const decode = async (src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw Error('2D canvas unavailable');
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        data: context.getImageData(0, 0, image.width, image.height).data,
      };
    };
    const [before, after] = await Promise.all(images.map(decode));
    if (before.width !== after.width || before.height !== after.height)
      throw Error('Capture dimensions differ');
    let maxChannelDifference = 0,
      differentPixels = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      let difference = 0;
      for (let channel = 0; channel < 4; channel++)
        difference = Math.max(
          difference,
          Math.abs(before.data[i + channel] - after.data[i + channel]),
        );
      maxChannelDifference = Math.max(maxChannelDifference, difference);
      if (difference) differentPixels++;
    }
    return {
      width: before.width,
      height: before.height,
      maxChannelDifference,
      differentPixels,
    };
  }, images);
} finally {
  await browser.close();
}
await save({ comparison });
assert.equal(
  comparison.maxChannelDifference,
  0,
  'specialization preserves actual rendered output exactly',
);
await writeFile(
  join(root, 'qa/godot-startup/last-run.json'),
  JSON.stringify({ output, result: join(output, 'result.json') }, null, 2),
);
console.log('GODOT_STARTUP_PROFILE_PASSED', output);
