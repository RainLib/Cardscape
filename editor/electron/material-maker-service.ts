import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import * as P from './material-maker-project';
import { ROOT } from './paths';
import { isRecord } from './validation';
import type {
  MaterialMakerOptions,
  MaterialMakerJob,
  MaterialMakerNativeState,
  MaterialMakerOpen,
  MaterialMakerShader,
} from '../shared/material-maker';
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const notFound = (error: unknown) => isRecord(error) && error.code === 'ENOENT';
const string = (value: unknown) =>
  typeof value === 'string' ? value : undefined;
const text = (value: unknown) => {
  if (typeof value !== 'string') throw Error('材质任务参数无效');
  return value;
};
const optionalText = (value: unknown) =>
  value === undefined ? undefined : text(value);
const integer = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw Error('材质任务参数无效');
  return value;
};
const parse = (source: string): unknown => JSON.parse(source);
const object = (value: unknown) => {
  if (!isRecord(value)) throw Error('材质任务数据无效');
  return value;
};
const TOOL = 'Material Maker.app/Contents/MacOS/Material Maker';
const hash = (value: Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
function png(data: unknown) {
  if (
    typeof data !== 'string' ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)
  )
    throw Error('需要 PNG 图像');
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  if (
    bytes.length > 32 * 1024 * 1024 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error('PNG 无效或过大');
  return bytes;
}
export function createMaterialMaker({
  runtimeDir,
  dialogs,
  write,
  processImage,
}: MaterialMakerOptions) {
  const base = path.join(runtimeDir, 'material-maker'),
    children = new Map<string, ChildProcess>();
  let configured: string | undefined,
    settingsReady = false;
  async function config() {
    if (!settingsReady) {
      settingsReady = true;
      try {
        configured = string(
          object(
            parse(await fs.readFile(path.join(base, 'settings.json'), 'utf8')),
          ).executable,
        );
      } catch {}
    }
    return configured;
  }
  async function executable() {
    const selected = await config();
    const candidates = [
      selected,
      process.env.CARDSCAPE_MATERIAL_MAKER,
      path.join(ROOT, 'runtime/material-maker-tools', TOOL),
      path.join(runtimeDir, 'tools', TOOL),
      '/Applications/' + TOOL,
      path.join(homedir(), 'Applications', TOOL),
    ].filter((value): value is string => typeof value === 'string' && !!value);
    for (let file of candidates) {
      if (file.endsWith('.app'))
        file = path.join(file, 'Contents/MacOS/Material Maker');
      try {
        await fs.access(file, constants.X_OK);
        return file;
      } catch {}
    }
    return null;
  }
  async function job(
    id: string,
  ): Promise<MaterialMakerJob & { directory: string }> {
    if (typeof id !== 'string' || !/^[\da-f-]{36}$/.test(id))
      throw Error('材质任务 ID 无效');
    const directory = path.join(base, 'jobs', id),
      value = object(
        parse(await fs.readFile(path.join(directory, 'job.json'), 'utf8')),
      );
    if (
      value.id !== id ||
      typeof value.documentToken !== 'string' ||
      typeof value.layerId !== 'string' ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      (value.exportHash !== null && typeof value.exportHash !== 'string') ||
      (value.documentId !== undefined &&
        typeof value.documentId !== 'string') ||
      (value.layerName !== undefined && typeof value.layerName !== 'string') ||
      (value.createdAt !== undefined && typeof value.createdAt !== 'number')
    )
      throw Error('材质任务数据无效');
    return { ...value, directory } as MaterialMakerJob & { directory: string };
  }
  async function nativeState(
    directory: string,
  ): Promise<MaterialMakerNativeState> {
    try {
      const value = object(
        parse(
          await fs.readFile(path.join(directory, 'native-state.json'), 'utf8'),
        ),
      );
      return {
        ...value,
        pid: typeof value.pid === 'number' ? value.pid : undefined,
        at: typeof value.at === 'number' ? value.at : undefined,
        phase: string(value.phase),
        request: string(value.request),
        error: string(value.error),
      };
    } catch {
      return {};
    }
  }
  async function live(id: string) {
    const child = children.get(id);
    if (child) return child.exitCode === null && child.signalCode === null;
    const state = await nativeState(path.join(base, 'jobs', id));
    if (
      typeof state.pid !== 'number' ||
      !Number.isSafeInteger(state.pid) ||
      typeof state.at !== 'number' ||
      !Number.isFinite(state.at) ||
      Date.now() / 1000 - state.at > 15
    )
      return false;
    try {
      process.kill(state.pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  async function runner() {
    const source =
      process.env.CARDSCAPE_MATERIAL_MAKER_SOURCE ||
      path.join(ROOT, 'runtime/material-maker-tools/source/material-maker-1.7');
    try {
      await fs.access(
        path.join(source, '.godot/global_script_class_cache.cfg'),
      );
      if (
        !/config\/actual_release="1\.7"/.test(
          await fs.readFile(path.join(source, 'project.godot'), 'utf8'),
        )
      )
        return null;
    } catch {
      return null;
    }
    const names =
      process.platform === 'win32'
        ? ['godot.exe', 'godot4.exe']
        : ['godot', 'godot4'];
    const candidates = [
      process.env.GODOT_BIN,
      process.platform === 'darwin'
        ? '/Applications/Godot.app/Contents/MacOS/Godot'
        : null,
      ...(process.env.PATH || '')
        .split(path.delimiter)
        .flatMap((dir) => names.map((name) => path.join(dir, name))),
    ].filter((value): value is string => typeof value === 'string' && !!value);
    for (const file of candidates) {
      try {
        await fs.access(file, constants.X_OK);
        return { file, source };
      } catch {}
    }
    return null;
  }
  async function status() {
    const file = await executable(),
      engine = await runner();
    let version = engine ? '1.7' : null;
    if (!engine && file && file.includes('.app/')) {
      try {
        const info = await fs.readFile(
          path.resolve(file, '../../Info.plist'),
          'utf8',
        );
        version =
          /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)/.exec(
            info,
          )?.[1] || null;
      } catch {}
    }
    return {
      available: !!file || !!engine,
      executable: file || engine?.file,
      version,
      mode: 'native-linked',
      linked: !!engine,
    };
  }
  async function open(raw: Record<string, unknown>) {
    const args: MaterialMakerOpen = {
      documentToken: text(raw.documentToken),
      layerId: text(raw.layerId),
      revision: integer(raw.revision),
      documentId: optionalText(raw.documentId),
      layerName: optionalText(raw.layerName),
      source: raw.source === null ? null : optionalText(raw.source),
      project: raw.project ? P.validateProject(raw.project) : null,
    };
    if (raw.masks !== undefined && raw.masks !== null) {
      const masks = object(raw.masks);
      args.masks = Object.fromEntries(
        Object.entries(masks).map(([name, value]) => [name, text(value)]),
      );
    }

    if (
      typeof args.documentToken !== 'string' ||
      typeof args.layerId !== 'string' ||
      !/^[\w-]{1,100}$/.test(args.layerId) ||
      typeof args.revision !== 'number' ||
      !Number.isSafeInteger(args.revision)
    )
      throw Error('需要明确的卡片与图层绑定');
    // A saved job and its native heartbeat survive renderer/backend restarts.
    // Reattach without overwriting an open graph or launching another window.
    for (const entry of await fs
      .readdir(path.join(base, 'jobs'))
      .catch(() => [])) {
      try {
        const existing = await job(entry);
        if (
          existing.documentId === args.documentId &&
          existing.layerId === args.layerId &&
          (await live(entry))
        ) {
          existing.documentToken = args.documentToken;
          existing.revision = args.revision;
          const { directory, ...saved } = existing;
          await write(path.join(directory, 'job.json'), JSON.stringify(saved));
          await write(
            path.join(directory, 'request.json'),
            JSON.stringify({ id: randomUUID(), command: 'focus' }),
          );
          return { ...existing, directory, phase: 'ready', reattached: true };
        }
      } catch {}
    }
    const file = await executable();
    if (!file && !(await runner()))
      throw Error(
        '未找到 Material Maker，请安装 Godot 4.7 并运行 npm run material-maker:setup，或选择 Material Maker 桌面版程序',
      );
    const id = randomUUID(),
      directory = path.join(base, 'jobs', id);
    await fs.mkdir(path.join(directory, 'output'), { recursive: true });
    const files: Record<string, string> = {};
    if (args.source) {
      await fs.writeFile(path.join(directory, 'source.png'), png(args.source));
      files.source = path.join(directory, 'source.png');
    }
    for (const [name, data] of Object.entries(args.masks || {})) {
      if (
        !['motion', 'emission', 'phase', 'foil', 'inset', 'rigid'].includes(
          name,
        )
      )
        continue;
      await fs.writeFile(path.join(directory, name + '.png'), png(data));
      files[name] = path.join(directory, name + '.png');
    }
    const project = P.prepare(args.project, files);
    await write(
      path.join(directory, 'material.ptex'),
      JSON.stringify(project, null, 2),
    );
    const value = {
      id,
      documentToken: args.documentToken,
      documentId: args.documentId,
      layerId: args.layerId,
      layerName: String(args.layerName || args.layerId).slice(0, 200),
      revision: args.revision,
      createdAt: Date.now(),
      exportHash: null,
    };
    await write(path.join(directory, 'job.json'), JSON.stringify(value));
    await launch({ ...value, directory }, file);
    if (!(await runner()))
      await write(
        path.join(directory, 'native-state.json'),
        JSON.stringify({ phase: 'ready', mode: 'cli' }),
      );
    return { ...value, directory, phase: 'opening' };
  }
  async function launch(
    value: MaterialMakerJob & { directory: string },
    file: string | null = null,
  ) {
    file ||= await executable();
    if (!file && !(await runner())) throw Error('Material Maker 程序不可用');
    if (await live(value.id)) return;
    const engine = await runner(),
      command = engine?.file || file;
    if (!command) throw Error('Material Maker 程序不可用');
    const log = await fs.open(path.join(value.directory, 'native.log'), 'a');
    let child: ChildProcess;
    try {
      child = spawn(
        command,
        engine
          ? [
              '--path',
              engine.source,
              '--max-fps',
              '30',
              '--script',
              path.join(__dirname, 'material-maker-controller.gd'),
              '--',
              value.directory,
            ]
          : [path.join(value.directory, 'material.ptex')],
        {
          cwd: path.dirname(command),
          stdio: ['ignore', log.fd, log.fd],
          detached: true,
          shell: false,
        },
      );
      children.set(value.id, child);
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', () => resolve());
        child.once('error', reject);
      });
      child.unref();
    } finally {
      await log.close();
    }
    child.on('error', (error) => {
      fs.writeFile(
        path.join(value.directory, 'process-error.json'),
        JSON.stringify({ error: error.message }),
      ).catch(() => {});
    });
  }
  async function inspect(id: string) {
    const value = await job(id),
      state = await nativeState(value.directory);
    let sourceHash: string | null = null;
    try {
      sourceHash = hash(
        await fs.readFile(path.join(value.directory, 'material.ptex')),
      );
    } catch {}
    return {
      ...value,
      native: state,
      running: await live(id),
      changed: sourceHash !== value.exportHash,
      sourceHash,
    };
  }
  async function sync(id: string) {
    const value = await inspect(id);
    if (!value.running) throw Error('Material Maker 已关闭；请先重新打开工程');
    if (!['ready', 'exported', 'error'].includes(value.native.phase || ''))
      return { pending: true, ...value };
    if (value.sourceHash === value.exportHash)
      return { pending: false, ...value };
    try {
      const p = object(
        parse(
          await fs.readFile(path.join(value.directory, 'pending.json'), 'utf8'),
        ),
      );
      if (
        p.sourceHash === value.sourceHash &&
        p.request !== value.native.request
      )
        return { pending: true, request: p.request };
    } catch {}
    const request = randomUUID();
    if (await runner())
      await fs.rm(path.join(value.directory, 'output'), {
        recursive: true,
        force: true,
      });
    await fs.mkdir(path.join(value.directory, 'output'), { recursive: true });
    await write(
      path.join(value.directory, 'pending.json'),
      JSON.stringify({ request, sourceHash: value.sourceHash }),
    );
    if (await runner())
      await write(
        path.join(value.directory, 'request.json'),
        JSON.stringify({ id: request, sourceHash: value.sourceHash }),
      );
    else void exportCLI(value, request);
    return { pending: true, request };
  }
  async function exportCLI(
    value: MaterialMakerJob & { directory: string },
    request: string,
  ) {
    try {
      const graph = P.prepare(
        JSON.parse(
          await fs.readFile(
            path.join(value.directory, 'material.ptex'),
            'utf8',
          ),
        ),
        {},
      );
      for (const n of graph.nodes)
        if (n.shader_model?.exports?.[P.PROFILE])
          n.shader_model.exports[P.PROFILE].files = n.shader_model.exports[
            P.PROFILE
          ].files.filter((f) => f.type === 'template');
      await write(
        path.join(value.directory, 'live.ptex'),
        JSON.stringify(graph),
      );
      await write(
        path.join(value.directory, 'native-state.json'),
        JSON.stringify({ phase: 'exporting', request }),
      );
      const file = await executable();
      if (!file) throw Error('Material Maker 程序不可用');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          file,
          [
            '--export-material',
            '-t',
            P.PROFILE,
            '-o',
            path.join(value.directory, 'output'),
            path.join(value.directory, 'live.ptex'),
            '--headless',
          ],
          { stdio: ['ignore', 'ignore', 'pipe'], shell: false },
        );
        let log = '';
        child.stderr!.on('data', (b) => (log = (log + b).slice(-8192)));
        const timeout = setTimeout(() => {
          child.kill();
          reject(Error('无窗口导出超时'));
        }, 60000);
        child.once('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          code === 0
            ? resolve()
            : reject(Error('Material Maker 导出失败：' + log));
        });
      });
      await fs.rename(
        path.join(value.directory, 'output/live.glsl'),
        path.join(value.directory, 'output/material.glsl'),
      );
      await write(
        path.join(value.directory, 'native-state.json'),
        JSON.stringify({ phase: 'exported', request }),
      );
    } catch (e) {
      await write(
        path.join(value.directory, 'native-state.json'),
        JSON.stringify({ phase: 'error', request, error: message(e) }),
      );
    }
  }
  async function result(id: string) {
    const value = await inspect(id);
    if (value.native.phase !== 'exported') return { pending: true, ...value };
    if (value.exportHash === value.sourceHash) {
      try {
        return {
          ...object(
            parse(
              await fs.readFile(
                path.join(value.directory, 'result.json'),
                'utf8',
              ),
            ),
          ),
          documentToken: value.documentToken,
          revision: value.revision,
        };
      } catch {}
    }
    const pending = object(
      parse(
        await fs.readFile(path.join(value.directory, 'pending.json'), 'utf8'),
      ),
    );
    if (value.native.request !== pending.request)
      return { pending: true, ...value };
    if (value.sourceHash !== pending.sourceHash)
      return { pending: true, stale: true, ...value };
    const project = P.portable(
        JSON.parse(
          await fs.readFile(
            path.join(value.directory, 'material.ptex'),
            'utf8',
          ),
        ),
      ),
      source = await fs.readFile(
        path.join(value.directory, 'output/material.glsl'),
        'utf8',
      );
    let shader: MaterialMakerShader | null = null,
      shaderError: string | null = null;
    try {
      shader = (
        (await import(
          './material-maker-compiler.mjs'
        )) as typeof import('./material-maker-compiler')
      ).compileMaterialMaker(source);
    } catch (error) {
      shaderError = message(error);
    }
    const images: Record<string, string> = {};
    for (const name of [
      'source',
      'effect',
      'motion',
      'emission',
      'phase',
      'foil',
      'inset',
      'rigid',
    ] as const) {
      try {
        const bytes = await fs.readFile(
          path.join(value.directory, 'output/material_' + name + '.png'),
        );
        const resized = await processImage('resize', {
          image: 'data:image/png;base64,' + bytes.toString('base64'),
          width: 1024,
          height: 1536,
        });
        images[name] = resized.image;
      } catch (error) {
        if (!notFound(error)) throw error;
      }
    }
    const next = { ...value };
    for (const key of [
      'directory',
      'native',
      'running',
      'changed',
      'sourceHash',
    ] as const)
      delete next[key];
    next.exportHash = text(pending.sourceHash);
    await write(path.join(value.directory, 'job.json'), JSON.stringify(next));
    const output = {
      id,
      documentToken: value.documentToken,
      documentId: value.documentId,
      layerId: value.layerId,
      revision: value.revision,
      project,
      shader,
      shaderError,
      images,
      hash: pending.sourceHash,
    };
    await write(
      path.join(value.directory, 'result.json'),
      JSON.stringify(output),
    );
    return output;
  }
  return {
    async invoke(method: string, input: unknown = {}) {
      const args = object(input);
      switch (method) {
        case 'material-maker-status':
          return status();
        case 'material-maker-config': {
          let file: unknown = args.executable;
          if (args.choose && dialogs?.importMaterialMaker)
            file = (await dialogs.importMaterialMaker()) || undefined;
          if (!file) return { canceled: true };
          if (typeof file !== 'string' || !path.isAbsolute(file))
            throw Error('请选择程序的绝对路径');
          const expected = file.endsWith('.app')
            ? path.join(file, 'Contents/MacOS/Material Maker')
            : file;
          try {
            await fs.access(expected, constants.X_OK);
          } catch {
            throw Error('程序不可执行');
          }
          configured = file;
          settingsReady = true;
          const next = await status();
          await write(
            path.join(base, 'settings.json'),
            JSON.stringify({ executable: file }),
          );
          return next;
        }
        case 'material-maker-bind': {
          const value = await job(text(args.id));
          if (
            args.documentToken !== value.documentToken ||
            args.layerId !== value.layerId ||
            typeof args.revision !== 'number' ||
            !Number.isSafeInteger(args.revision) ||
            args.revision < value.revision
          )
            throw Error('材质绑定已过期');
          value.revision = args.revision;
          const { directory, ...saved } = value;
          await write(path.join(directory, 'job.json'), JSON.stringify(saved));
          return { revision: args.revision };
        }
        case 'material-maker-open':
          return open(args);
        case 'material-maker-inspect':
          return inspect(text(args.id));
        case 'material-maker-sync':
          return sync(text(args.id));
        case 'material-maker-result':
          return result(text(args.id));
        case 'material-maker-reopen': {
          const value = await job(text(args.id));
          await launch(value);
          if (await runner())
            await write(
              path.join(value.directory, 'request.json'),
              JSON.stringify({ id: randomUUID(), command: 'focus' }),
            );
          return inspect(text(args.id));
        }
        case 'material-maker-reveal': {
          const value = await job(text(args.id));
          if (dialogs?.reveal) await dialogs.reveal(value.directory);
          return { directory: value.directory };
        }
        default:
          throw Error('未知 Material Maker 命令');
      }
    },
    close() {
      for (const child of children.values()) {
        child.unref();
      }
      children.clear();
    },
  };
}
