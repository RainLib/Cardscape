'use strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './paths';
const name = 'card-atelier',
  files = [
    'SKILL.md',
    'references/questions.md',
    'references/production.md',
    'references/spatial-depth.md',
    'references/anatomical-depth.md',
    'agents/openai.yaml',
  ];
export async function materialize(directory: string) {
  const source = path.resolve(ROOT, 'skills', name),
    relative = path.join('.agents', 'skills', name),
    hash = createHash('sha256');
  for (const file of files) {
    const content = await fs.readFile(path.join(source, file));
    hash.update(file).update(content);
    const target = path.join(directory, relative, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return {
    name,
    entry: path.join(relative, 'SKILL.md'),
    sha256: hash.digest('hex'),
  };
}
