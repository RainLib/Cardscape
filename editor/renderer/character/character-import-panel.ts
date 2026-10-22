import importedCardSpineImport from './spine-import-model.ts';
import importedCardSpineAtlas from './spine-atlas-model.ts';
import importedCardCharacterImport from './character-import-registry.ts';
import { element } from '../core/dom.ts';
import type { CharacterPanelBindings } from '../../shared/character-panels';
import type { CharacterPanelState } from '../../shared/character-editor';
import type { CardDocument } from '../../shared/document';
import type { SpineSource, SpineOptions } from '../../shared/spine';
import type { CharacterPanelElements } from '../../shared/character-elements';

/* Explicit local JSON/atlas/page selection, reviewed before an atomic undoable import. */
(() => {
  'use strict';
  const bindings = window as unknown as CharacterPanelBindings,
    host = bindings.cardEditorHost,
    S = importedCardSpineImport,
    A = importedCardSpineAtlas,
    $ = <K extends keyof CharacterPanelElements>(id: K) =>
      element<CharacterPanelElements[K]>(id),
    registry = importedCardCharacterImport.createRegistry(
      host.validateDocument,
    );
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  let source: SpineSource | null = null,
    captured: (CharacterPanelState & { document: CardDocument }) | null = null,
    review: SpineOptions | null = null,
    atlas: ReturnType<typeof A.parse> | null = null,
    atlasImages = new Map<string, ImageData>(),
    loading = false;
  const button = document.createElement('button');
  button.id = 'spine-import-open';
  button.textContent = '导入 Spine JSON…';
  $('rig-import').after(button);
  function picker(accept: string, label: string, multiple = false) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    input.setAttribute('aria-label', label);
    document.body.append(input);
    return input;
  }
  const file = picker('.json', 'Spine JSON 文件'),
    assets = picker(
      '.atlas,.txt,.png,.jpg,.jpeg,.webp',
      'Spine 图集与页图片',
      true,
    );
  const dialog = document.createElement('dialog');
  dialog.id = 'spine-import-dialog';
  dialog.innerHTML = `<header><b>Spine JSON → 自有人物动画</b><button id="spine-import-close" aria-label="关闭 Spine 导入">×</button></header><p class="panel-note">支持 JSON 3.8 / 4.0–4.3。替换骨架与人物动作，保留纯整卡动作、现有图片和 Mask。可加载本地图集并新增图片，或映射已有注册图片。FFD 在权重蒙皮前应用；附件切换保留为可见性轨道。不支持的内容会阻止应用。</p><div class="button-row"><button id="spine-atlas-open">加载图集与页图片…</button><button id="spine-fit">适合卡片</button><span id="spine-atlas-status" role="status">未加载图集 · 使用已有图片映射</span></div><div class="button-row"><label>Skin <select id="spine-skin" aria-label="Spine Skin"></select></label><label>缩放 <input id="spine-scale" aria-label="Spine 导入缩放" type="number" min=".0001" max="100" step="any" value="1"></label><label>原点 X <input id="spine-origin-x" aria-label="Spine 原点 X" type="number" value="512" min="-4096" max="4096" step="any"></label><label>原点 Y <input id="spine-origin-y" aria-label="Spine 原点 Y" type="number" value="768" min="-4096" max="4096" step="any"></label><label><input id="spine-loop" type="checkbox">导入动作为循环</label></div><div id="spine-map" aria-label="Spine 图片映射"></div><pre id="spine-import-report" role="status">先检查图片映射与坐标，再点击检查。</pre><div class="button-row"><button id="spine-check">检查导入</button><button id="spine-apply" disabled>应用导入 · 可撤销</button></div>`;
  document.body.append(dialog);
  const invalidate = () => {
    review = null;
    $('spine-apply').disabled = true;
  };
  dialog.addEventListener('input', invalidate);
  dialog.addEventListener('change', invalidate);
  function checkCurrent() {
    const now = host.state();
    if (!captured || !now.document) throw Error('请先选择文件并打开有效工程');
    if (
      now.busy ||
      now.documentToken !== captured.documentToken ||
      now.revision !== captured.revision
    )
      throw Error('工程已变化或正忙，请关闭后重新选择文件检查');
    return { ...now, document: now.document };
  }
  function mappings() {
    if (!source || !captured) return;
    invalidate();
    $('spine-map').replaceChildren();
    for (const slot of S.entries(source, $('spine-skin').value)) {
      const row = document.createElement('div');
      row.className = 'spine-map-row';
      row.dataset.slot = slot.name;
      const label = document.createElement('label');
      label.textContent = slot.name + ' → ';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Spine 图片 ' + slot.name);
      select.add(new Option('请选择图片', ''));
      if (atlas) select.add(new Option('图集 · 新增独立图片', '@atlas'));
      const layers = captured.document.layers.filter(
        (l) => ['foreground', 'image'].includes(l.kind) && !l.previewReference,
      );
      for (const l of layers)
        select.add(new Option(l.name + (l.locked ? ' · 已锁定' : ''), l.id));
      const matches = layers.filter(
        (l) => l.id === slot.name || l.name === slot.name,
      );
      select.value = atlas
        ? '@atlas'
        : matches.length === 1
          ? matches[0].id
          : '';
      label.append(select);
      row.append(label);
      for (const [i, name] of ['UV X', 'UV Y', 'UV 宽', 'UV 高'].entries()) {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String([0, 0, 1024, 1536][i]);
        input.dataset.uv = String(i);
        input.setAttribute('aria-label', slot.name + ' ' + name);
        input.title = name;
        input.disabled = select.value === '@atlas';
        row.append(input);
      }
      select.onchange = () => {
        for (const input of row.querySelectorAll<HTMLInputElement>('[data-uv]'))
          input.disabled = select.value === '@atlas';
      };
      $('spine-map').append(row);
    }
  }
  button.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      if (f.size > 64 * 1024 * 1024) throw Error('Spine JSON 超过 64 MiB');
      const current = host.state();
      if (!current.document || current.busy)
        throw Error('请先打开有效工程并结束当前处理');
      captured = { ...current, document: current.document };
      const parsed = importedCardCharacterImport.decodeSpine(
        JSON.parse(await f.text()) as unknown,
      );
      source = parsed;
      atlas = null;
      atlasImages = new Map<string, ImageData>();
      $('spine-atlas-status').textContent = '未加载图集 · 使用已有图片映射';
      const skins = Array.isArray(source.skins)
        ? source.skins.map((s) => s.name)
        : Object.keys(source.skins || {});
      $('spine-skin').replaceChildren(
        ...(skins.length ? skins : ['default']).map((s) => new Option(s, s)),
      );
      $('spine-skin').value = skins.includes('default')
        ? 'default'
        : skins[0] || 'default';
      mappings();
      $('spine-import-report').textContent =
        '文件：' +
        f.name +
        '\n加载 .atlas 与全部页图片，或映射已有图片后检查。';
      dialog.showModal();
    } catch (error) {
      host.say(message(error));
    } finally {
      file.value = '';
    }
  };
  $('spine-skin').onchange = mappings;
  $('spine-atlas-open').onclick = () => assets.click();
  assets.onchange = async () => {
    const files = [...(assets.files || [])];
    if (!files.length) return;
    loading = true;
    invalidate();
    $('spine-check').disabled = true;
    try {
      checkCurrent();
      if (
        files.length > 17 ||
        files.reduce((sum, f) => sum + f.size, 0) > 96 * 1024 * 1024
      )
        throw Error('图集包超过 16 页 / 96 MiB');
      const descriptors = files.filter((f) => /\.(atlas|txt)$/i.test(f.name));
      if (descriptors.length !== 1)
        throw Error('请同时选择一个 .atlas 文件与全部页图片');
      const next = A.parse(await descriptors[0].text()),
        decoded = new Map<string, ImageData>();
      for (const page of next.pages) {
        const matches = files.filter(
          (f) => f.name === page.name || f.name === page.name.split('/').at(-1),
        );
        if (matches.length !== 1)
          throw Error('缺少图集页或同名文件不明确：' + page.name);
        const f = matches[0];
        if (!/\.(png|jpg|jpeg|webp)$/i.test(f.name))
          throw Error('图集页必须是图片');
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error('图集页读取失败'));
          reader.readAsDataURL(f);
        });
        const image = await host.loadImage(data),
          w = image.naturalWidth,
          h = image.naturalHeight;
        if (w > 8192 || h > 8192 || w * h > 16 * 1024 * 1024)
          throw Error('图集页超过 16 MP / 8192 px');
        if (
          (page.width && page.width !== w) ||
          (page.height && page.height !== h)
        )
          throw Error('实际图集页尺寸与元数据不一致：' + page.name);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw Error('无法创建图集绘图上下文');
        ctx.drawImage(image, 0, 0);
        decoded.set(page.name, ctx.getImageData(0, 0, w, h));
      }
      checkCurrent();
      atlas = next;
      atlasImages = decoded;
      mappings();
      $('spine-atlas-status').textContent =
        `已加载 ${next.pages.length} 页 / ${next.regions.length} 区域 · 自动还原旋转、裁边${next.pages.some((p) => p.pma) ? '与 PMA' : ''}`;
    } catch (error) {
      $('spine-import-report').textContent = message(error);
    } finally {
      loading = false;
      $('spine-check').disabled = false;
      assets.value = '';
    }
  };
  $('spine-fit').onclick = () => {
    const b = source?.skeleton;
    if (!b || !(b.width && b.height && b.width > 0 && b.height > 0)) {
      $('spine-import-report').textContent =
        '源文件没有有效骨架边界，请手工填写缩放与原点。';
      return;
    }
    const scale = Math.min(800 / b.width, 1200 / b.height, 100);
    $('spine-scale').value = String(scale);
    $('spine-origin-x').value = String(
      512 - ((b.x || 0) + b.width / 2) * scale,
    );
    $('spine-origin-y').value = String(
      768 + ((b.y || 0) + b.height / 2) * scale,
    );
    invalidate();
  };
  function options(): SpineOptions {
    if (!source || !captured) throw Error('请先选择 Spine JSON');
    const layerMap: NonNullable<SpineOptions['layerMap']> = Object.create(null),
      images: NonNullable<SpineOptions['images']> = Object.create(null),
      entries = S.entries(source, $('spine-skin').value);
    for (const row of $('spine-map').querySelectorAll<HTMLDivElement>(
      '.spine-map-row',
    )) {
      const slotName = row.dataset.slot;
      if (!slotName) throw Error('图片映射缺少 Slot');
      if (row.querySelector<HTMLSelectElement>('select')!.value === '@atlas') {
        const slot = entries.find((s) => s.name === slotName);
        if (!atlas || !slot) throw Error('图集或 Slot 已变化，请重新检查');
        const a = slot.attachmentData,
          path = a?.path || a?.name || slot.attachment,
          regions = atlas.regions.filter(
            (r) => r.name === path && r.index === -1,
          );
        if (regions.length !== 1) throw Error('图集区域缺失或不明确：' + path);
        const r = regions[0],
          page = atlas.pages.find((p) => p.name === r.page),
          image = atlasImages.get(r.page);
        if (!page || !image) throw Error('图集页未加载：' + r.page);
        const pixels = A.extract(r, image, page.pma),
          sprite = document.createElement('canvas');
        sprite.width = pixels.width;
        sprite.height = pixels.height;
        sprite
          .getContext('2d')!
          .putImageData(
            new ImageData(pixels.data, pixels.width, pixels.height),
            0,
            0,
          );
        const c = document.createElement('canvas');
        c.width = 1024;
        c.height = 1536;
        const scale = Math.min(1, 1024 / pixels.width, 1536 / pixels.height),
          w = pixels.width * scale,
          h = pixels.height * scale,
          x = (1024 - w) / 2,
          y = (1536 - h) / 2;
        c.getContext('2d')!.drawImage(sprite, x, y, w, h);
        images[slotName] = {
          src: c.toDataURL('image/png'),
          uvRect: [x, y, w, h],
        };
      } else
        layerMap[slotName] = {
          layerId: row.querySelector<HTMLSelectElement>('select')!.value,
          uvRect: [...row.querySelectorAll<HTMLInputElement>('[data-uv]')].map(
            (e) => {
              if (e.value === '' || !e.validity.valid)
                throw Error('请输入有效 UV 矩形');
              return Number(e.value);
            },
          ),
        };
    }
    for (const id of [
      'spine-scale',
      'spine-origin-x',
      'spine-origin-y',
    ] as const)
      if ($(id).value === '' || !$(id).validity.valid)
        throw Error('请输入有效缩放和原点');
    return {
      layerMap,
      images,
      scale: Number($('spine-scale').value),
      origin: [
        Number($('spine-origin-x').value),
        Number($('spine-origin-y').value),
      ],
      skin: $('spine-skin').value,
      loop: $('spine-loop').checked,
    };
  }
  $('spine-check').onclick = () => {
    try {
      if (loading) throw Error('请等待图集加载完成');
      if (!source) throw Error('请先选择 Spine JSON');
      const now = checkCurrent(),
        o = options(),
        report = S.inspect(source, { ...o, document: now.document });
      if (!report.unsupported.length)
        registry.convert('spine-json', source, now.document, o);
      review = report.unsupported.length ? null : o;
      $('spine-apply').disabled = !review;
      const c = report.counts,
        ffd = report.plan.actions.reduce(
          (n, a) => n + Object.keys(a.deformTracks || {}).length,
          0,
        );
      $('spine-import-report').textContent =
        `Spine ${report.version} · ${report.skin}\n${c.bones} 骨骼 / ${c.meshes} 网格 / ${c.constraints} IK / ${c.actions} 动作 / ${ffd} FFD 网格轨道\n` +
        (report.unsupported.length
          ? '不能应用：\n' + report.unsupported.map((s) => '• ' + s).join('\n')
          : '检查通过，可应用。') +
        '\n\n' +
        report.warnings.join('\n');
    } catch (error) {
      invalidate();
      $('spine-import-report').textContent = message(error);
    }
  };
  $('spine-apply').onclick = async () => {
    if (!review || loading) return;
    const options = review;
    try {
      const now = checkCurrent(),
        next = registry.convert('spine-json', source, now.document, options);
      $('spine-apply').disabled = true;
      loading = true;
      const applied = await host.applyCharacterImport(next, captured!);
      if (applied) {
        dialog.close();
        host.refreshPreview();
        bindings.atelierCharacterRig.refresh();
        const actionId = next.actions?.find((a) =>
          a.id.startsWith('sp-action'),
        )?.id;
        if (actionId) {
          bindings.atelierWorkspace.selectAction(actionId);
          bindings.atelierAnimation.seek(0);
        }
        host.say('Spine JSON、图集与 FFD 已转为自有动画 · 可撤销');
      }
    } catch (error) {
      invalidate();
      $('spine-import-report').textContent = message(error);
    } finally {
      loading = false;
    }
  };
  $('spine-import-close').onclick = () => {
    if (!loading) dialog.close();
  };
  dialog.addEventListener('cancel', (event) => {
    if (loading) event.preventDefault();
  });
})();
