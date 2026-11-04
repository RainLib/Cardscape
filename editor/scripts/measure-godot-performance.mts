import {
  readFile,
  writeFile,
  mkdir,
  cp,
  copyFile,
  readdir,
} from 'node:fs/promises';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name: string, fallback: string) =>
  process.argv
    .find((arg) => arg.startsWith('--' + name + '='))
    ?.slice(name.length + 3) || fallback;
const binary = process.env.GODOT_BIN;
if (!binary) throw Error('Set GODOT_BIN to the installed Godot executable');
const seconds = Number(option('seconds', '8')),
  soak = Number(option('soak', '600'));
const sdk = option('sdk', 'current');
const action = option('action', 'alternating');
assert.match(action, /^[a-zA-Z0-9_-]{1,80}$/);
assert.ok(['current', 'fixture'].includes(sdk));
assert.ok(Number.isFinite(seconds) && seconds >= 2 && seconds <= 60);
assert.ok(Number.isFinite(soak) && soak >= 2 && soak <= 900);
const fixture = JSON.parse(
  await readFile(
    resolve(
      root,
      option(
        'fixture',
        'qa/production-readiness/arcane-sentinel/last-run.json',
      ),
    ),
    'utf8',
  ),
) as { godot: string };
const output = join(root, 'qa/godot-performance', 'run-' + Date.now());
const project = join(output, 'project');
await mkdir(output, { recursive: true });
console.log('GODOT_PERF_OUTPUT', output);
await cp(fixture.godot, project, {
  recursive: true,
  filter: (source) => basename(source) !== '.godot',
});
if (sdk === 'current') {
  assert.equal(
    await readFile(
      join(fixture.godot, 'addons/cardscape/card_surface.gdshader'),
      'utf8',
    ),
    await readFile(
      join(root, '../sdk/godot/addons/cardscape/card_surface.gdshader'),
      'utf8',
    ),
    'Changed shader template requires a fresh real export',
  );
  await cp(join(root, '../sdk/godot/addons'), join(project, 'addons'), {
    recursive: true,
  });
}
await copyFile(
  join(root, '../sdk/godot/tests/test_performance.gd'),
  join(project, 'tests/test_performance.gd'),
);
const profiling = process.argv.includes('--profile');
if (profiling) {
  const file = join(project, 'addons/cardscape/cardscape_card.gd');
  let code = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  const inject = (marker: string, replacement: string) => {
    assert.equal(
      code.split(marker).length,
      2,
      'Unique native profiling marker: ' + marker,
    );
    code = code.replace(marker, replacement);
  };
  inject(
    'func _update(_delta: float) -> void:\n',
    'func _update(_delta: float) -> void:\n\tvar __bench_begin:=Time.get_ticks_usec()\n',
  );
  inject(
    '\t_update_detail()\n',
    '\tvar __bench_detail:=Time.get_ticks_usec()\n\t_update_detail()\n\tvar __bench_pose:=Time.get_ticks_usec()\n',
  );
  inject(
    '\tvar skin_pose_key :=',
    '\tvar __bench_skin:=Time.get_ticks_usec()\n\tvar skin_pose_key :=',
  );
  inject(
    '\tvar camera := get_viewport().get_camera_3d()\n\tvar eye :=',
    '\tvar __bench_uniform:=Time.get_ticks_usec()\n\tvar camera := get_viewport().get_camera_3d()\n\tvar eye :=',
  );
  inject(
    '\tvar event_action: Dictionary =',
    '\tvar __bench_particles:=Time.get_ticks_usec()\n\tvar event_action: Dictionary =',
  );
  inject(
    '\t\tavailable_particles = maxi(0,available_particles-child._particle_count-child._particle_event_count)\n',
    '\t\tavailable_particles = maxi(0,available_particles-child._particle_count-child._particle_event_count)\n\tset_meta("benchmark_update_us",{"root":__bench_detail-__bench_begin,"detail":__bench_pose-__bench_detail,"pose_order":__bench_skin-__bench_pose,"deform_upload":__bench_uniform-__bench_skin,"uniforms":__bench_particles-__bench_uniform,"particles_components":Time.get_ticks_usec()-__bench_particles})\n',
  );
  await writeFile(file, code);
}
const sourceHashes: Record<string, string> = {};
for (const name of await readdir(join(project, 'addons/cardscape')))
  if (/\.(gd|gdshader)$/.test(name))
    sourceHashes[name] = createHash('sha256')
      .update(await readFile(join(project, 'addons/cardscape', name)))
      .digest('hex');
const testSource = await readFile(join(project, 'tests/test_performance.gd'));
sourceHashes['tests/test_performance.gd'] = createHash('sha256')
  .update(testSource)
  .digest('hex');
await writeFile(
  join(output, 'measure-godot-performance.mts'),
  await readFile(fileURLToPath(import.meta.url)),
);
const imported: SpawnSyncReturns<string> = spawnSync(
  binary,
  ['--headless', '--editor', '--path', project, '--import'],
  { windowsHide: true, encoding: 'utf8', timeout: 90000 },
);
await writeFile(join(output, 'import.log'), imported.stdout + imported.stderr);
assert.equal(imported.status, 0, imported.stdout + imported.stderr);
interface Case {
  count: number;
  mode: 'large' | 'small' | 'adaptive';
  seconds: number;
  swaps: number;
  cycles: number;
  action: string;
}
interface NativeResult extends Record<string, unknown> {
  status: string;
  failures: string[];
  count: number;
  mode: string;
  frames: number;
  process_frame_fps: number;
}
const results: NativeResult[] = [];
const counts = option(
  'counts',
  process.argv.includes('--quick') ? '1,4' : '1,4,8,16',
)
  .split(',')
  .map(Number);
const modes = option('modes', 'large,small,adaptive').split(
  ',',
) as Case['mode'][];
const swaps = Number(option('swaps', '2')),
  cycles = Number(option('cycles', '2'));
assert.ok(
  counts.length &&
    counts.every(
      (count) => Number.isInteger(count) && count >= 1 && count <= 32,
    ),
);
assert.ok(
  modes.length &&
    modes.every((mode) => ['large', 'small', 'adaptive'].includes(mode)),
);
assert.ok(
  [swaps, cycles].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 10,
  ),
);
const cases: Case[] = process.argv.includes('--soak-only')
  ? [
      {
        count: 8,
        mode: 'adaptive',
        seconds: soak,
        swaps: 10,
        cycles: 10,
        action,
      },
    ]
  : counts.flatMap((count) =>
      modes.map((mode) => ({
        count,
        mode,
        seconds,
        action,
        swaps: mode === 'adaptive' ? swaps : 0,
        cycles: mode === 'adaptive' ? cycles : 0,
      })),
    );
for (const [index, scenario] of cases.entries()) {
  const configFile = join(project, 'tests/performance-config.json');
  const resultFile = join(
    output,
    `case-${index}-${scenario.count}-${scenario.mode}.json`,
  );
  await writeFile(configFile, JSON.stringify({ ...scenario, fps: 30 }));
  const timeout = Math.ceil((scenario.seconds + 180) * 1000);
  console.log('GODOT_PERF_CASE_START', JSON.stringify(scenario));
  const checked: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [
      join(root, 'scripts/test-godot.cjs'),
      '--project',
      project,
      '--script',
      'tests/test_performance.gd',
      '--timeout',
      String(timeout),
      '--captures',
      join(output, `case-${index}-frames`),
      '--output',
      join(output, `case-${index}.log`),
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      timeout: timeout + 15000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        GODOT_BIN: binary,
        CARDSCAPE_BENCHMARK_CONFIG: configFile,
        CARDSCAPE_BENCHMARK_OUTPUT: resultFile,
        CARDSCAPE_BENCHMARK_PROGRESS: join(output, 'progress.json'),
      },
    },
  );
  process.stdout.write(checked.stdout + checked.stderr);
  assert.equal(checked.status, 0);
  const result = JSON.parse(await readFile(resultFile, 'utf8')) as NativeResult;
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.failures, []);
  results.push(result);
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        output,
        project,
        fixture: fixture.godot,
        sdk,
        profiling,
        sourceHashes,
        results,
      },
      null,
      2,
    ),
  );
}
await writeFile(
  join(root, 'qa/godot-performance/last-run.json'),
  JSON.stringify(
    { output, project, result: join(output, 'result.json') },
    null,
    2,
  ),
);
console.log('GODOT_CARD_PERFORMANCE_PASSED', output);
