import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as storage from './workshop-storage';
import { workshopCodec as workshops } from './workshop-codec';
import { isRecord, errorCode, errorMessage } from './validation';
import type {
  AtomicWrite,
  DocumentValidator,
  SessionRecord,
  RecoveryResult,
} from '../shared/projects';
interface SessionOptions {
  runtimeDir: string;
  validate: DocumentValidator;
  write: AtomicWrite;
}
function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isRecord(value) &&
    value.schema === 'card-editor-session/1' &&
    (value.sourceFile === null || typeof value.sourceFile === 'string') &&
    typeof value.at === 'number' &&
    typeof value.revision === 'number' &&
    typeof value.savedRevision === 'number'
  );
}
const projectId = (value: unknown): string =>
  isRecord(value) && typeof value.id === 'string' && value.id
    ? value.id
    : 'single';
export function createEditorSession({
  runtimeDir,
  validate,
  write,
}: SessionOptions) {
  const root = path.join(runtimeDir, 'editor-session'),
    file = path.join(root, 'current.json'),
    assets = path.join(root, 'assets');
  let token: string | null = null,
    sequence = 0,
    queue: Promise<void> = Promise.resolve();
  const cache = new Map<string, string>();
  const hash = (source: string) =>
    createHash('sha256').update(source).digest('hex');
  const archiveFile = (id: string, source: string | null) =>
    path.join(
      root,
      'projects',
      hash(source ? path.resolve(source) : 'draft:' + id) + '.json',
    );
  async function metadataAt(target: string): Promise<SessionRecord | null> {
    try {
      if ((await fs.stat(target)).size > 16 * 1024 * 1024)
        throw Error('恢复元数据过大');
      const record: unknown = JSON.parse(await fs.readFile(target, 'utf8'));
      return isSessionRecord(record) ? record : null;
    } catch {
      return null;
    }
  }
  async function expand(project: unknown): Promise<unknown> {
    let nodes = 0;
    async function walk(value: unknown, depth = 0): Promise<unknown> {
      if (++nodes > 1000000 || depth > 40) throw Error('恢复记录结构过深');
      if (isRecord(value) && Object.hasOwn(value, '$blob')) {
        const id = value.$blob;
        if (
          Object.keys(value).length !== 1 ||
          typeof id !== 'string' ||
          !/^[a-f0-9]{64}$/.test(id)
        )
          throw Error('恢复素材引用无效');
        if (!cache.has(id)) {
          const source = await fs.readFile(
            path.join(assets, id + '.txt'),
            'utf8',
          );
          if (hash(source) !== id) throw Error('恢复素材摘要不匹配');
          cache.set(id, source);
        }
        return cache.get(id);
      }
      if (Array.isArray(value))
        return Promise.all(value.map((item) => walk(item, depth + 1)));
      if (isRecord(value))
        return Object.fromEntries(
          await Promise.all(
            Object.entries(value).map(async ([key, item]) => [
              key,
              await walk(item, depth + 1),
            ]),
          ),
        );
      return value;
    }
    return walk(project);
  }
  async function recover(
    sourceFile: string | null = null,
    target = file,
  ): Promise<RecoveryResult | null> {
    try {
      if ((await fs.stat(target)).size > 16 * 1024 * 1024)
        throw Error('恢复元数据过大');
      const record: unknown = JSON.parse(await fs.readFile(target, 'utf8'));
      if (!isSessionRecord(record)) throw Error('恢复记录格式无效');
      if (sourceFile && record.sourceFile !== path.resolve(sourceFile))
        return null;
      if (record.sourceFile)
        try {
          if ((await fs.stat(record.sourceFile)).mtimeMs > record.at)
            return null;
        } catch (error) {
          if (errorCode(error) !== 'ENOENT') throw error;
        }
      const value = await expand(record.project),
        result =
          isRecord(value) && value.schema === 'card-workshop/1'
            ? {
                workshop: workshops.validate(
                  workshops.migrate(value, validate),
                  validate,
                ),
              }
            : { document: validate(value) };
      return {
        ...result,
        sourceFile: record.sourceFile,
        recovery: {
          view: record.view,
          revision: record.revision,
          savedRevision: record.savedRevision,
          at: record.at,
        },
      };
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null;
      return { recoveryError: errorMessage(error) };
    }
  }
  return {
    metadata: () => metadataAt(file),
    async hasRecent(id: string, source: string | null) {
      return !!(await metadataAt(archiveFile(id, source)));
    },
    async recoverRecent(id: string, source: string | null) {
      const current = await metadataAt(file);
      return recover(
        source,
        current &&
          projectId(current.project) === id &&
          current.sourceFile === (source ? path.resolve(source) : null)
          ? file
          : archiveFile(id, source),
      );
    },
    start() {
      token = randomUUID();
      sequence = 0;
      return token;
    },
    recover,
    save(args: unknown, sourceFile: string | null) {
      const run = async () => {
        if (!isRecord(args) || args.token !== token)
          throw Error('编辑会话已切换，忽略旧恢复记录');
        if (
          typeof args.sequence !== 'number' ||
          !Number.isSafeInteger(args.sequence) ||
          args.sequence < 1
        )
          throw Error('恢复记录序号无效');
        if (args.sequence <= sequence) return { stale: true as const };
        if (
          typeof args.revision !== 'number' ||
          typeof args.savedRevision !== 'number' ||
          !Number.isSafeInteger(args.revision) ||
          !Number.isSafeInteger(args.savedRevision) ||
          args.revision < 0 ||
          args.savedRevision < 0
        )
          throw Error('恢复记录版本无效');
        if (
          !isRecord(args.project) ||
          !['card-workshop/1', 'card-atelier/1'].includes(
            String(args.project.schema),
          )
        )
          throw Error('恢复记录缺少工程');
        if (
          Buffer.byteLength(JSON.stringify(args.project)) > 16 * 1024 * 1024 ||
          Buffer.byteLength(JSON.stringify(args.view || {})) > 16 * 1024
        )
          throw Error('恢复元数据过大');
        if (args.blobs !== undefined && !isRecord(args.blobs))
          throw Error('恢复素材摘要不匹配');
        let bytes = 0;
        for (const [id, source] of Object.entries(args.blobs || {})) {
          if (
            !/^[a-f0-9]{64}$/.test(id) ||
            typeof source !== 'string' ||
            !source.startsWith('data:') ||
            hash(source) !== id
          )
            throw Error('恢复素材摘要不匹配');
          bytes += Buffer.byteLength(source);
          if (bytes > storage.MAX_BYTES) throw Error('恢复素材超过 192 MB');
          await write(path.join(assets, id + '.txt'), source);
          cache.set(id, source);
        }
        const value = await expand(args.project);
        if (isRecord(value) && value.schema === 'card-workshop/1')
          workshops.validate(workshops.migrate(value, validate), validate);
        else validate(value);
        const at = Date.now(),
          record: SessionRecord = {
            schema: 'card-editor-session/1',
            sourceFile: sourceFile ? path.resolve(sourceFile) : null,
            project: args.project,
            view: args.view,
            revision: args.revision,
            savedRevision: args.savedRevision,
            at,
          };
        if (args.token !== token) throw Error('编辑会话已切换，忽略旧恢复记录');
        const previous = await metadataAt(file);
        if (
          previous &&
          archiveFile(projectId(previous.project), previous.sourceFile) !==
            archiveFile(projectId(args.project), sourceFile)
        )
          await write(
            archiveFile(projectId(previous.project), previous.sourceFile),
            JSON.stringify(previous),
          );
        await write(
          archiveFile(projectId(args.project), sourceFile),
          JSON.stringify(record),
        );
        await write(file, JSON.stringify(record));
        sequence = args.sequence;
        return { at, sequence };
      };
      const pending = queue.then(run);
      queue = pending.then(
        () => {},
        () => {},
      );
      return pending;
    },
  };
}
