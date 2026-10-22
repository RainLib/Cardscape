import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isRecord, errorCode } from './validation';
import type { AtomicWrite } from '../shared/projects';
import type { createEditorSession } from './editor-session';
interface RecentCard {
  id: string;
  name: string;
  thumbnail: string;
}
export interface RecentProject {
  id: string;
  projectId: string;
  file: string | null;
  name: string;
  kind: 'card' | 'workshop' | 'project';
  activeCardId?: string;
  at: number;
  dirty?: boolean;
  cards: RecentCard[];
}
function validCard(value: unknown): value is RecentCard {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.thumbnail === 'string'
  );
}
function validEntry(value: unknown): value is RecentProject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    (value.file === null || typeof value.file === 'string') &&
    typeof value.name === 'string' &&
    ['card', 'workshop', 'project'].includes(String(value.kind)) &&
    typeof value.at === 'number' &&
    (value.activeCardId === undefined ||
      typeof value.activeCardId === 'string') &&
    (value.dirty === undefined || typeof value.dirty === 'boolean') &&
    Array.isArray(value.cards) &&
    value.cards.every(validCard)
  );
}
export function createRecentProjects({
  runtimeDir,
  write,
  session,
}: {
  runtimeDir: string;
  write: AtomicWrite;
  session: Pick<
    ReturnType<typeof createEditorSession>,
    'metadata' | 'hasRecent'
  >;
}) {
  const key = (value: string) =>
      createHash('sha256').update(value).digest('hex'),
    index = path.join(runtimeDir, 'recent-projects.json');
  let queue: Promise<void> = Promise.resolve();
  async function read(): Promise<RecentProject[]> {
    try {
      if ((await fs.stat(index)).size > 8 * 1024 * 1024) return [];
      const value: unknown = JSON.parse(await fs.readFile(index, 'utf8'));
      return isRecord(value) &&
        value.version === 1 &&
        Array.isArray(value.entries)
        ? value.entries.filter(validEntry).slice(0, 16)
        : [];
    } catch {
      return [];
    }
  }
  async function thumbnail(value: unknown): Promise<string> {
    if (
      isRecord(value) &&
      typeof value.$blob === 'string' &&
      /^[a-f0-9]{64}$/.test(value.$blob)
    ) {
      try {
        const file = path.join(
          runtimeDir,
          'editor-session/assets',
          value.$blob + '.txt',
        );
        if ((await fs.stat(file)).size > 128 * 1024) return '';
        const src = await fs.readFile(file, 'utf8');
        return key(src) === value.$blob ? thumbnail(src) : '';
      } catch {
        return '';
      }
    }
    return typeof value === 'string' &&
      value.length <= 128 * 1024 &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
      ? value
      : '';
  }
  async function record(
    project: unknown,
    file: string | null,
    at = Date.now(),
    dirty = false,
  ) {
    const run = async () => {
      if (!isRecord(project)) throw Error('最近工程格式无效');
      const projectId =
          typeof project.id === 'string' && project.id ? project.id : 'single',
        source = file ? path.resolve(file) : null,
        id = key(source || 'draft:' + projectId);
      if (project.schema === 'card-workshop/1' && !Array.isArray(project.cards))
        throw Error('工程卡片列表无效');
      const cards: unknown[] =
        project.schema === 'card-workshop/1' && Array.isArray(project.cards)
          ? project.cards
          : [
              {
                id: projectId,
                name: project.name,
                thumbnail: project.thumbnail,
              },
            ];
      const summaries = await Promise.all(
        cards.slice(0, 64).map(async (value: unknown): Promise<RecentCard> => {
          if (!isRecord(value) || typeof value.id !== 'string')
            throw Error('工程卡片 ID 无效');
          return {
            id: value.id,
            name: String(value.name || '未命名卡片').slice(0, 200),
            thumbnail: await thumbnail(value.thumbnail),
          };
        }),
      );
      const entry: RecentProject = {
        id,
        projectId,
        file: source,
        name: String(project.name || '未命名工程').slice(0, 200),
        kind: project.schema === 'card-workshop/1' ? 'workshop' : 'card',
        activeCardId:
          typeof project.activeCardId === 'string' && project.activeCardId
            ? project.activeCardId
            : summaries[0]?.id,
        at,
        dirty,
        cards: summaries,
      };
      const entries = [
        entry,
        ...(await read()).filter(
          (e) => e.id !== id && !(e.projectId === projectId && !e.file),
        ),
      ].slice(0, 16);
      for (
        let i = entries.length - 1;
        Buffer.byteLength(JSON.stringify(entries)) > 4 * 1024 * 1024 && i >= 0;
        i--
      )
        for (const card of entries[i].cards) card.thumbnail = '';
      await write(index, JSON.stringify({ version: 1, entries }));
      return entry;
    };
    const pending = queue.then(run);
    queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  async function list(initialFile: string | null = null) {
    await queue;
    const meta = await session.metadata();
    if (meta?.project) {
      let newer = false;
      if (meta.sourceFile)
        try {
          newer = (await fs.stat(meta.sourceFile)).mtimeMs > meta.at;
        } catch {}
      if (!newer)
        await record(
          meta.project,
          meta.sourceFile,
          meta.at,
          meta.revision !== meta.savedRevision,
        );
    }
    const entries = await read();
    let files: string[] = [];
    try {
      files = (await fs.readdir(path.join(runtimeDir, 'projects')))
        .filter((f) => /\.(cardproj|cardworkshop)$/.test(f))
        .map((f) => path.join(runtimeDir, 'projects', f));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    if (initialFile) files.unshift(path.resolve(initialFile));
    for (const file of new Set(files)) {
      if (entries.some((e) => e.file === file)) continue;
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;
      entries.push({
        id: key(file),
        projectId: '',
        file,
        name: path.basename(file).replace(/\.(cardproj|cardworkshop)$/, ''),
        kind: 'project',
        at: stat.mtimeMs,
        cards: [],
      });
    }
    const project = meta && isRecord(meta.project) ? meta.project : null;
    return Promise.all(
      entries
        .sort((a, b) => b.at - a.at)
        .slice(0, 24)
        .map(async (entry) => ({
          ...entry,
          available:
            !!(entry.file && (await fs.stat(entry.file).catch(() => null))) ||
            !!(
              project &&
              (project.id || 'single') === entry.projectId &&
              (!entry.file || meta?.sourceFile === entry.file)
            ) ||
            !!(
              entry.projectId &&
              (await session.hasRecent(entry.projectId, entry.file))
            ),
        })),
    );
  }
  return { record, list };
}
