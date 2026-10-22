/* Immutable, content-addressed objects. Shared components and textures are
 * referenced by cards; changing one card never renames an unchanged object. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { ROOT, SDK } from './paths';
import { isRecord } from './validation';
import type { WorkshopDocument } from '../shared/projects';
import type {
  AssetManifest,
  ComponentValue,
  GodotSnapshot,
  ExportOptions,
  RemoteObject,
  RemoteRecord,
} from '../shared/export';

type SharedField =
  | 'frameStyle'
  | 'frameGeometry'
  | 'backScene'
  | 'characterRig'
  | 'actions'
  | 'foregroundGeometry'
  | 'shader';
type SplitCard<T> = Omit<
  T,
  SharedField | 'componentScenes' | 'material' | 'particles'
> &
  Partial<Record<SharedField, string>> & {
    componentScenes?: Record<string, string>;
    material?: ComponentValue | string;
    particles?: ComponentValue | string;
  };

function required<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw Error('缺少导出清单');
  return value;
}
const hash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  return value;
}
const json = (value: unknown) => Buffer.from(JSON.stringify(stable(value))),
  clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const mime = (file: string) =>
  new Map([
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['json', 'application/json'],
    ['glsl', 'text/plain'],
  ]).get(path.extname(file).slice(1)) || 'application/octet-stream';
export async function exportRemote(
  directory: string,
  w: WorkshopDocument,
  manifests: Map<string, AssetManifest>,
  godot: GodotSnapshot,
  { cardDirectory }: ExportOptions = {},
) {
  const selected = w.cards.filter(
    (c) =>
      isRecord(c.document.exportSettings) &&
      c.document.exportSettings.remoteDelivery,
  );
  if (!selected.length) return null;
  const root = path.join(directory, 'remote'),
    objects: Record<string, RemoteObject> = {};
  await fs.mkdir(path.join(root, 'objects'), { recursive: true });
  async function add(bytes: Buffer, type: string) {
    const id = hash(bytes);
    if (!objects[id]) {
      const zipped = gzipSync(bytes, { level: 9 }),
        compressed = zipped.length < bytes.length * 0.96,
        payload = compressed ? zipped : bytes,
        ext = compressed
          ? 'gz'
          : type === 'application/json'
            ? 'json'
            : type === 'image/webp'
              ? 'webp'
              : type === 'image/png'
                ? 'png'
                : 'bin';
      const file = 'objects/' + id + '.' + ext;
      await fs.writeFile(path.join(root, file), payload);
      objects[id] = {
        path: file,
        mime: type,
        compression: compressed ? 'gzip' : 'identity',
        bytes: bytes.length,
        downloadBytes: payload.length,
      };
    }
    return id;
  }
  const addJSON = async (value: unknown) =>
    add(json(value), 'application/json');
  async function imageURI(value: string) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(value);
    if (!match) throw Error('远端资源编码无效');
    return '@asset:' + (await add(Buffer.from(match[2], 'base64'), match[1]));
  }
  async function fileAsset(file: string, base: string) {
    const resolved = path.resolve(base, file);
    if (!resolved.startsWith(directory + path.sep))
      throw Error('远端资源路径超出导出目录');
    return '@asset:' + (await add(await fs.readFile(resolved), mime(file)));
  }
  async function convert<T>(value: T, files: Map<string, string>): Promise<T> {
    if (typeof value === 'string') {
      if (value.startsWith('data:')) return (await imageURI(value)) as T;
      return (files.get(value) || value) as T;
    }
    if (Array.isArray(value))
      return (await Promise.all(
        value.map((v: unknown) => convert(v, files)),
      )) as T;
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value))
        result[files.get(key) || key] = await convert(v, files);
      return result as T;
    }
    return value;
  }
  function references(
    value: unknown,
    prefix = '@asset:',
    into = new Set<string>(),
  ): Set<string> {
    if (typeof value === 'string' && value.startsWith(prefix))
      into.add(value.slice(prefix.length));
    else if (Array.isArray(value))
      for (const v of value) references(v, prefix, into);
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        references(k, prefix, into);
        references(v, prefix, into);
      }
    return into;
  }
  const definitions = new Map<string, unknown>();
  async function shared(value: unknown) {
    const id = await addJSON(value);
    definitions.set(id, value);
    return '@json:' + id;
  }
  async function splitComponents<T extends object>(input: T) {
    const card: Record<string, unknown> = Object.fromEntries(
      Object.entries(input),
    );
    const always = new Set<string>();
    async function split(value: unknown) {
      references(value, '@asset:', always);
      return shared(value);
    }
    if (isRecord(card.componentScenes)) {
      card.componentScenes = { ...card.componentScenes };
      const scenes = card.componentScenes as Record<string, unknown>;
      for (const key of Object.keys(scenes))
        scenes[key] = await split(scenes[key]);
    }
    for (const key of [
      'frameStyle',
      'frameGeometry',
      'backScene',
      'characterRig',
      'actions',
      'foregroundGeometry',
      'shader',
    ] as const)
      if (card[key]) card[key] = await split(card[key]);
    for (const key of ['material', 'particles'] as const)
      if (isRecord(card[key]) && card[key].document)
        card[key] = await split(card[key]);
    // Shared fields above now hold JSON references; remaining fields retain
    // their original representation. Keep this distinct from the local manifest.
    return { card: card as SplitCard<T>, always };
  }
  function dependencyIDs(
    value: unknown,
    into = new Set<string>(),
  ): Set<string> {
    for (const id of references(value, '@json:'))
      if (!into.has(id)) {
        into.add(id);
        dependencyIDs(definitions.get(id), into);
      }
    return into;
  }
  async function record(
    value: unknown,
    baseAssets: Set<string>,
    highAssets: Set<string>,
  ): Promise<RemoteRecord> {
    const definition = await addJSON(value),
      base = new Set<string>([
        definition,
        ...dependencyIDs(value),
        ...baseAssets,
      ]);
    return {
      definition,
      base: [...base].sort(),
      detail: [...highAssets].filter((id) => !base.has(id)).sort(),
    };
  }
  const cards: Array<{
      id: string;
      name: string;
      bindings: unknown;
      webgl: RemoteRecord;
      godot: RemoteRecord;
    }> = [],
    components: Array<{
      id: string;
      kind: string;
      version: number;
      definition: string;
      base: string[];
    }> = [];
  for (const c of selected) {
    const m = clone(required(manifests, c.id)),
      base = cardDirectory || path.join(directory, 'cards', c.id),
      files = new Map<string, string>();
    const images = new Set<string | null | undefined>([
      m.frontAsset || 'front.png',
      m.backAsset,
      m.particles?.sprite,
      ...m.layers.flatMap((l) => [
        l.asset,
        l.cutoutMaskAsset,
        ...(l.titleArt?.variants || []).map((v) => v.rasterAsset),
      ]),
      ...Object.values(
        m.maskAssets ||
          Object.fromEntries(m.masks.map((id) => [id, 'masks/' + id + '.png'])),
      ),
      ...(m.backScene?.layers || []).map((l) => l.src),
    ]);
    for (const v of Object.values(m.exportProfile?.textures || {})) {
      images.add(v.small.asset);
      images.add(v.large.asset);
    }
    for (const file of images)
      if (file) files.set(file, await fileAsset(file, base));
    if (!m.maskAssets)
      m.maskAssets = Object.fromEntries(
        m.masks.map((id) => [id, 'masks/' + id + '.png']),
      );
    const foregroundMesh = m.foregroundMesh
      ? JSON.parse(
          await fs.readFile(path.resolve(base, m.foregroundMesh), 'utf8'),
        )
      : null;
    const [vertex, fragment] = await Promise.all([
      fs.readFile(
        path.resolve(base, m.shaderAssets?.vertex || 'shaders/card.vert.glsl'),
        'utf8',
      ),
      fs.readFile(
        path.resolve(
          base,
          m.shaderAssets?.fragment || 'shaders/card.frag.glsl',
        ),
        'utf8',
      ),
    ]);
    delete m.foregroundMesh;
    delete m.shaderAssets;
    delete m.bakedAssets;
    delete m.framePreview;
    for (const l of m.layers)
      for (const key of ['underpaint', 'splitEdgeOriginal'] as const)
        delete l[key];
    const web = await convert(
        {
          manifest: m,
          actions: m.actions,
          slots: m.slots,
          vertex,
          fragment,
          foregroundMesh,
        },
        files,
      ),
      high = new Set<string>();
    for (const v of Object.values(web.manifest.exportProfile?.textures || {}))
      if (v.large.asset !== v.small.asset) high.add(v.large.asset.slice(7));
    const split = await splitComponents(web.manifest);
    const webPayload = {
      ...web,
      manifest: split.card,
      actions: split.card.actions,
      vertex: await shared(web.vertex),
      fragment: await shared(web.fragment),
      foregroundMesh: web.foregroundMesh
        ? await shared(web.foregroundMesh)
        : web.foregroundMesh,
    };
    const all = references(webPayload),
      small = new Set<string>([...all].filter((id) => !high.has(id)));
    for (const id of split.always) small.add(id);
    const webgl = await record(webPayload, small, high);
    const card = godot.data.cards.find((v) => v.id === c.id);
    if (!card) throw Error('缺少 Godot 卡片清单：' + c.id);
    const { fontDependencies: _fontDependencies, ...g } = clone(card);
    delete g.frontAsset;
    delete g.frontVariants;
    const profile = g.exportProfile?.textures || {},
      gAssets = new Set<string>();
    function assetKeys(value: unknown): void {
      if (typeof value === 'string' && godot.texturePaths[value])
        gAssets.add(value);
      else if (Array.isArray(value)) value.forEach(assetKeys);
      else if (value && typeof value === 'object')
        Object.values(value).forEach(assetKeys);
    }
    const withoutProfile = { ...g };
    delete withoutProfile.exportProfile;
    assetKeys(withoutProfile);
    for (const key of [...gAssets] as const)
      if (profile[key]) gAssets.add(profile[key].small.asset);
    if (g.exportProfile)
      g.exportProfile.textures = Object.fromEntries(
        Object.entries(profile).filter(([key]) => gAssets.has(key)),
      );
    const textureObjects: Record<string, string> = {};
    for (const key of gAssets)
      textureObjects[key] = (
        await fileAsset(
          godot.texturePaths[key].slice(6),
          path.join(directory, 'godot'),
        )
      ).slice(7);
    const shaderKeys = new Set<string>();
    function shaderReferences(v: unknown): void {
      if (typeof v === 'string' && godot.shaderPaths[v]) shaderKeys.add(v);
      else if (Array.isArray(v)) v.forEach(shaderReferences);
      else if (v && typeof v === 'object')
        Object.values(v).forEach(shaderReferences);
    }
    shaderReferences(g);
    const shaders: Record<string, string> = {};
    for (const key of shaderKeys)
      shaders[key] = await add(
        await fs.readFile(
          path.join(directory, 'godot', godot.shaderPaths[key].slice(6)),
        ),
        'text/plain',
      );
    const highKeys = new Set<string>();
    for (const v of Object.values(g.exportProfile?.textures || {}))
      if (v.large.asset !== v.small.asset) highKeys.add(v.large.asset);
    const gSmall = new Set<string>(
        Object.entries(textureObjects)
          .filter(([key]) => !highKeys.has(key))
          .map(([, id]) => id),
      ),
      gHigh = new Set<string>([...highKeys].map((key) => textureObjects[key]));
    // Embedded components are independent of the main colour LOD table.
    const componentKeys = new Set<string>();
    function embedded(v: unknown): void {
      if (typeof v === 'string' && textureObjects[v]) componentKeys.add(v);
      else if (Array.isArray(v)) v.forEach(embedded);
      else if (v && typeof v === 'object') Object.values(v).forEach(embedded);
    }
    embedded(g.componentScenes);
    embedded(g.backScene);
    for (const key of componentKeys) gSmall.add(textureObjects[key]);
    const godotSplit = await splitComponents(g);
    const godotRecord = await record(
      { card: godotSplit.card, textureObjects, shaders },
      new Set<string>([...gSmall, ...Object.values(shaders)]),
      gHigh,
    );
    cards.push({
      id: c.id,
      name: c.name,
      bindings: c.bindings,
      webgl,
      godot: godotRecord,
    });
  }
  // Component versions can be requested independently before set_component().
  for (const resource of godot.data.components)
    for (const version of resource.versions) {
      const value = clone(version.value),
        textureObjects: Record<string, string> = {},
        shaders: Record<string, string> = {},
        strings = new Set<string>();
      function scan(v: unknown): void {
        if (typeof v === 'string') strings.add(v);
        else if (Array.isArray(v)) v.forEach(scan);
        else if (v && typeof v === 'object') Object.values(v).forEach(scan);
      }
      scan(value);
      for (const key of strings) {
        if (godot.texturePaths[key])
          textureObjects[key] = (
            await fileAsset(
              godot.texturePaths[key].slice(6),
              path.join(directory, 'godot'),
            )
          ).slice(7);
        if (godot.shaderPaths[key])
          shaders[key] = await add(
            await fs.readFile(
              path.join(directory, 'godot', godot.shaderPaths[key].slice(6)),
            ),
            'text/plain',
          );
      }
      const definition = await addJSON({ value, textureObjects, shaders });
      components.push({
        id: resource.id,
        kind: resource.kind,
        version: version.version,
        definition,
        base: [
          definition,
          ...new Set<string>([
            ...Object.values(textureObjects),
            ...Object.values(shaders),
          ]),
        ],
      });
    }
  const content = {
      schema: 'cardscape-remote/1',
      runtimeVersion: 1,
      name: w.name,
      cards,
      components,
      objects,
    },
    release = hash(json(content)),
    catalog = { ...content, release };
  await fs.writeFile(
    path.join(root, 'catalog.json'),
    JSON.stringify(catalog, null, 2),
  );
  const source = cardDirectory || path.join(directory, 'cards', selected[0].id),
    runtime = path.join(root, 'runtime');
  await fs.mkdir(runtime, { recursive: true });
  for (const name of await fs.readdir(source))
    if (/\.(js|css)$/.test(name) || name === 'index.html')
      await fs.copyFile(path.join(source, name), path.join(runtime, name));
  for (const name of ['workshop-player.css', 'remote-gallery.js'] as const)
    await fs.copyFile(
      path.join(__dirname, '../renderer', name),
      path.join(root, name),
    );
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>远端卡牌资源</title><link rel="stylesheet" href="workshop-player.css"><script defer src="remote-gallery.js"></script></head><body><header><b id="workshop-title">远端卡牌</b><select id="workshop-card" aria-label="远端卡牌"></select><span id="workshop-status">正在加载目录…</span></header><iframe id="workshop-card-player" title="远端卡牌播放器"></iframe></body></html>',
  );
  const client = path.join(directory, 'godot-remote'),
    sdk = SDK;
  await fs.mkdir(path.join(client, 'demo'), { recursive: true });
  await fs.cp(path.join(sdk, 'addons'), path.join(client, 'addons'), {
    recursive: true,
  });
  for (const name of ['remote.gd', 'remote.tscn'] as const)
    await fs.copyFile(
      path.join(sdk, 'demo', name),
      path.join(client, 'demo', name),
    );
  await fs.writeFile(
    path.join(client, 'project.godot'),
    'config_version=5\n[application]\nconfig/name="Cardscape Remote Client"\nrun/main_scene="res://demo/remote.tscn"\n[display]\nwindow/size/viewport_width=600\nwindow/size/viewport_height=900\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
  );
  await fs.cp(path.join(ROOT, 'licenses'), path.join(client, 'licenses'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(client, 'README.txt'),
    '此瘦客户端仅含 SDK 和远端加载示例，不含卡牌图片。运行后填入 HTTPS catalog.json 地址。Android 导出需启用 Internet 权限。完整素材上传 ../remote/，不要把本客户端当成远端内容上传。\n',
  );
  const total = Object.values(objects),
    report = {
      release,
      cards: cards.length,
      objects: total.length,
      rawBytes: total.reduce((n, v) => n + v.bytes, 0),
      downloadBytes: total.reduce((n, v) => n + v.downloadBytes, 0),
      cardsByTier: cards.map((c) => ({
        id: c.id,
        name: c.name,
        webgl: {
          smallBytes: c.webgl.base.reduce(
            (n, id) => n + objects[id].downloadBytes,
            0,
          ),
          extraLargeBytes: c.webgl.detail.reduce(
            (n, id) => n + objects[id].downloadBytes,
            0,
          ),
        },
        godot: {
          smallBytes: c.godot.base.reduce(
            (n, id) => n + objects[id].downloadBytes,
            0,
          ),
          extraLargeBytes: c.godot.detail.reduce(
            (n, id) => n + objects[id].downloadBytes,
            0,
          ),
        },
      })),
    };
  await fs.writeFile(
    path.join(root, 'download-report.json'),
    JSON.stringify(report, null, 2),
  );
  await fs.writeFile(
    path.join(root, 'upload-manifest.json'),
    JSON.stringify(
      {
        catalog: {
          path: 'catalog.json',
          contentType: 'application/json',
          cacheControl: 'no-cache',
        },
        objects: total.map((o) => ({
          path: o.path,
          contentType: 'application/octet-stream',
          cacheControl: 'public,max-age=31536000,immutable',
          contentEncoding: null,
        })),
        cors: {
          methods: ['GET', 'HEAD'],
          allowedOrigins: ['YOUR_GAME_WEB_ORIGIN'],
          exposeHeaders: ['Content-Length', 'ETag'],
        },
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(root, 'README.txt'),
    '将整个 remote/ 目录上传到 OSS 或 CDN，保留相对目录。catalog.json 为入口；对象文件名固定为内容摘要，已下载对象跨卡片与版本复用。JSON / 几何 / 动画按 Gzip 压缩，图片沿用 WebP；不节省的压缩自动跳过。\nWebGL：打开 index.html，或在游戏内使用 CardRemoteAssets。Godot / APK：内置 Cardscape SDK，使用 CardscapeRemote.open(URL) 与 load_card(id)，图片通过 Image 从原始字节加载，无需远端 Godot 导入文件。高清档随缩放按需下载。\nOSS 的对象 Content-Type 使用 application/octet-stream，不设置 Content-Encoding；浏览器与 SDK 自行解压并检查 SHA-256。入口 no-cache，对象 immutable；跨域 WebGL 需允许游戏域名 GET / HEAD。私有 OSS 由业务服务签发临时 URL / 请求头，APK 不保存 OSS AccessKey。详见 upload-manifest.json 与 SDK 文档。\n',
  );
  return {
    directory: root,
    clientDirectory: client,
    release,
    objects: total.length,
  };
}
