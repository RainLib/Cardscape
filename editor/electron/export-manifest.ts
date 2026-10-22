import fs from 'node:fs/promises';
import { isRecord } from './validation';
import type { AssetManifest } from '../shared/export';
import type Profile from '../renderer/rendering/export-profile';
const profileModel: typeof Profile = require('../renderer/export-profile.js');

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((v: unknown) => typeof v === 'string')
  );
}
function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}
const nullableString = (value: unknown) =>
  value === null || optionalString(value);
function asset(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.asset === 'string' &&
    (value.width === undefined || typeof value.width === 'number') &&
    (value.height === undefined || typeof value.height === 'number')
  );
}
function variants(value: unknown) {
  return isRecord(value) && asset(value.small) && asset(value.large);
}
function component(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !nullableString(value.src) ||
    !optionalString(value.sprite)
  )
    return false;
  if (
    value.layers !== undefined &&
    (!Array.isArray(value.layers) ||
      !value.layers.every(
        (l: unknown) =>
          isRecord(l) && typeof l.id === 'string' && typeof l.src === 'string',
      ))
  )
    return false;
  return true;
}
/** Read our generated manifest, never treat arbitrary JSON.parse output as an API.
 * Source documents/rigs have already passed project validation before export;
 * verify the encoded containers and asset references used by subsequent stages. */
export function parseAssetManifest(value: unknown): AssetManifest {
  if (
    !isRecord(value) ||
    value.schema !== 'card-atelier-assets/1' ||
    typeof value.name !== 'string' ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    !Array.isArray(value.layers) ||
    !strings(value.masks) ||
    !Array.isArray(value.fontDependencies)
  )
    throw Error('导出清单格式无效');
  for (const layer of value.layers as unknown[]) {
    if (
      !isRecord(layer) ||
      typeof layer.id !== 'string' ||
      typeof layer.name !== 'string' ||
      !['image', 'foreground', 'background', 'text', 'frame'].includes(
        String(layer.kind),
      ) ||
      !['x', 'y', 'scale', 'opacity'].every(
        (key) => typeof layer[key] === 'number',
      ) ||
      !optionalString(layer.asset) ||
      !optionalString(layer.cutoutMaskAsset)
    )
      throw Error('导出清单图层无效');
    if (layer.titleArt !== undefined) {
      const art = layer.titleArt;
      if (
        !isRecord(art) ||
        !Array.isArray(art.variants) ||
        !art.variants.every(
          (v: unknown) =>
            isRecord(v) &&
            typeof v.locale === 'string' &&
            typeof v.text === 'string' &&
            optionalString(v.rasterAsset) &&
            optionalString(v.src),
        )
      )
        throw Error('导出清单字标无效');
    }
  }
  for (const dependency of value.fontDependencies as unknown[])
    if (
      !isRecord(dependency) ||
      typeof dependency.layerId !== 'string' ||
      typeof dependency.family !== 'string' ||
      !(dependency.locale === null || typeof dependency.locale === 'string') ||
      !(
        dependency.portableRaster === null ||
        typeof dependency.portableRaster === 'string'
      ) ||
      !(dependency.embedded === null || typeof dependency.embedded === 'string')
    )
      throw Error('导出清单字体无效');
  if (!optionalString(value.frontAsset)) throw Error('导出清单素材引用无效');
  for (const key of ['backAsset', 'foregroundMesh'] as const)
    if (!nullableString(value[key])) throw Error('导出清单素材引用无效');
  for (const key of ['maskAssets', 'shaderAssets', 'bakedAssets'] as const)
    if (
      value[key] !== undefined &&
      (!isRecord(value[key]) ||
        !Object.values(value[key]).every((v) => typeof v === 'string'))
    )
      throw Error('导出清单素材映射无效');
  if (
    value.shaderAssets !== undefined &&
    (!isRecord(value.shaderAssets) ||
      typeof value.shaderAssets.vertex !== 'string' ||
      typeof value.shaderAssets.fragment !== 'string')
  )
    throw Error('导出清单 Shader 引用无效');
  if (value.framePreview !== undefined) {
    const preview = value.framePreview;
    if (
      !isRecord(preview) ||
      typeof preview.asset !== 'string' ||
      typeof preview.time !== 'number' ||
      !isRecord(preview.bounds)
    )
      throw Error('导出清单预览无效');
    const bounds = preview.bounds;
    if (
      !['x', 'y', 'width', 'height'].every((k) => typeof bounds[k] === 'number')
    )
      throw Error('导出清单预览无效');
  }
  if (value.frontVariants !== undefined && !variants(value.frontVariants))
    throw Error('导出清单纹理变体无效');
  if (value.exportProfile !== undefined) {
    const profile = value.exportProfile;
    if (
      !isRecord(profile) ||
      profile.schema !== 'card-export-profile/1' ||
      !isRecord(profile.settings) ||
      !isRecord(profile.textures) ||
      !Object.values(profile.textures).every(variants)
    )
      throw Error('导出清单纹理变体无效');
    profileModel.validate(profile.settings);
  }
  for (const key of ['particles', 'material', 'backScene'] as const)
    if (value[key] !== undefined && !component(value[key]))
      throw Error('导出清单组件无效');
  if (
    value.componentScenes !== undefined &&
    (!isRecord(value.componentScenes) ||
      !Object.values(value.componentScenes).every(component))
  )
    throw Error('导出清单组件无效');
  return value as unknown as AssetManifest;
}
export async function readAssetManifest(file: string): Promise<AssetManifest> {
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  return parseAssetManifest(value);
}
