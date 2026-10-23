import type { CardDocument } from '../../shared/document';
import type { WorkshopDocument, ResourceKind } from '../../shared/projects';
import type {
  WorkshopValue,
  StartAsset,
  AssetOutput,
} from '../../shared/workshop';
import type { ImageResource } from '../../shared/visual-components';
/* Component drafts share the card authoring document, never its front-card state. */
import importedCardWorkshop from './workshop-model.ts';
import importedCardRuntime from '../rendering/runtime-model.ts';
import importedCardBack from './back-asset-model.ts';
import importedCardComponents from './component-model.ts';

const api = (() => {
  'use strict';
  function documentFor(
    asset: WorkshopValue,
    blank: CardDocument | undefined,
    name: string,
    id: string,
    kind = 'back',
  ): CardDocument {
    if (!importedCardWorkshop.kinds[kind]) throw Error('组件分类无效');
    if (asset?.document) {
      // Persisted source documents are checked when the project graph is loaded.
      const d = importedCardWorkshop.clone(asset.document) as CardDocument;
      d.id = id;
      d.name = name;
      d.assetKind = kind;
      if (kind === 'frame') {
        const f = d.layers.find((l) => l.kind === 'frame');
        if (f) f.locked = false;
      }
      delete d.backScene;
      delete d.componentScenes;
      return importedCardRuntime.ensure(d);
    }
    if (!blank) throw Error('组件缺少编辑文档模板');
    const d = importedCardWorkshop.clone(blank);
    d.id = id;
    d.name = name;
    d.assetKind = kind;
    delete d.backScene;
    delete d.componentScenes;
    delete d.layerTree;
    for (const l of d.layers)
      if (l.kind === 'foreground') l.name = '效果母版 · 待导入';
    if (kind === 'back') {
      const layers = importedCardBack.layers(asset as Partial<ImageResource>);
      if (layers.length)
        d.layers = layers
          .slice()
          .reverse()
          .map((l, i) => ({
            id: l.id,
            name: l.name,
            kind: i === 0 ? 'foreground' : 'image',
            src: l.src,
            ...(i === 0 ? { master: l.src } : {}),
            x: l.x,
            y: l.y,
            scale: l.scale,
            opacity: l.opacity,
            visible: l.visible,
            locked: false,
            blend: l.blend,
            adjustments: asset.adjustments,
            spatial: {
              role: i === 0 ? 'body' : 'surface',
              z: l.depth * (asset.parallax ?? 1),
              clip: true,
            },
          }));
      d.material = {
        ...importedCardBack.create().material,
        ...asset.material,
        target: 'both',
      };
    } else {
      for (const l of d.layers) l.visible = false;
      if (kind === 'base' && asset.src) {
        const l = d.layers.find((l) => l.kind === 'foreground');
        if (!l) throw Error('组件模板缺少主体图层');
        Object.assign(l, {
          src: asset.src,
          master: asset.src,
          name: importedCardWorkshop.kinds[kind] + '主体',
          visible: true,
          adjustments: asset.adjustments,
          sourceWindow: asset.sourceWindow,
          spatial: { role: 'body', z: 0, clip: true },
        });
      } else if (kind === 'frame') {
        importedCardWorkshop.apply(
          d,
          kind as ResourceKind,
          asset as import('../../shared/workshop').ResourceValues[ResourceKind],
        );
        const frame = d.layers.find((l) => l.kind === 'frame');
        if (!frame) throw Error('组件模板缺少卡框图层');
        frame.visible = true;
        frame.locked = false;
      } else if (['material', 'particles', 'effect'].includes(kind)) {
        importedCardWorkshop.apply(
          d,
          kind as ResourceKind,
          asset as import('../../shared/workshop').ResourceValues[ResourceKind],
        );
        if (kind === 'particles') {
          d.particles = importedCardComponents.particles({
            ...d.particles,
            enabled: asset.enabled ?? true,
          });
          const f = d.layers.find((l) => l.kind === 'frame');
          if (!f) throw Error('组件模板缺少卡框图层');
          f.visible = true;
          f.previewReference = true;
        }
        if (kind !== 'particles') {
          const l = d.layers.find((l) => l.kind === 'background');
          if (!l) throw Error('组件模板缺少预览背景图层');
          l.visible = true;
          l.previewReference = true;
          l.name = '预览参考 · 当前背景';
        }
      }
    }
    d.composition = { top: false, right: false, bottom: false, left: false };
    d.effects = { ...d.effects, cape: false, flow: kind === 'effect' };
    d.armor = { ...importedCardRuntime.armorDefaults };
    d.actions = [
      {
        id: 'idle',
        name: '组件待机',
        event: 'idle',
        duration: 4,
        loop: true,
        motion: 1,
        emission: 1,
        bend: 0,
      },
    ];
    return importedCardRuntime.ensure(d);
  }
  function start(
    workshop: WorkshopDocument,
    {
      resourceId = '',
      version = 0,
      blank,
      name,
      kind = 'back',
      value = null,
    }: StartAsset,
  ) {
    const next = importedCardWorkshop.clone(workshop);
    if (next.editingAsset)
      next.assetDrafts = {
        ...next.assetDrafts,
        [next.editingAsset.key]: next.editingAsset,
      };
    const r = resourceId
      ? importedCardWorkshop.resource(next, resourceId)
      : null;
    const resolvedKind = r?.kind || kind;
    if (!Object.hasOwn(importedCardWorkshop.kinds, resolvedKind))
      throw Error('组件分类无效');
    kind = resolvedKind as ResourceKind;
    if (!importedCardWorkshop.kinds[kind]) throw Error('组件分类无效');
    if (!r && !blank?.id) throw Error('新资产需要独立文档 ID');
    const selected = version || r?.versions.at(-1)?.version || 0,
      key = resourceId ? resourceId + '@' + selected : blank!.id!;
    const saved = next.assetDrafts?.[key];
    next.editingAsset = saved
      ? importedCardWorkshop.clone(saved)
      : {
          key,
          kind,
          resourceId,
          version: selected,
          baseVersion: r?.versions.at(-1)?.version || 0,
          name:
            r?.name || name || importedCardWorkshop.kinds[kind] + ' · 新组件',
          document: documentFor(
            r
              ? importedCardWorkshop.version(next, {
                  resourceId,
                  version: selected,
                }).value
              : value || {},
            blank,
            r?.name || name || importedCardWorkshop.kinds[kind] + ' · 新组件',
            'asset-' + key.replace(/@/g, '-'),
            kind,
          ),
        };
    return next;
  }
  function leave(workshop: WorkshopDocument) {
    const next = importedCardWorkshop.clone(workshop);
    if (next.editingAsset) {
      next.assetDrafts = {
        ...next.assetDrafts,
        [next.editingAsset.key]: next.editingAsset,
      };
      delete next.editingAsset;
    }
    return next;
  }
  function pack(
    doc: CardDocument,
    output: AssetOutput,
    kind = doc.assetKind || 'back',
  ): WorkshopValue {
    if (!importedCardWorkshop.kinds[kind]) throw Error('组件分类无效');
    const document = importedCardWorkshop.clone(doc);
    delete document.backScene;
    delete document.componentScenes;
    document.assetKind = kind;
    const metadata = {
      document,
      layerRasters: output.layerRasters,
      titleRasters: output.titleRasters,
    };
    if (kind !== 'back') {
      if (kind === 'base') return { src: output.front, ...metadata };
      return {
        ...importedCardWorkshop.capture(doc, kind as ResourceKind),
        ...metadata,
      };
    }
    const layers = doc.layers
      .slice()
      .reverse()
      .map((l) => ({
        id: l.id,
        name: l.name,
        src: output.layerRasters[l.id] || l.src,
        depth: Math.max(0, Math.min(0.25, l.spatial?.z || 0)),
        x: Math.max(-2048, Math.min(2048, l.x)),
        y: Math.max(-3072, Math.min(3072, l.y)),
        scale: Math.max(0.1, Math.min(4, l.scale)),
        opacity: l.opacity,
        visible: l.visible,
        blend: l.blend || 'normal',
      }))
      .filter(
        (l): l is typeof l & { src: string } =>
          typeof l.src === 'string' && !!l.src,
      );
    const value = {
      schema: 'card-back/1',
      src: output.front,
      parallax: 1,
      material: {
        ...importedCardBack.create().material,
        ...doc.material,
        target: 'back',
      },
      layers,
      ...metadata,
    };
    importedCardBack.validate(value);
    return value;
  }
  function publish(
    workshop: WorkshopDocument,
    value: WorkshopValue,
    id: string,
  ) {
    if (!workshop.editingAsset) throw Error('请先打开组件');
    const e = workshop.editingAsset;
    if (
      e.resourceId &&
      importedCardWorkshop.resource(workshop, e.resourceId).versions.at(-1)
        ?.version !== e.baseVersion
    )
      throw Error('组件已有新版本，请重新打开后发布');
    const result = importedCardWorkshop.publish(workshop, {
        kind: e.kind as ResourceKind,
        name: e.document.name,
        value,
        id,
        resourceId: e.resourceId || undefined,
      }),
      next = result.workshop;
    importedCardWorkshop.resource(next, result.resourceId).name =
      e.document.name;
    const current = next.editingAsset;
    if (!current) throw Error('组件草稿已变化');
    const oldKey = current.key;
    next.editingAsset = {
      ...current,
      resourceId: result.resourceId,
      version: result.version,
      baseVersion: result.version,
      key: result.resourceId + '@' + result.version,
    };
    if (next.assetDrafts) delete next.assetDrafts[oldKey];
    return { ...result, workshop: next };
  }
  return { documentFor, start, leave, pack, publish };
})();

export default api;
