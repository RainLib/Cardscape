import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, SDK } from './paths';
import { isRecord } from './validation';
import { exportRemote } from './remote-export';
import type { WorkshopDocument } from '../shared/projects';
import type {
  AssetManifest,
  ExportResource,
  ExportLayer,
  ShaderSettings,
  ComponentValue,
  TextureVariants,
  ExportOptions,
} from '../shared/export';

import {
  workshopModel as W,
  frameModel as F,
  runtimeModel as R,
  cosmeticsModel,
} from './export-models';

function required<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw Error('缺少卡片导出清单');
  return value;
}
// Explicit portable hook boundary. Godot and WebGL do not share shader wrappers.
export function portableBody(body: string) {
  if (
    /\b(gl_|attribute|varying|uniform|sampler|#|texture2D\s*\(|discard)/.test(
      body,
    )
  )
    throw Error(
      'Godot SDK 不支持此 GLSL 函数体；请使用纯数学函数，或在游戏中设置 Godot Shader',
    );
  return body;
}
export async function exportGodot(
  directory: string,
  w: WorkshopDocument,
  manifests: Map<string, AssetManifest>,
  { cardDirectory }: ExportOptions = {},
) {
  const root = path.join(directory, 'godot');
  await fs.mkdir(root, { recursive: true });
  await fs.cp(path.join(SDK, 'addons'), path.join(root, 'addons'), {
    recursive: true,
  });
  await fs.cp(path.join(SDK, 'demo'), path.join(root, 'demo'), {
    recursive: true,
  });
  await fs.cp(path.join(SDK, 'tests'), path.join(root, 'tests'), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.mkdir(path.join(root, 'shaders'), { recursive: true });
  await fs.cp(path.join(ROOT, 'licenses'), path.join(root, 'licenses'), {
    recursive: true,
  });
  const lazyTextures = new Set<string>();
  const texturePaths = new Map<string, string>(),
    shaderPaths = new Map<string, string>(),
    template = await fs.readFile(
      path.join(SDK, 'addons/cardscape/card_surface.gdshader'),
      'utf8',
    );
  async function asset(src: string, base: string) {
    let bytes: Buffer, ext: string;
    if (src.startsWith('data:')) {
      const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(src);
      if (!match) throw Error('Godot 图像编码无效');
      bytes = Buffer.from(match[2], 'base64');
      ext = match[1];
    } else {
      const source = path.resolve(base, src);
      if (!source.startsWith(directory + path.sep))
        throw Error('Godot 素材路径超出导出目录');
      bytes = await fs.readFile(source);
      ext = path.extname(source).slice(1);
    }
    const key = createHash('sha256').update(bytes).digest('hex') + '.' + ext;
    if (!texturePaths.has(key)) {
      await fs.writeFile(path.join(root, 'assets', key), bytes);
      texturePaths.set(key, 'res://assets/' + key);
    }
    return key;
  }
  async function shader(config: ShaderSettings) {
    const key = createHash('sha256')
      .update(
        config.geometryBody +
          '\0' +
          config.fragmentBody +
          '\0' +
          (config.fragmentPrelude || ''),
      )
      .digest('hex');
    if (!shaderPaths.has(key)) {
      const code = template
        .replace(
          '// __FRAGMENT_PRELUDE__',
          portableBody(config.fragmentPrelude || '').replace(/\bt\b/g, 'clock'),
        )
        .replace(
          '// __GEOMETRY__\nreturn q;',
          portableBody(config.geometryBody),
        )
        .replace(
          '// __SURFACE__\nreturn color;',
          portableBody(config.fragmentBody),
        );
      await fs.writeFile(path.join(root, 'shaders', key + '.gdshader'), code);
      shaderPaths.set(key, 'res://shaders/' + key + '.gdshader');
    }
    return key;
  }
  function cleanLayer(layer: ExportLayer) {
    for (const key of [
      'src',
      'master',
      'cutoutMask',
      'ownershipMask',
      'underpaint',
      'splitEdgeOriginal',
    ] as const)
      delete layer[key];
  }
  async function componentAsset(
    raw: unknown,
    base: string,
  ): Promise<ComponentValue | undefined> {
    if (raw === undefined || raw === null) return undefined;
    if (!isRecord(raw)) throw Error('导出组件无效');
    const value = raw as ComponentValue;
    if (!value?.document) return value;
    const result = W.clone(value),
      d = result.document;
    if (!d) return result;
    d.layers = d.layers.filter(
      (l) => !l.previewReference && l.visible !== false,
    );
    for (const l of d.layers) {
      const variant =
          l.titleArt?.variants.find((v) => v.locale === d.locale) ||
          l.titleArt?.variants[0],
        src =
          l.kind === 'text'
            ? (variant
                ? result.titleRasters?.[l.id]?.[variant.locale]
                : undefined) ||
              result.layerRasters?.[l.id] ||
              variant?.src
            : l.src;
      if (src) l.asset = await asset(src, base);
      if (l.ownershipMask)
        l.ownershipAsset = await asset(l.ownershipMask, base);
      if (l.titleArt)
        for (const v of l.titleArt.variants) {
          const raster = result.titleRasters?.[l.id]?.[v.locale] || v.src;
          if (raster) v.rasterAsset = await asset(raster, base);
          delete v.src;
        }
      cleanLayer(l);
    }
    d.maskAssets = {};
    for (const [key, src] of Object.entries(d.masks || {}))
      d.maskAssets[key] = await asset(src, base);
    d.foregroundGeometry = d.foregroundMesh || R.grid();
    delete d.foregroundMesh;
    d.frameStyle = F.resolve(d);
    d.frameGeometry = F.geometry(d.frameStyle);
    d.shader = { ...R.defaults.shader, ...d.shader };
    d.effects = { ...R.defaults.effects, ...d.effects };
    d.shader_key = await shader(d.shader);
    delete result.layerRasters;
    delete result.titleRasters;
    delete d.masks;
    delete d.back;
    delete d.backScene;
    delete d.fonts;
    if (d.particles) d.particles = await particleAsset(d.particles, base);
    return result;
  }
  async function particleAsset(
    value: unknown,
    base: string,
  ): Promise<ComponentValue | undefined> {
    if (value === undefined || value === null) return undefined;
    const p = await componentAsset(value, base);
    if (!p) return p;
    const result = { ...p };
    if (p.sprite) result.sprite = await asset(p.sprite, base);
    return result;
  }
  const cards: AssetManifest[] = [];
  for (const card of w.cards) {
    const doc = cosmeticsModel.resolve(W.resolve(w, card.id)),
      m = W.clone(required(manifests, card.id)),
      base = cardDirectory || path.join(directory, 'cards', card.id);
    for (const k of [
      'cosmetics',
      'cosmeticPreview',
      'effects',
      'spatial',
      'composition',
      'armor',
      'deformation',
      'shader',
      'particles',
      'material',
      'frameStyle',
    ] as const)
      if (doc[k] !== undefined) Object.assign(m, { [k]: W.clone(doc[k]) });
    for (const layer of m.layers) {
      const actual = doc.layers.find((l) => l.id === layer.id);
      if (actual?.spatial) layer.spatial = W.clone(actual.spatial);
    } // Static editor previews are exported beside the workshop; runtime rims are procedural.
    delete m.framePreview;
    m.id = card.id;
    m.foregroundGeometry = doc.foregroundMesh || R.grid();
    m.frameGeometry = F.geometry(F.resolve(doc));
    m.shader_key = await shader({ ...R.defaults.shader, ...doc.shader });
    for (const layer of m.layers) {
      if (
        layer.kind === 'frame' &&
        !doc.layers.find((l) => l.id === layer.id)?.src
      )
        delete layer.asset;
      if (layer.ownershipMask)
        layer.ownershipAsset = await asset(layer.ownershipMask, base);
      if (layer.asset) layer.asset = await asset(layer.asset, base);
      if (layer.titleArt)
        for (const v of layer.titleArt.variants) {
          if (!v.rasterAsset) throw Error('缺少字标栅格：' + v.locale);
          v.rasterAsset = await asset(v.rasterAsset, base);
          delete v.src;
        }
      cleanLayer(layer);
    }
    if (m.exportProfile) {
      const variants: Record<string, TextureVariants> = {};
      for (const [key, v] of Object.entries(m.exportProfile.textures)) {
        const large = { ...v.large, asset: await asset(v.large.asset, base) },
          small = { ...v.small, asset: await asset(v.small.asset, base) };
        variants[large.asset] = { ...v, large, small };
        lazyTextures.add(large.asset);
        lazyTextures.add(small.asset);
      }
      m.exportProfile.textures = variants;
    }
    if (m.particles) m.particles = await particleAsset(m.particles, base);
    if (m.material) m.material = await componentAsset(m.material, base);
    const scenes = m.componentScenes;
    if (scenes)
      for (const [kind, value] of Object.entries(scenes)) {
        const converted =
          kind === 'material'
            ? m.material
            : kind === 'particles'
              ? m.particles
              : await componentAsset(value, base);
        if (converted) scenes[kind] = converted;
        else delete scenes[kind];
      }
    if (m.backAsset) m.backAsset = await asset(m.backAsset, base);
    if (m.backScene) {
      const back = await componentAsset(m.backScene, base);
      if (!back) throw Error('缺少卡背组件');
      m.backScene = back;
      back.src = m.backAsset;
      for (const l of back.layers || []) l.src = await asset(l.src, base);
    }
    m.maskAssets = {};
    for (const name of m.masks)
      m.maskAssets[name] = await asset(
        required(manifests, card.id).maskAssets?.[name] ||
          'masks/' + name + '.png',
        base,
      );
    delete m.foregroundMesh;
    delete m.shaderAssets;
    cards.push(m);
  }
  const components: ExportResource[] = [];
  for (const resource of W.clone(w.resources)) {
    const exported: ExportResource = { ...resource, versions: [] };
    components.push(exported);
    for (const v of resource.versions) {
      const value =
        resource.kind === 'particles'
          ? await particleAsset(v.value, directory)
          : await componentAsset(v.value, directory);
      if (!value) throw Error('共享组件缺少内容');
      exported.versions.push({ ...v, value });
      if (value.src) value.src = await asset(value.src, directory);
      if (resource.kind === 'back' && value.layers)
        for (const l of value.layers) l.src = await asset(l.src, directory);
      if (resource.kind === 'frame') value.geometry = F.geometry(value.style);
      if (resource.kind === 'effect')
        value.shader_key = await shader({ ...R.defaults.shader, ...value });
    }
  }
  const data = {
    schema: 'cardscape-library/1',
    name: w.name,
    activeCardId: w.activeCardId,
    cards,
    components,
  };
  let resource =
    '[gd_resource type="Resource" script_class="CardscapeLibrary" load_steps=' +
    String(2 + texturePaths.size - lazyTextures.size + shaderPaths.size) +
    ' format=3]\n\n[ext_resource type="Script" path="res://addons/cardscape/cardscape_library.gd" id="1"]\n';
  let n = 2;
  const textures = [],
    shaders = [];
  const lazyPaths: Record<string, string> = {};
  for (const [key, file] of texturePaths) {
    if (lazyTextures.has(key)) {
      lazyPaths[key] = file;
      continue;
    }
    const id = String(n++);
    resource +=
      '[ext_resource type="Texture2D" path=' +
      JSON.stringify(file) +
      ' id=' +
      JSON.stringify(id) +
      ']\n';
    textures.push(
      JSON.stringify(key) + ': ExtResource(' + JSON.stringify(id) + ')',
    );
  }
  for (const [key, file] of shaderPaths) {
    const id = String(n++);
    resource +=
      '[ext_resource type="Shader" path=' +
      JSON.stringify(file) +
      ' id=' +
      JSON.stringify(id) +
      ']\n';
    shaders.push(
      JSON.stringify(key) + ': ExtResource(' + JSON.stringify(id) + ')',
    );
  }
  resource +=
    '\n[resource]\nscript = ExtResource("1")\ndata_json = ' +
    JSON.stringify(JSON.stringify(data)) +
    '\ntextures = {\n' +
    textures.join(',\n') +
    '\n}\ntexture_paths = ' +
    JSON.stringify(lazyPaths) +
    '\nshaders = {\n' +
    shaders.join(',\n') +
    '\n}\n';
  await fs.writeFile(path.join(root, 'library.tres'), resource);
  await fs.writeFile(
    path.join(root, 'project.godot'),
    'config_version=5\n[application]\nconfig/name="Cardscape SDK Preview"\nrun/main_scene="res://demo/main.tscn"\n[display]\nwindow/size/viewport_width=960\nwindow/size/viewport_height=900\n[rendering]\nrenderer/rendering_method="gl_compatibility"\ntextures/default_filters/use_nearest_mipmap_filter=false\n',
  );
  await fs.copyFile(path.join(SDK, 'README.md'), path.join(root, 'README.md'));
  const remote = await exportRemote(
    directory,
    w,
    manifests,
    {
      data,
      texturePaths: Object.fromEntries(texturePaths),
      shaderPaths: Object.fromEntries(shaderPaths),
    },
    { cardDirectory },
  );
  return {
    directory: root,
    cards: cards.length,
    components: components.length,
    textures: texturePaths.size,
    shaderCount: shaderPaths.size,
    ...(remote ? { remote } : {}),
  };
}
