import { readdir, mkdir, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { compileRuntimeFile } from './compile-runtime.mts';
import { generateEditorElements } from './editor-elements.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sources(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(resolve(root, directory, prefix), {
    withFileTypes: true,
  });
  const result: string[] = [];
  for (const entry of entries) {
    const name = prefix + entry.name;
    if (entry.isDirectory())
      result.push(...(await sources(directory, name + '/')));
    else if (
      name.endsWith('.ts') &&
      !name.endsWith('.d.ts') &&
      name !== 'editor-entry.ts'
    )
      result.push(name);
  }
  return result;
}

/** Compatibility files are also consumed by classic Web Workers and exported players. */
export async function buildRuntime(): Promise<void> {
  await generateEditorElements(root);
  const outputRoot = resolve(root, 'dist');
  if (dirname(outputRoot) !== root)
    throw Error('Build output must be inside the editor workspace');
  await rm(outputRoot, { recursive: true, force: true });
  for (const directory of ['electron', 'renderer'] as const) {
    await mkdir(resolve(root, 'dist', directory), { recursive: true });
    const files = await sources(directory);
    await Promise.all(
      files.map((name) => compileRuntimeFile(root, directory, name)),
    );
  }
  await cp(resolve(root, 'renderer'), resolve(root, 'dist/renderer'), {
    recursive: true,
    filter: (source) => !/\.(?:ts|mjs)$/.test(source),
  });
  await cp(
    resolve(root, 'electron/material-maker-controller.gd'),
    resolve(root, 'dist/electron/material-maker-controller.gd'),
  );
  await Promise.all(
    ['shader-editor', 'shader-nodes'].map((name) =>
      build({
        entryPoints: [resolve(root, 'renderer/shaders', name + '-source.ts')],
        outfile: resolve(root, 'dist/renderer', name + '.bundle.js'),
        bundle: true,
        minify: true,
        format: 'iife',
        target: 'chrome120',
        legalComments: 'eof',
      }),
    ),
  );
}

await buildRuntime();
