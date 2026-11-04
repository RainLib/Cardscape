import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { CardContour } from '../shared/render-models';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = process.argv.includes('--materials')
  ? 'contour-materials'
  : process.argv.includes('--complex')
    ? 'complex-contour'
    : 'contour-authoring';
const run = JSON.parse(
  await readFile(join(root, 'qa/' + qa + '/last-run.json'), 'utf8'),
) as {
  output: string;
  godot: string;
  contour: CardContour;
  materialVerification?: unknown;
};
await copyFile(
  join(root, '../sdk/godot/tests/contour_materials.gd'),
  join(run.godot, 'tests/contour_materials.gd'),
);
if (run.materialVerification) {
  await writeFile(
    join(run.godot, 'tests/contour-material-reference.json'),
    JSON.stringify(run.materialVerification),
  );
}
const require = createRequire(import.meta.url),
  Frame = require('../dist/renderer/frame-model.js');
const field = Frame.distanceField({ ...Frame.defaults, contour: run.contour });
const fieldProbes = field
  ? Array.from({ length: 32 }, (_, i) => {
      const x = (i * 197) % field.width,
        y = (i * 419) % field.height;
      return {
        x,
        y,
        rgba: Array.from(
          field.data.slice(
            (y * field.width + x) * 4,
            (y * field.width + x) * 4 + 4,
          ),
        ),
      };
    })
  : [];
await writeFile(
  join(run.godot, 'tests/contour-field-probes.json'),
  JSON.stringify(fieldProbes),
);
if (run.materialVerification && field) {
  const Model = require('../dist/renderer/contour-field-model.js'),
    encode =
      require('../dist/electron/contour-field-export.cjs').encodeContourFieldPNG;
  const data = new Uint8Array(1024 * 1536 * 4);
  for (let y = 0; y < 1536; y++)
    for (let x = 0; x < 1024; x++) {
      const d = Model.decode(field, x, y).map((v: number) =>
          Math.round(((Math.max(-64, Math.min(64, v)) + 64) / 128) * 4095),
        ),
        k = (y * 1024 + x) * 4;
      data[k] = d[0] >> 4;
      data[k + 1] = (d[0] & 15) * 16 + (d[1] >> 8);
      data[k + 2] = d[1] & 255;
      data[k + 3] = 255;
    }
  await writeFile(
    join(run.godot, 'tests/contour-legacy-field.png'),
    encode({ width: 1024, height: 1536, data }),
  );
}
const binary = process.env.GODOT_BIN;
if (!binary) throw Error('Set GODOT_BIN to verify the curved export');
await copyFile(
  join(root, '../sdk/godot/tests/test_contour_authoring.gd'),
  join(run.godot, 'tests/test_contour_authoring.gd'),
);
const imported = spawnSync(
  binary,
  ['--headless', '--editor', '--path', run.godot, '--import'],
  { windowsHide: true, timeout: 60000, encoding: 'utf8' },
);
await writeFile(
  join(run.output, 'godot-import.log'),
  imported.stdout + imported.stderr,
);
assert.equal(imported.status, 0, imported.stdout + imported.stderr);
const checked = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_contour_authoring.gd',
    '--captures',
    join(run.output, 'godot-frames'),
    '--output',
    join(run.output, 'godot.log'),
    '--timeout',
    '180000',
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(checked.stdout + checked.stderr);
assert.equal(checked.status, 0);
const line = checked.stdout
  .split('\n')
  .find(
    (line) => line.includes('"pixel_probes"') && line.trim().startsWith('{'),
  );
assert.ok(line, 'Godot must report actual contour pixel probes');
const result = JSON.parse(
  await readFile(join(run.output, 'result.json'), 'utf8'),
);
result.godotVerification = {
  ...JSON.parse(line),
  shaderErrors: 0,
  fieldByteChecks: fieldProbes.length * 4,
};
await writeFile(
  join(run.output, 'result.json'),
  JSON.stringify(result, null, 2),
);
await writeFile(
  join(root, 'qa/' + qa + '/last-run.json'),
  JSON.stringify(result, null, 2),
);
