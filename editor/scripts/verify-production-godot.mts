import { createRequire } from 'node:module';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = JSON.parse(
  await readFile(
    join(root, 'qa/production-readiness/arcane-sentinel/last-run.json'),
    'utf8',
  ),
) as { output: string; godot: string };
const binary = process.env.GODOT_BIN;
if (!binary)
  throw Error(
    'Set GODOT_BIN to the Godot executable to verify the real export',
  );
await mkdir(join(run.godot, 'tests'), { recursive: true });
await copyFile(
  join(root, '../sdk/godot/tests/test_production_card.gd'),
  join(run.godot, 'tests/test_production_card.gd'),
);
await copyFile(
  join(run.output, 'webgl-reference.json'),
  join(run.godot, 'tests/production-reference.json'),
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
const verified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_production_card.gd',
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
process.stdout.write(verified.stdout + verified.stderr);
assert.equal(verified.status, 0);
await copyFile(
  join(root, '../sdk/godot/tests/test_world_particles.gd'),
  join(run.godot, 'tests/test_world_particles.gd'),
);
const worldVerified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_world_particles.gd',
    '--timeout',
    '180000',
    '--captures',
    join(run.output, 'world-game-frames'),
    '--output',
    join(run.output, 'world-game.log'),
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(worldVerified.stdout + worldVerified.stderr);
assert.equal(worldVerified.status, 0);
const worldSummary = worldVerified.stdout
  .split('\n')
  .find((line) => line.trim().startsWith('{') && line.includes('"groups"'));
assert.ok(worldSummary);
await copyFile(
  join(root, '../sdk/godot/tests/test_particle_physics.gd'),
  join(run.godot, 'tests/test_particle_physics.gd'),
);
const physicsVerified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_particle_physics.gd',
    '--timeout',
    '180000',
    '--captures',
    join(run.output, 'physics-frames'),
    '--output',
    join(run.output, 'physics.log'),
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(physicsVerified.stdout + physicsVerified.stderr);
assert.equal(physicsVerified.status, 0);
const physicsSummary = physicsVerified.stdout
  .split('\n')
  .find((line) => line.trim().startsWith('{') && line.includes('"planes"'));
assert.ok(physicsSummary);
const audioModel = createRequire(import.meta.url)(
  '../dist/renderer/action-audio-model.js',
) as typeof import('../renderer/animation/action-audio-model.ts').default;
const audioExport = JSON.parse(
  await readFile(join(run.output, 'result.json'), 'utf8'),
) as { directory: string };
const audioActions = JSON.parse(
  await readFile(join(audioExport.directory, 'actions.json'), 'utf8'),
) as import('../shared/character').CharacterAction[];
const audioReference = audioActions.flatMap((action) =>
  [0, 0.1, 0.4, 0.5, 0.8, 1.1, 1.5, 2, 2.4, 3.9, 4, 4.8].map((seconds) => ({
    action,
    seconds,
    cues: audioModel
      .cues(action, seconds)
      .map(({ key, age, remaining, offset }) => ({
        key,
        age,
        remaining,
        offset,
      })),
  })),
);
await writeFile(
  join(run.godot, 'tests/audio-reference.json'),
  JSON.stringify(audioReference),
);
await copyFile(
  join(root, '../sdk/godot/tests/test_action_audio.gd'),
  join(run.godot, 'tests/test_action_audio.gd'),
);
const audioVerified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_action_audio.gd',
    '--timeout',
    '180000',
    '--output',
    join(run.output, 'audio.log'),
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(audioVerified.stdout + audioVerified.stderr);
assert.equal(audioVerified.status, 0);
const audioSummary = audioVerified.stdout
  .split('\n')
  .find(
    (line) => line.trim().startsWith('{') && line.includes('\"audioSamples\"'),
  );
assert.ok(audioSummary);
await copyFile(
  join(root, '../sdk/godot/tests/test_source_alpha_bounds.gd'),
  join(run.godot, 'tests/test_source_alpha_bounds.gd'),
);
const sourceBoundsVerified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_source_alpha_bounds.gd',
    '--timeout',
    '180000',
    '--captures',
    join(run.output, 'source-bounds-frames'),
    '--output',
    join(run.output, 'source-bounds.log'),
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(sourceBoundsVerified.stdout + sourceBoundsVerified.stderr);
assert.equal(sourceBoundsVerified.status, 0);
const sourceBoundsSummary = sourceBoundsVerified.stdout
  .split('\n')
  .find((line) => line.trim().startsWith('{') && line.includes('"pixelCases"'));
assert.ok(sourceBoundsSummary);
await copyFile(
  join(root, '../sdk/godot/tests/test_aperture_evaluation.gd'),
  join(run.godot, 'tests/test_aperture_evaluation.gd'),
);
const apertureVerified = spawnSync(
  process.execPath,
  [
    join(root, 'scripts/test-godot.cjs'),
    '--project',
    run.godot,
    '--script',
    'tests/test_aperture_evaluation.gd',
    '--timeout',
    '180000',
    '--captures',
    join(run.output, 'aperture-frames'),
    '--output',
    join(run.output, 'aperture.log'),
  ],
  {
    windowsHide: true,
    timeout: 190000,
    encoding: 'utf8',
    env: { ...process.env, GODOT_BIN: binary },
  },
);
process.stdout.write(apertureVerified.stdout + apertureVerified.stderr);
assert.equal(apertureVerified.status, 0);
const apertureSummary = apertureVerified.stdout
  .split('\n')
  .find(
    (line) =>
      line.trim().startsWith('{') && line.includes('"aperturePixelCases"'),
  );
assert.ok(apertureSummary);
const result = JSON.parse(
  await readFile(join(run.output, 'result.json'), 'utf8'),
);
result.godotActionAudio = JSON.parse(audioSummary) as Record<string, unknown>;
result.godotApertureEvaluation = JSON.parse(apertureSummary) as Record<
  string,
  unknown
>;
result.godotSourceAlphaBounds = JSON.parse(sourceBoundsSummary) as Record<
  string,
  unknown
>;
result.godotWorldParticles = JSON.parse(worldSummary) as Record<
  string,
  unknown
>;
result.godotParticlePhysics = JSON.parse(physicsSummary) as Record<
  string,
  unknown
>;
result.godotAcceptance =
  'GPU geometry, particles, world roots, connected ribbon triangles/UV/alpha, emission cutoff, transitions, pause, reverse seeks and bounded sixteen-group reuse passed; capture count recorded in the native log; visual inspection tracked separately';
await writeFile(
  join(run.output, 'result.json'),
  JSON.stringify(result, null, 2),
);
