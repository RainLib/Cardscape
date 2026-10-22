import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** HTML owns IDs/tags; regenerate this contract when the editor document changes. */
export async function generateEditorElements(root: string): Promise<void> {
  const html = await readFile(resolve(root, 'renderer/index.html'), 'utf8');
  const elements = new Map<string, string>();
  for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"/g))
    elements.set(match[2], match[1]);
  const source =
    '// Generated from renderer/index.html by build/editor-elements.mts.\nexport interface EditorElements {\n' +
    [...elements]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([id, tag]) =>
          ` ${JSON.stringify(id)}: HTMLElementTagNameMap[${JSON.stringify(tag)}];`,
      )
      .join('\n') +
    '\n}\n';
  const target = resolve(root, 'types/editor-elements.d.ts');
  if ((await readFile(target, 'utf8').catch(() => '')) !== source)
    await writeFile(target, source);
}
