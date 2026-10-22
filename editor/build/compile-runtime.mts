import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { transform } from 'esbuild';
import { classicRenderer } from './classic-renderer.mts';

/** Shared by clean builds and Electron/worker development watchers. */
export async function compileRuntimeFile(
  root: string,
  directory: 'electron' | 'renderer',
  name: string,
): Promise<void> {
  if (
    [
      'editor-entry.ts',
      'shader-editor-source.ts',
      'shader-nodes-source.ts',
      'shader-loader.ts',
    ].includes(basename(name))
  )
    return;
  const original = await readFile(resolve(root, directory, name), 'utf8');
  const source =
    directory === 'electron'
      ? original.replace(
          /(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,
          (match, prefix: string, target: string, suffix: string) =>
            /\.[a-z]+$/i.test(target)
              ? match
              : prefix + target + '.cjs' + suffix,
        )
      : original;
  const extension =
    directory === 'electron'
      ? name === 'material-maker-compiler.ts'
        ? '.mjs'
        : '.cjs'
      : '.js';
  // Portable players and existing worker imports retain their flat file contract.
  const target =
    directory === 'renderer' && !name.replaceAll('\\', '/').startsWith('core/')
      ? basename(name)
      : name;
  const output = resolve(
    root,
    'dist',
    directory,
    target.replace(/\.ts$/, extension),
  );
  await mkdir(dirname(output), { recursive: true });
  const classic =
    directory === 'renderer'
      ? await classicRenderer(root, name, source)
      : undefined;
  const compiled = classic
    ? { code: classic }
    : /^(?:import(?!\s+type)|export)\s/m.test(source)
      ? await transform(source, {
          loader: 'ts',
          format:
            directory === 'electron'
              ? extension === '.mjs'
                ? 'esm'
                : 'cjs'
              : undefined,
          target: directory === 'electron' ? 'node22' : 'chrome120',
          sourcefile: name,
        })
      : { code: stripTypeScriptTypes(source, { mode: 'strip' }) };
  await writeFile(
    output,
    '// Generated from TypeScript. Edit the .ts source.\n' + compiled.code,
  );
}
