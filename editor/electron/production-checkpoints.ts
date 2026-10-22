import fs from 'node:fs/promises';
import path from 'node:path';
import * as storage from './workshop-storage';
import { isRecord, errorCode } from './validation';
import type { AtomicWrite, DocumentValidator } from '../shared/projects';
interface Checkpoint {
  id: string;
  file: string;
  name: string;
  documentToken?: string;
  revision?: number;
  at: string;
}
export function createCheckpoints({
  runtimeDir,
  validate,
  write,
}: {
  runtimeDir: string;
  validate: DocumentValidator;
  write: AtomicWrite;
}) {
  const root = path.join(runtimeDir, 'production-checkpoints');
  function files(id: unknown) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      throw Error('制作检查点 ID 无效');
    return {
      id,
      meta: path.join(root, id + '.json'),
      card: path.join(root, id + '.cardproj'),
      workshop: path.join(root, id + '.cardworkshop'),
    };
  }
  async function info(id: string): Promise<Checkpoint | null> {
    try {
      const data: unknown = JSON.parse(
        await fs.readFile(files(id).meta, 'utf8'),
      );
      if (
        !isRecord(data) ||
        typeof data.id !== 'string' ||
        typeof data.file !== 'string' ||
        typeof data.name !== 'string' ||
        typeof data.at !== 'string' ||
        (data.documentToken !== undefined &&
          typeof data.documentToken !== 'string') ||
        (data.revision !== undefined && typeof data.revision !== 'number')
      )
        throw Error('制作检查点元数据无效');
      return {
        id: data.id,
        file: data.file,
        name: data.name,
        at: data.at,
        ...(typeof data.documentToken === 'string'
          ? { documentToken: data.documentToken }
          : {}),
        ...(typeof data.revision === 'number'
          ? { revision: data.revision }
          : {}),
      };
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    }
  }
  return {
    async save(args: unknown) {
      if (!isRecord(args)) throw Error('检查点缺少当前卡片');
      const unpacked = args.workshop ? storage.unpack(args.workshop) : null;
      if (unpacked !== null && !isRecord(unpacked))
        throw Error('检查点缺少当前卡片');
      const w = isRecord(unpacked) ? unpacked : null,
        card =
          w && Array.isArray(w.cards)
            ? w.cards.find(
                (value: unknown) =>
                  isRecord(value) && value.id === w.activeCardId,
              )
            : undefined;
      const raw =
        w && isRecord(card) ? card.document : w ? undefined : args.document;
      if (!raw) throw Error('检查点缺少当前卡片');
      const doc = validate(raw),
        f = files(w ? w.id : doc.id),
        file = w ? f.workshop : f.card,
        text = w ? storage.serialized(w, validate) : JSON.stringify(doc);
      if (Buffer.byteLength(text) > storage.MAX_BYTES)
        throw Error('制作检查点超过 192 MB');
      const meta: Checkpoint = {
        id: f.id,
        file,
        name: w ? String(w.name) : doc.name,
        documentToken: doc.id,
        revision: typeof doc.revision === 'number' ? doc.revision : undefined,
        at: new Date().toISOString(),
      };
      await write(file, text);
      await write(f.meta, JSON.stringify(meta));
      return meta;
    },
    info,
    async open(id: string) {
      const meta = await info(id);
      if (!meta) throw Error('没有可恢复的制作检查点');
      const f = files(id),
        file =
          meta.file === f.workshop
            ? f.workshop
            : meta.file === f.card
              ? f.card
              : null;
      if (!file) throw Error('制作检查点路径无效');
      return { ...(await storage.read(file, validate)), checkpoint: meta };
    },
  };
}
