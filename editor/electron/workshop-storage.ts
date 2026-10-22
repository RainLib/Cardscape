import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { workshopCodec as model } from './workshop-codec';
import { isRecord } from './validation';
import type { DocumentValidator, LoadedProject } from '../shared/projects';
export const MAX_BYTES = 192 * 1024 * 1024;
export function pack(workshop: unknown) {
  const blobs: Record<string, string> = {};
  function walk(value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('data:')) {
      const id = createHash('sha256').update(value).digest('hex');
      blobs[id] = value;
      return { $blob: id };
    }
    if (Array.isArray(value)) return value.map(walk);
    if (isRecord(value))
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, walk(item)]),
      );
    return value;
  }
  return {
    schema: 'card-workshop-file/1' as const,
    project: walk(workshop),
    blobs,
  };
}
export function unpack(value: unknown): unknown {
  if (isRecord(value) && value.schema === 'card-workshop/1')
    return model.migrate(value);
  if (
    !isRecord(value) ||
    value.schema !== 'card-workshop-file/1' ||
    !value.project ||
    !isRecord(value.blobs)
  )
    throw Error('工坊文件格式无效');
  const blobs: Record<string, string> = {};
  for (const [id, source] of Object.entries(value.blobs)) {
    if (
      typeof source !== 'string' ||
      !source.startsWith('data:') ||
      createHash('sha256').update(source).digest('hex') !== id
    )
      throw Error('工坊素材摘要不匹配');
    blobs[id] = source;
  }
  let nodes = 0;
  function walk(item: unknown, depth = 0): unknown {
    if (++nodes > 1000000 || depth > 40) throw Error('工坊文件结构过深');
    if (isRecord(item) && Object.hasOwn(item, '$blob')) {
      if (
        Object.keys(item).length !== 1 ||
        typeof item.$blob !== 'string' ||
        !Object.hasOwn(blobs, item.$blob)
      )
        throw Error('工坊素材引用无效');
      return blobs[item.$blob];
    }
    if (Array.isArray(item)) return item.map((value) => walk(value, depth + 1));
    if (isRecord(item))
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          walk(value, depth + 1),
        ]),
      );
    return item;
  }
  return model.migrate(walk(value.project));
}
export async function read(
  file: string,
  validate: DocumentValidator,
): Promise<LoadedProject> {
  if ((await fs.stat(file)).size > MAX_BYTES) throw Error('工坊超过 192 MB');
  const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  if (isRecord(data) && data.schema === 'card-atelier/1')
    return { document: validate(data) };
  return { workshop: model.validate(unpack(data), validate) };
}
export function serialized(
  workshop: unknown,
  validate: DocumentValidator,
): string {
  const project = model.validate(model.migrate(workshop, validate), validate),
    text = JSON.stringify(pack(project));
  if (Buffer.byteLength(text) > MAX_BYTES) throw Error('工坊去重后超过 192 MB');
  return text;
}
