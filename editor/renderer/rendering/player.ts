import PlayerModel from './player-model.ts';
import PlayerTextures from './player-textures.ts';
import type { PreviewAPI } from '../../shared/preview';
import type { TextureAsset } from '../../shared/export';
import type { CardLayer } from '../../shared/document';
import type { TextureVariants } from '../../shared/export';
interface PlayerTextureEntry {
  asset: string;
  layer?: CardLayer;
  back?: boolean;
  sprite?: boolean;
  variants?: TextureVariants;
}
import CardRemoteAssets from './remote-assets.ts';
import CardTitle from '../editing/title-model.ts';
import CardAdaptiveTextures from './adaptive-textures.ts';
import CardExportProfile from './export-profile.ts';
(async () => {
  'use strict';
  const cardPreview = (window as unknown as { cardPreview: PreviewAPI })
    .cardPreview;
  let remote: ReturnType<typeof CardRemoteAssets.create> | null = null;
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw Error('播放器缺少控件：' + id);
    return el as T;
  };
  const image = async (src: string) => {
    src = remote ? await remote.resolve(src) : src;
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(Error('素材载入失败：' + src));
      im.src = src;
    });
  };
  try {
    let content: Record<string, unknown> | null = null;
    const query =
      typeof location === 'object'
        ? new URLSearchParams(location.search)
        : null;
    if (query?.get('catalog')) {
      remote = CardRemoteAssets.create({
        progress: (s) => {
          Object.assign(document.body.dataset, {
            remoteRequests: String(s.requests),
            remoteCacheHits: String(s.cacheHits),
            remoteBytes: String(s.downloadedBytes),
            remoteStage: s.stage,
          });
          $('player-status').textContent =
            '远端资源 · 下载 ' +
            Math.ceil(s.downloadedBytes / 1024) +
            ' KB · 命中缓存 ' +
            s.cacheHits;
        },
      });
      window.addEventListener('pagehide', () => remote?.close(), {
        once: true,
      });
      await remote.open(new URL(query.get('catalog')!, location.href).href);
      content = await remote.loadCard(query.get('card') || '');
    }
    const manifest = PlayerModel.manifest(
      content?.manifest || (await (await fetch('manifest.json')).json()),
    );
    const [actions, slots, vs, fs] = content
      ? [content.actions, content.slots, content.vertex, content.fragment]
      : await Promise.all([
          fetch('actions.json').then((r) => r.json()),
          fetch('slots.json').then((r) => r.json()),
          fetch(manifest.shaderAssets?.vertex || 'shaders/card.vert.glsl').then(
            (r) => r.text(),
          ),
          fetch(
            manifest.shaderAssets?.fragment || 'shaders/card.frag.glsl',
          ).then((r) => r.text()),
        ]);
    let foregroundMesh =
      content?.foregroundMesh ||
      (manifest.foregroundMesh
        ? await (await fetch(manifest.foregroundMesh)).json()
        : null);
    if (!foregroundMesh) {
      const positions = [],
        uv = [],
        indices = [],
        n = 40;
      for (let y = 0; y <= n; y++)
        for (let x = 0; x <= n; x++) {
          positions.push(x / n - 0.5, 0.75 - (y / n) * 1.5, 0);
          uv.push(x / n, y / n);
        }
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const a = y * (n + 1) + x;
          indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      foregroundMesh = { positions, uv, indices };
    }
    const doc = PlayerModel.document(
      { ...manifest, previewMode: 'authored' },
      actions,
      slots,
      foregroundMesh,
    );
    if (remote)
      for (const action of doc.actions)
        for (const event of action.audioEvents || [])
          event.src = await remote.resolve(event.src);
    doc.effects.paused = true;
    cardPreview.setDocument(doc);
    let textures: ReturnType<typeof textureLoader>;
    const variants = manifest.exportProfile?.textures || {};
    const entries = (level: string): PlayerTextureEntry[] =>
      doc.layers
        .filter((l) => l.asset)
        .map((layer): PlayerTextureEntry => {
          const v = layer.titleArt
              ? CardTitle.resolve(layer, doc.locale)
              : null,
            asset = v?.rasterAsset || layer.asset || '';
          return { layer, asset, variants: variants[asset] };
        })
        .concat(
          doc.back
            ? [{ back: true, asset: doc.back }]
            : manifest.backAsset
              ? [
                  {
                    back: true,
                    asset: manifest.backAsset,
                    variants: variants[manifest.backAsset],
                  },
                ]
              : [],
        )
        .concat(
          remote &&
            doc.particles?.sprite?.startsWith('@asset:') &&
            CardExportProfile.effects(
              manifest.exportProfile?.settings,
              level === 'small' ? 'small' : 'large',
            ).particles
            ? [{ asset: doc.particles.sprite, sprite: true }]
            : [],
        );
    function registered(
      entry: PlayerTextureEntry,
      _variant: TextureAsset,
      im: HTMLImageElement,
    ) {
      return PlayerTextures.registered(
        entry.layer,
        im,
        entry.variants?.sourceSize,
      );
    }
    function textureLoader() {
      return CardAdaptiveTextures.create({
        entries,
        load: image,
        apply(batch, level) {
          cardPreview.beginUpdate();
          try {
            const sprite = batch.find((item) => item.entry.sprite);
            if (sprite && doc.particles) {
              doc.particles = {
                ...doc.particles,
                sprite: sprite.image.currentSrc || sprite.image.src,
              };
              cardPreview.setDocument(doc);
            }
            for (const { entry, variant, image: im } of batch) {
              if (entry.sprite) continue;
              if (entry.back) {
                cardPreview.setTexture('art_back', im);
                continue;
              }
              const l = entry.layer;
              if (!l) continue;
              const picture = registered(entry, variant, im);
              if (l.kind === 'foreground')
                cardPreview.setTexture('pop_foreground', picture);
              else if (l.kind === 'background')
                cardPreview.setTexture('snap_background', picture);
              else if (l.kind === 'text') cardPreview.setText(l, picture);
              else if (l.kind === 'image') cardPreview.addImage(l, picture);
            }
          } finally {
            cardPreview.endUpdate();
          }
          document.body.dataset.textureLevel = level;
          $('player-detail').textContent =
            level === 'small' ? '已加载小图' : '已加载高清';
          cardPreview.setTextureDetail(level);
        },
        status(s) {
          document.body.dataset.textureLoading = String(s.loading);
          if (s.error) {
            document.body.dataset.textureError = s.error;
            $('player-status').textContent =
              '素材载入失败，保留上一档：' + s.error;
          } else delete document.body.dataset.textureError;
        },
      });
    }
    textures = textureLoader();
    window.addEventListener('atelier-detail-change', (e: Event) => {
      if (
        e instanceof CustomEvent &&
        e.detail &&
        (e.detail.level === 'small' || e.detail.level === 'large')
      )
        void textures.set(e.detail.level).catch((error) => {
          $('player-status').textContent =
            error instanceof Error
              ? error instanceof Error
                ? error.message
                : String(error)
              : String(error);
        });
    });
    const initialTier = () =>
      CardExportProfile.tier(
        manifest.exportProfile?.settings,
        CardExportProfile.projectedWidth(
          document.getElementById('author-model-canvas')?.clientWidth ||
            innerWidth,
          document.getElementById('author-model-canvas')?.clientHeight ||
            Math.max(1, innerHeight - 100),
          1,
          1,
          doc.spatial?.cameraDistance || 2.7,
          devicePixelRatio,
        ),
      );
    await textures.set(initialTier());
    const titleLayers = doc.layers.filter((l) => l.titleArt);
    async function showLocale(locale: string) {
      doc.locale = locale;
      cardPreview.setDocument(doc);
      $<HTMLSelectElement>('player-locale').value = locale;
      textures.dispose();
      textures = textureLoader();
      await textures.set(document.body.dataset.textureLevel || initialTier());
    }
    const locales = [
      ...new Set<string>([
        doc.locale,
        ...titleLayers.flatMap((l) =>
          (l.titleArt?.variants || []).map((v) => v.locale),
        ),
      ]),
    ];
    for (const code of locales)
      $<HTMLSelectElement>('player-locale').add(
        new Option(
          code === 'zh-CN' ? '中文' : code === 'en' ? 'English' : code,
          code,
        ),
      );
    $<HTMLSelectElement>('player-locale').value = doc.locale;
    $<HTMLSelectElement>('player-locale').onchange = () =>
      showLocale($<HTMLSelectElement>('player-locale').value).catch(
        (e) =>
          ($('player-status').textContent =
            e instanceof Error ? e.message : String(e)),
      );
    if (manifest.masks) {
      for (const id of manifest.masks) {
        const im = await image(
            manifest.maskAssets?.[id] || 'masks/' + id + '.png',
          ),
          c = document.createElement('canvas');
        c.width = 1024;
        c.height = 1536;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw Error('无法创建 Mask 画布');
        ctx.drawImage(im, 0, 0, 1024, 1536);
        cardPreview.updateMask(id, ctx.getImageData(0, 0, 1024, 1536));
      }
    }
    cardPreview.compileSources(PlayerModel.text(vs), PlayerModel.text(fs));
    $<HTMLInputElement>('player-zoom').oninput = () => {
      cardPreview.setZoom(
        Number($<HTMLInputElement>('player-zoom').value) / 100,
      );
      $('player-zoom-value').textContent =
        $<HTMLInputElement>('player-zoom').value + '%';
    };
    $('card-name').textContent = manifest.name || 'GLSL 卡片';
    for (const a of doc.actions)
      $<HTMLSelectElement>('player-action').add(new Option(a.name, a.id));
    document
      .querySelectorAll<HTMLButtonElement>('[data-pose]')
      .forEach(
        (b) => (b.onclick = () => cardPreview.pose(Number(b.dataset.pose))),
      );
    $('player-audio').onclick = async () => {
      const enabled = await cardPreview.setAudioEnabled(
        !cardPreview.getAudioState().enabled,
      );
      $('player-audio').textContent = enabled ? '静音' : '启用音效';
      if (!enabled && cardPreview.getAudioState().error)
        $('player-status').textContent = cardPreview.getAudioState().error;
    };
    window.addEventListener('pagehide', () => cardPreview.dispose(), {
      once: true,
    });
    $('player-play').onclick = () => {
      cardPreview.playAction($<HTMLSelectElement>('player-action').value);
      $('player-pause').textContent = '暂停';
    };
    $('player-pause').onclick = () => {
      doc.effects.paused = cardPreview.setPaused(!cardPreview.getView().paused);
      $('player-pause').textContent = doc.effects.paused ? '播放' : '暂停';
    };
    const revealButton = $('player-reveal');
    revealButton.hidden = ![
      doc.particles,
      doc.componentScenes?.particles,
      doc.componentScenes?.particles?.document?.particles,
    ].some(PlayerModel.reveals);
    revealButton.onclick = () => {
      cardPreview.replayParticles();
      doc.effects.paused = cardPreview.setPaused(false);
      $('player-pause').textContent = '暂停';
    };
    cardPreview.replayParticles();
    doc.effects.paused = cardPreview.setPaused(false);
    const enter = doc.actions.find((a) => a.event === 'enter');
    if (enter) {
      $<HTMLSelectElement>('player-action').value = enter.id;
      cardPreview.playAction(enter.id);
    }
    $('player-status').textContent =
      '已编译导出 GLSL · ' +
      doc.actions.length +
      ' 个动作 · ' +
      doc.slots.length +
      ' 个 Slot · 拖动旋转查看';
    document.body.dataset.ready = 'true';
    cardPreview.setActive(true);
  } catch (error) {
    $('player-status').textContent =
      '载入失败：' + (error instanceof Error ? error.message : String(error));
    document.body.dataset.error =
      error instanceof Error ? error.message : String(error);
  }
})();
