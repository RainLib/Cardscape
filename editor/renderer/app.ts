import type { WorkspaceHost } from '../shared/workspace';
import type { AgentUIHost } from '../shared/agent-ui';
import type { ResourceKind, ResourceBinding } from '../shared/projects';
import type { WorkshopValue } from '../shared/workshop';
import type { CharacterHost } from '../shared/character-panels';
import { createBlankDocument as blankDocument } from './editing/document-factory.ts';
import {
  createMaskAssets,
  maskNames,
  maskColors,
  requiredMaskIds,
} from './core/mask-assets.ts';
import { element as $ } from './core/dom.ts';
import i18n from './localization/ui-i18n.ts';
import type { CardDocument, CardLayer, LaserLayoutFields } from '../shared/document';
import type { RasterSource } from './core/image-assets.ts';
import { createDocumentRenderer } from './rendering/document-renderer.ts';
import { encoder } from './session-model.ts';
import { createSessionController } from './core/session-controller.ts';
import { createBridge } from './core/bridge.ts';
import {
  createImageAssets,
  createFontRegistry,
  canvasFor,
  pngFromImage,
} from './core/image-assets.ts';
import { snapshot as snapshotDocument } from './core/document-snapshot.ts';
import { prepare } from './core/document-assets.ts';
import importedCardWorkshop from './workshop/workshop-model.ts';
import importedCardLayers from './editing/layer-tree.ts';
import importedCardStats from './editing/card-stats.ts';
import importedCardFrameArtwork from './editing/frame-artwork.ts';
import importedCardRuntime from './rendering/runtime-model.ts';
import importedCardPreviewUpdate from './rendering/preview-update-model.ts';
import importedCardTitle from './editing/title-model.ts';
import importedCardTransform from './editing/transform-model.ts';
import importedCardComponents from './workshop/component-model.ts';
import importedCardFrame from './editing/frame-model.ts';
import laserLayout from './workshop/laser-layout.ts';
import importedCardSpatial from './rendering/spatial-model.ts';
import importedCardFrameRaster from './editing/frame-raster.ts';
import importedCardAnimationAuthoring from './animation/animation-authoring-model.ts';
import importedCardMaskEdit from './editing/mask-edit-model.ts';
import importedCardShortcuts from './editing/shortcuts.ts';
import importedCardCosmetics from './editing/cosmetics-model.ts';
import importedEditorCommands from './editing/editor-commands.ts';
import importedCardAssetWorkspace from './workshop/asset-workspace-model.ts';
import importedCardBack from './workshop/back-asset-model.ts';
import importedCardSpace from './rendering/space-model.ts';
/* The renderer owns the document and immediate interaction. Native processing is
   asynchronous, revision-bound, and never runs inside the GPU render loop. */
export const moduleApi = (() => {
  'use strict';

  const bridge = createBridge();
  const W = importedCardWorkshop;
  let workshop = null;
  const canvas = $('editor-canvas'),
    ctx = canvas.getContext('2d');
  const images = new Map<string, HTMLImageElement>();
  const registerFont = createFontRegistry();
  const titleImages = new Map<string, HTMLImageElement>(),
    popRasterCache = new WeakMap();
  const {
    textStyle,
    drawText,
    textRaster,
    imageAlpha,
    registeredImage,
    adjustedImage,
    titleRasterBounds,
  } = createDocumentRenderer(() => doc, titleImages);
  const selectionOverlays = new WeakMap();
  let doc = null,
    template = null,
    desktop = false,
    loading = true,
    selected: string[] = ['foreground'],
    target = 'image',
    tool = 'move',
    showMask = false,
    white = true,
    brushValue = 255,
    brushHardness = 0,
    maskDisplayMode = 'overlay';
  let view = { zoom: 1, panX: 0, panY: 0 },
    selection = null,
    gesture = null,
    space = false,
    freeTransform = false,
    wire = false;
  let lassoPoints = [],
    selectionMask = null,
    selectionLayer = null,
    importRole = 'image',
    pickingFile = false;
  let smartSession = null,
    anchorMode = null;
  let showGuides = true;
  let documentToken = crypto.randomUUID();
  const folders = importedCardLayers,
    collapsedGroups = new Set<string>();
  let selectedGroup = null,
    layerDrag = null;
  let undo = [],
    redo = [],
    revision = 0,
    savedRevision = 0,
    taskToken = 0,
    busy = false,
    applying = false,
    paintSync = 0,
    paintDirty = null,
    drawScheduled = false;
  let newFromHome = false,
    appVersion = '';
  const recovery = createSessionController({
    state: () => ({
      ready: !loading && !!doc && document.body.dataset.appMode === 'editor',
      blocked: !!gesture || freeTransform || applying,
      documentKey: JSON.stringify([
        workshop?.id,
        workshop?.activeCardId,
        documentToken,
        revision,
        savedRevision,
      ]),
      cardId: workshop?.activeCardId || documentToken,
      revision,
      savedRevision,
      view: doc ? editorView() : null,
    }),
    capture: () =>
      workshop
        ? W.commit(workshop, snapshot())
        : { ...snapshot(), thumbnail: cardThumbnail() },
    encode: encoder(),
    save: (value) => bridge.invoke('editor-session-save', value),
    status: (state, cardId) => {
      $('session-status').textContent = {
        pending: '恢复副本同步中…',
        saved: '恢复副本已同步',
        error: '恢复同步失败',
      }[state];
      document.body.dataset.sessionState = state;
      if (cardId) document.body.dataset.sessionCard = cardId;
    },
    error: (error) =>
      console.error(
        'SESSION_ERROR',
        error instanceof Error ? error.message : String(error),
      ),
  });
  const queueSession = () => recovery.queue(),
    flushSession = () => recovery.flush();
  async function newSession() {
    recovery.suspend();
    recovery.activate(
      (await bridge.invoke('editor-session-start')).sessionToken,
    );
    queueSession();
  }
  const active = () => doc?.layers.find((l) => l.id === selected[0]);
  function snapshot() {
    return snapshotDocument(doc);
  }
  function say(text) {
    $('status').textContent = text;
  }
  function notifyDirty() {
    bridge
      .invoke('document-state', { dirty: revision !== savedRevision })
      .catch(() => {});
    $('dirty-marker').textContent = revision === savedRevision ? '' : '●';
    queueSession();
  }
  function dirty() {
    revision++;
    doc.revision = revision;
    if (workshop) {
      workshop = W.commit(workshop, snapshot());
      updateWorkshopThumbnail();
    }
    notifyDirty();
  }
  function push(
    before,
    label,
    selectionBefore?: Awaited<ReturnType<typeof captureSelection>>,
    workshopBefore = workshop,
  ) {
    folders.ensure(doc);
    undo.push({
      document: before,
      workshop: workshopBefore,
      label,
      ...(selectionBefore ? { selection: selectionBefore } : {}),
    });
    if (undo.length > 30) undo.shift();
    redo = [];
    dirty();
    $('history-log').textContent = label;
    syncProperties();
    syncPreview();
    draw();
  }
  function mutate(label, fn) {
    if (!doc || loading || freeTransform || applying || editorClosed()) return;
    const before = snapshot();
    fn();
    push(before, label);
    renderLayers();
  }
  const imageAssets = createImageAssets(),
    imageFrom = imageAssets.imageFrom;
  const {
    masks,
    maskVersions,
    registerMask,
    statistics: maskStatistics,
  } = createMaskAssets(imageFrom, (id, pixels) =>
    window.cardPreview.updateMask(id, pixels),
  );
  function blankMaskCanvas(color = 'black') {
    const blank = canvasFor();
    const context = blank.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 1024, 1536);
    return blank;
  }
  async function loadDocument(document, resetHistory = true) {
    loading = true;
    if (tool === 'emitter') setTool('move');
    say('正在恢复图层与 Mask…');
    window.atelierHome.progress('准备图层、字体与 Mask…', 24);
    await window.atelierHome.paint();
    try {
      taskToken++;
      if (busy) {
        await bridge.invoke('cancel');
        busy = false;
        $('cancel-task').hidden = true;
      }
      await Promise.all([
        ...(document.fonts || []).map(registerFont),
        importedCardStats.loadThemes(document, imageFrom),
        importedCardFrameArtwork.loadDocument(document, imageFrom),
      ]);
      const { prepared, backSource } = await prepare(document, {
        imageFrom,
        maskNames,
        fallbackBack: () => {
          const blank = canvasFor(),
            cc = blank.getContext('2d');
          cc.fillStyle = '#1c2934';
          cc.fillRect(0, 0, 1024, 1536);
          return blank.toDataURL('image/png');
        },
        fallbackMask: () => blankMaskCanvas().toDataURL('image/png'),
        progress: (completed, total) =>
          window.atelierHome.progress(
            '解码素材 ' + completed + ' / ' + total,
            25 + (completed / total) * 35,
          ),
      });
      window.atelierHome.progress('编译效果与建立连续网格…', 65);
      await window.atelierHome.paint();
      // Compile before replacing the document; a bad imported shader preserves the open project.
      if (document.previewMode === 'authored')
        window.cardPreview.compileShader(
          {
            ...importedCardRuntime.defaults.shader,
            ...document.shader,
          },
          document,
        );
      // Replace the active document only after every source has decoded correctly.
      window.cardPreview.stopAction?.();
      window.cardPreview.resetAssets?.();
      doc = {
        ...document,
        layers: document.layers.map((l) => ({ ...l })),
        masks: { ...document.masks },
        effects: {
          depth: 1,
          background: 1,
          cape: true,
          flow: true,
          capeLayout: 0,
          frame: true,
          ...document.effects,
        },
        meshGuides: [...(document.meshGuides || [])],
      };
      folders.ensure(doc);
      selectedGroup = null;
      importedCardRuntime.ensure(doc);
      documentToken = document.id || crypto.randomUUID();
      doc.id = documentToken;
      doc.effects.paused = false;
      images.clear();
      masks.clear();
      titleImages.clear();
      for (const [key, im] of prepared)
        if (key.startsWith('title:')) titleImages.set(key.slice(6), im);
      textCache.clear();
      window.cardPreview.setDocument(doc);
      for (const layer of doc.layers)
        if (layer.src) {
          const im = prepared.get('layer:' + layer.id);
          images.set(layer.id, im);
          if (!layer.src.startsWith('data:')) layer.src = pngFromImage(im);
          if (layer.master && !layer.master.startsWith('data:'))
            layer.master = pngFromImage(prepared.get('master:' + layer.id));
        }
      const back = prepared.get('back');
      doc.back = backSource.startsWith('data:')
        ? backSource
        : pngFromImage(back);
      window.cardPreview.beginUpdate();
      try {
        let maskCount = 0;
        const maskIds = Object.keys(maskNames).filter((id) =>
          prepared.has('mask:' + id),
        );
        for (const id of maskIds) {
          window.atelierHome.progress(
            '恢复 ' + maskNames[id] + ' Mask',
            70 + (++maskCount / maskIds.length) * 20,
          );
          await window.atelierHome.paint();
          await registerMask(id, prepared.get('mask:' + id));
          // Opening an embedded PNG does not change its pixels. Preserve the
          // immutable source; external/fallback images still need embedding.
          if (!doc.masks[id]?.startsWith('data:image/png;base64,'))
            doc.masks[id] = masks.get(id).canvas.toDataURL('image/png');
        }
        window.cardPreview.setTexture('art_back', back);
        images.set('space-back', back);
        syncTextures();
      } finally {
        window.cardPreview.endUpdate();
      }
      selected = [
        doc.layers.find((l) => l.kind === 'foreground')?.id || doc.layers[0].id,
      ];
      target = 'image';
      selection = null;
      selectionMask = null;
      lassoPoints = [];
      selectionLayer = null;
      smartSession = null;
      if (resetHistory) {
        undo = [];
        redo = [];
        revision =
          Number.isSafeInteger(document.revision) && document.revision >= 0
            ? document.revision
            : 0;
        savedRevision = revision;
        doc.revision = revision;
      }
      $('document-name').textContent =
        doc.name + (workshop ? ' · ' + workshop.name : '.cardproj');
      notifyDirty();
      syncFonts();
      fit();
      renderLayers();
      syncProperties();
      syncPreview();
      draw();
      say('选中图层或 Mask 后直接操作；B 绘制权重，V 移动，M 选区');
    } finally {
      loading = false;
      if (doc) syncProperties();
    }
  }
  async function updateDocument(document) {
    const changes = importedCardPreviewUpdate.plan(doc, document);
    if (!changes.compatible) {
      await loadDocument(document, false);
      return false;
    }
    loading = true;
    const started = performance.now(),
      startDecodes = imageAssets.stats().decoded,
      prepared = new Map<string, HTMLImageElement>(),
      requests = new Map<string, 'text' | 'image' | 'mask'>();
    try {
      // Prepare changed sources before committing, while the existing preview keeps playing.
      for (const l of changes.images)
        requests.set(l.src, l.kind === 'text' ? 'text' : 'image');
      if (changes.back && document.back) requests.set(document.back, 'image');
      for (const id of requiredMaskIds)
        if (!document.masks[id])
          throw Error('工程缺少 ' + maskNames[id] + ' Mask');
      for (const id of changes.masks) requests.set(document.masks[id], 'mask');
      for (const l of document.layers) {
        for (const v of l.titleArt?.variants || [])
          if (v.src && !titleImages.has(v.src)) requests.set(v.src, 'image');
        if (
          l.master &&
          !l.master.startsWith('data:') &&
          doc.layers.find((p) => p.id === l.id)?.master !== l.master
        )
          requests.set(l.master, 'image');
      }
      await Promise.all([
        ...(document.fonts || []).map(registerFont),
        importedCardStats.loadThemes(document, imageFrom),
        importedCardFrameArtwork.loadDocument(document, imageFrom),
      ]);
      await Promise.all(
        [...requests].map(async ([src, type]) => {
          const im = await imageFrom(src);
          if (
            im.naturalWidth > 8192 ||
            im.naturalHeight > 8192 ||
            im.naturalWidth * im.naturalHeight > 16 * 1024 * 1024
          )
            throw Error('图像超过 16 MP / 8192 px 上限');
          if (
            type === 'mask' &&
            (im.naturalWidth !== 1024 || im.naturalHeight !== 1536)
          )
            throw Error('Mask 与母版尺寸不一致');
          prepared.set(src, im);
        }),
      );
      if (document.previewMode === 'authored')
        window.cardPreview.compileShader(document.shader, document);
      const next = {
        ...document,
        layers: document.layers.map((l) => ({ ...l })),
        masks: { ...document.masks },
        effects: { ...document.effects, paused: doc.effects.paused },
      };
      if (!changes.geometry) next.foregroundMesh = doc.foregroundMesh;
      folders.ensure(next);
      importedCardRuntime.ensure(next);
      window.cardPreview.beginUpdate();
      try {
        doc = next;
        window.cardPreview.setDocument(doc);
        for (const id of changes.removed) window.cardPreview.removeTexture(id);
        for (const id of previewImages.keys())
          if (!doc.layers.some((l) => l.id === id)) previewImages.delete(id);
        for (const id of changes.removedMasks) {
          masks.delete(id);
          window.cardPreview.removeMask(id);
          if (target === id) target = 'image';
        }
        for (const changed of changes.images) {
          const l = doc.layers.find((l) => l.id === changed.id),
            im = prepared.get(changed.src);
          images.set(l.id, im);
          if (!l.src.startsWith('data:')) l.src = pngFromImage(im);
        }
        for (const l of doc.layers) {
          for (const v of l.titleArt?.variants || [])
            if (prepared.has(v.src))
              titleImages.set(v.src, prepared.get(v.src));
          if (
            l.master &&
            prepared.has(l.master) &&
            !l.master.startsWith('data:')
          )
            l.master = pngFromImage(prepared.get(l.master));
        }
        for (const id of images.keys())
          if (id !== 'space-back' && !doc.layers.some((l) => l.id === id))
            images.delete(id);
        for (const id of textCache.keys())
          if (!doc.layers.some((l) => l.id === id && l.kind === 'text'))
            textCache.delete(id);
        const usedTitles = new Set<string>(
          doc.layers.flatMap((l) =>
            (l.titleArt?.variants || []).map((v) => v.src),
          ),
        );
        for (const src of titleImages.keys())
          if (!usedTitles.has(src)) titleImages.delete(src);
        if (changes.back && doc.back) {
          const im = prepared.get(doc.back);
          window.cardPreview.setTexture('art_back', im);
          images.set('space-back', im);
          if (!doc.back.startsWith('data:')) doc.back = pngFromImage(im);
        }
        for (const id of changes.masks)
          await registerMask(id, prepared.get(doc.masks[id]));
        syncTextures(changes.images);
      } finally {
        window.cardPreview.endUpdate();
      }
      selected = selected.filter((id) => doc.layers.some((l) => l.id === id));
      if (!selected.length && doc.layers.length)
        selected = [
          doc.layers.find((l) => l.kind === 'foreground')?.id ||
            doc.layers[0].id,
        ];
      if (selectedGroup && !folders.find(doc.layerTree || [], selectedGroup))
        selectedGroup = null;
      syncFonts();
      renderLayers();
      syncProperties();
      syncPreview();
      draw();
      window.document.body.dataset.previewUpdate = 'incremental';
      window.document.body.dataset.previewDecoded = String(
        imageAssets.stats().decoded - startDecodes,
      );
      window.document.body.dataset.previewSources = String(requests.size);
      window.document.body.dataset.previewUpdateMs = (
        performance.now() - started
      ).toFixed(1);
      return true;
    } finally {
      loading = false;
      if (doc) syncProperties();
    }
  }
  function syncTextures(layers = doc.layers) {
    for (const layer of layers) {
      const im = images.get(layer.id);
      if (!im) continue;
      const display = registeredImage(layer, im),
        textureImage =
          (layer.kind === 'background' && doc.previewMode === 'authored') ||
          layer.role === 'background-candidate'
            ? im
            : display,
        cached = previewImages.get(layer.id);
      if (
        cached?.image === textureImage &&
        cached.kind === layer.kind &&
        cached.ownership === layer.ownershipMask
      )
        continue;
      previewImages.set(layer.id, {
        image: textureImage,
        kind: layer.kind,
        ownership: layer.ownershipMask,
      });
      if (layer.kind === 'foreground')
        window.cardPreview.setTexture('pop_foreground', display);
      else if (layer.kind === 'background')
        window.cardPreview.setTexture(
          'snap_background',
          doc.previewMode === 'authored' ? im : display,
        );
      else if (layer.kind === 'image')
        window.cardPreview.addImage(
          layer,
          layer.role === 'background-candidate' ? im : display,
        );
    }
  }
  const textCache = new Map<string, string>(),
    previewImages = new Map<
      string,
      { image: RasterSource; kind: string; ownership?: string }
    >();
  window.addEventListener('atelier-preview-assets-reset', () =>
    previewImages.clear(),
  );
  function syncPreview() {
    if (!doc) return;
    window.cardPreview.setEmitterContext?.(
      workshop?.editingAsset?.kind === 'particles'
        ? W.resolve(workshop, workshop.activeCardId)
        : null,
    );
    const resolved = window.atelierComponents?.resolve(doc, workshop) || doc;
    window.cardPreview.setDocument(
      window.atelierFinishLibrary?.resolvePreview(resolved, documentToken, revision) || resolved,
    );
    for (const layer of doc.layers.filter((l) => l.kind === 'text')) {
      const key = JSON.stringify([
        layer.text,
        layer.textStyle,
        layer.role,
        layer.titleArt,
        doc.locale,
      ]);
      if (textCache.get(layer.id) !== key) {
        window.cardPreview.setText(layer, textRaster(layer));
        textCache.set(layer.id, key);
      }
    }
    $('toggle-play').textContent =
      (window.cardPreview.getView?.().paused ?? doc.effects.paused)
        ? '播放'
        : '暂停';
    window.atelierCharacterRig?.syncPose();
  }
  function selectLayer(
    id,
    newTarget = 'image',
    multi = false,
    preserveRows = false,
  ) {
    if (gesture || applying || loading) return;
    if (freeTransform) {
      say('请先 Enter 应用或 Esc 取消变换');
      return;
    }
    selectedGroup = null;
    if (multi) {
      selected = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      if (!selected.length) selected = [id];
    } else selected = [id];
    target = newTarget;
    showMask = target !== 'image';
    if (preserveRows) {
      for (const row of $('layers').querySelectorAll<HTMLElement>(
        '[data-layer-id]',
      )) {
        row.classList.toggle(
          'selected',
          selected.includes(row.dataset.layerId),
        );
        row.setAttribute(
          'aria-selected',
          String(selected.includes(row.dataset.layerId)),
        );
        row
          .querySelector('.thumbnail')
          ?.classList.toggle(
            'active',
            selected[0] === row.dataset.layerId && target === 'image',
          );
        if (row.nextElementSibling?.classList.contains('mask-row'))
          row.nextElementSibling.classList.toggle(
            'expanded',
            selected[0] === row.dataset.layerId,
          );
      }
      for (const button of $('layers').querySelectorAll<HTMLElement>(
        '[data-mask]',
      ))
        button.classList.toggle(
          'active',
          active()?.kind === 'foreground' && target === button.dataset.mask,
        );
    } else renderLayers();
    syncProperties();
    draw();
    if (active()?.kind === 'frame') window.atelierFrame?.open(false);
    say(
      target === 'image'
        ? '当前工具作用于选中图层'
        : '当前工具作用于 ' + maskNames[target] + ' Mask',
    );
    queueSession();
  }
  function changeLayerTree(label, apply) {
    if (!doc || loading || busy || gesture || freeTransform || applying) {
      say('请先结束当前操作或变换');
      return;
    }
    const before = snapshot(),
      next = snapshot();
    try {
      apply(next);
      folders.ensure(next);
      folders.validate(next);
      if (
        JSON.stringify([before.layers.map((l) => l.id), before.layerTree]) ===
        JSON.stringify([next.layers.map((l) => l.id), next.layerTree])
      )
        return;
      doc = next;
      push(before, label);
      renderLayers();
      say(label + ' · 实时预览已同步，可撤销');
    } catch (e) {
      say(e.message);
    }
  }
  function currentGroup() {
    return (
      selectedGroup || folders.find(folders.tree(doc), selected[0])?.parent?.id
    );
  }
  function clearLayerDrop() {
    for (const row of $('layers').querySelectorAll<HTMLElement>('[data-drop]'))
      delete row.dataset.drop;
  }
  let layerClickUntil = 0;
  function cancelLayerDrag() {
    layerDrag = null;
    clearLayerDrop();
    for (const row of $('layers').querySelectorAll('.dragging'))
      row.classList.remove('dragging');
  }
  function wireLayerDrag(row, id) {
    row.draggable = false;
    row.onpointerdown = (e) => {
      if (
        e.button !== 0 ||
        e.target.closest('input,button') ||
        loading ||
        busy ||
        gesture ||
        freeTransform ||
        applying
      )
        return;
      const node = folders.find(folders.tree(doc), id)?.node;
      if (!node) return;
      const nodeIDs =
        node.type === 'group'
          ? [id]
          : selectedGroup || !selected.includes(id)
            ? [id]
            : [...selected];
      layerDrag = {
        nodeIDs,
        sourceId: id,
        revision,
        documentToken,
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        started: false,
      };
    };
  }
  $('layers').ondragstart = (e) => e.preventDefault();
  $('layers').addEventListener(
    'click',
    (e) => {
      if (Date.now() < layerClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  function layerDropAt(e) {
    const row = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('#layers [data-node-id],#layer-root-drop');
    if (!row) return null;
    if (row.id === 'layer-root-drop') return { row, position: 'root' };
    const r = row.getBoundingClientRect(),
      p = (e.clientY - r.top) / r.height;
    return {
      row,
      position:
        row.dataset.groupId && p > 0.25 && p < 0.75
          ? 'inside'
          : p < 0.5
            ? 'before'
            : 'after',
      id: row.dataset.nodeId,
    };
  }
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!layerDrag || e.pointerId !== layerDrag.pointerId) return;
      if (!layerDrag.started) {
        if (Math.hypot(e.clientX - layerDrag.x, e.clientY - layerDrag.y) < 6)
          return;
        if (
          layerDrag.nodeIDs.some((key) =>
            folders
              .ids(folders.find(folders.tree(doc), key).node)
              .some((lid) => doc.layers.find((l) => l.id === lid)?.locked),
          )
        ) {
          say('选中范围包含锁定图层；请先解锁后排序');
          cancelLayerDrag();
          return;
        }
        layerDrag.started = true;
        $('layers').setPointerCapture(e.pointerId);
        $('layers').dataset.dragState = 'moving';
        $('layers')
          .querySelector(`[data-node-id="${layerDrag.sourceId}"]`)
          ?.classList.add('dragging');
      }
      e.preventDefault();
      const host = $('layers'),
        rect = host.getBoundingClientRect();
      if (e.clientY < rect.top + 20) host.scrollTop -= 12;
      else if (e.clientY > rect.bottom - 20) host.scrollTop += 12;
      clearLayerDrop();
      const target = layerDropAt(e);
      layerDrag.drop = target;
      if (target)
        target.row.dataset.drop =
          target.position === 'root' ? 'inside' : target.position;
    },
    { passive: false },
  );
  document.addEventListener(
    'pointerup',
    (e) => {
      if (!layerDrag || e.pointerId !== layerDrag.pointerId) return;
      const capture = layerDrag;
      if (!capture.started) {
        layerDrag = null;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const destination = layerDropAt(e) || capture.drop;
      layerClickUntil = Date.now() + 250;
      cancelLayerDrag();
      $('layers').dataset.dragState = destination ? 'dropped' : 'cancelled';
      if (!destination) return;
      if (
        capture.revision !== revision ||
        capture.documentToken !== documentToken
      ) {
        say('工程已变化，请重新拖动');
        return;
      }
      const members = capture.nodeIDs.flatMap((key) =>
        folders.ids(folders.find(folders.tree(doc), key).node),
      );
      selected = members;
      selectedGroup =
        capture.nodeIDs.length === 1 &&
        folders.find(folders.tree(doc), capture.sourceId)?.node.type === 'group'
          ? capture.sourceId
          : null;
      target = 'image';
      changeLayerTree(
        destination.position === 'inside' ? '图层放入组' : '拖动调整图层顺序',
        (next) =>
          destination.position === 'root'
            ? folders.moveRoot(next, capture.nodeIDs)
            : folders.move(
                next,
                capture.nodeIDs,
                destination.id,
                destination.position,
              ),
      );
      if (destination.position === 'inside') {
        collapsedGroups.delete(destination.id);
        renderLayers();
      }
    },
    true,
  );
  document.addEventListener('pointercancel', cancelLayerDrag);
  window.addEventListener('blur', cancelLayerDrag);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && layerDrag?.started) {
        e.preventDefault();
        e.stopPropagation();
        cancelLayerDrag();
      }
    },
    true,
  );
  $('group-layers').onclick = () => {
    const id = 'group-' + crypto.randomUUID();
    changeLayerTree('编组图层', (next) =>
      folders.group(next, selected, '新建图层组', id),
    );
    if (folders.find(folders.tree(doc), id)) {
      selectedGroup = id;
      renderLayers();
    }
  };
  $('ungroup-layers').onclick = () => {
    const id = currentGroup();
    if (!id) {
      say('请选择图层组或组内图层');
      return;
    }
    changeLayerTree('取消图层组', (next) => folders.ungroup(next, id));
    selectedGroup = null;
    renderLayers();
  };
  function renderLayers() {
    const host = $('layers'),
      scroll = host.scrollTop;
    host.replaceChildren();
    folders.ensure(doc);
    if (selectedGroup && !folders.find(folders.tree(doc), selectedGroup))
      selectedGroup = null;
    function appendLayer(layer, depth) {
      const row = document.createElement('div');
      row.className =
        'layer-row' +
        (selected.includes(layer.id) ? ' selected' : '') +
        (layer.locked ? ' locked' : '');
      row.dataset.layerId = layer.id;
      row.dataset.nodeId = layer.id;
      row.style.paddingLeft = 7 + depth * 14 + 'px';
      wireLayerDrag(row, layer.id);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(selected.includes(layer.id)));
      const visible = document.createElement('button');
      visible.textContent = layer.visible ? '●' : '○';
      visible.title = layer.visible ? '隐藏图层' : '显示图层';
      visible.setAttribute(
        'aria-label',
        `${layer.visible ? '隐藏' : '显示'}${layer.name}`,
      );
      visible.onclick = (e) => {
        e.stopPropagation();
        mutate('切换图层可见性', () => (layer.visible = !layer.visible));
      };
      row.append(visible);
      const imageTitle =
        layer.kind === 'text' &&
        !!importedCardTitle.resolve(layer, doc.locale).src;
      const thumb = document.createElement(
        imageTitle ? 'canvas' : layer.src ? 'img' : 'button',
      );
      thumb.className =
        'thumbnail' +
        (selected[0] === layer.id && target === 'image' ? ' active' : '');
      if (thumb instanceof HTMLCanvasElement) {
        const b = contentBounds(layer),
          im = textRaster(layer);
        thumb.width = 52;
        thumb.height = 66;
        const c = thumb.getContext('2d'),
          ratio = Math.min(48 / b.w, 60 / b.h);
        c.drawImage(
          im,
          b.x,
          b.y,
          b.w,
          b.h,
          (52 - b.w * ratio) / 2,
          (66 - b.h * ratio) / 2,
          b.w * ratio,
          b.h * ratio,
        );
      } else if (thumb instanceof HTMLImageElement) thumb.src = layer.src;
      else thumb.textContent = layer.kind === 'text' ? 'T' : '◇';
      thumb.title = '编辑图像内容';
      thumb.onclick = (e) => {
        e.stopPropagation();
        selectLayer(layer.id, 'image', false, true);
      };
      row.append(thumb);
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.dataset.uiContent = '';
      name.textContent = layer.name;
      row.append(name);
      if (layer.src) {
        const ai = document.createElement('button');
        ai.textContent = 'AI';
        ai.title = 'AI 改图 / 局部重绘 / 扩图';
        ai.setAttribute('aria-label', 'AI 编辑' + layer.name);
        ai.onclick = (e) => {
          e.stopPropagation();
          selectLayer(layer.id);
          window.atelierAI?.open('edit');
        };
        row.append(ai);
        thumb.ondblclick = () => {
          selectLayer(layer.id);
          window.atelierAI?.open('edit');
        };
      }
      const lock = document.createElement('button');
      lock.textContent = layer.locked ? '▣' : '▫';
      lock.title = layer.locked ? '解锁' : '锁定';
      lock.setAttribute(
        'aria-label',
        `${layer.locked ? '解锁' : '锁定'}${layer.name}`,
      );
      lock.onclick = (e) => {
        e.stopPropagation();
        mutate('切换图层锁定', () => (layer.locked = !layer.locked));
      };
      row.append(lock);
      row.onclick = (e) => {
        if (e.shiftKey) {
          const from = doc.layers.findIndex((l) => l.id === selected[0]),
            to = doc.layers.indexOf(layer);
          selectedGroup = null;
          selected = doc.layers
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .map((l) => l.id);
          target = 'image';
          renderLayers();
          syncProperties();
          draw();
        } else selectLayer(layer.id, 'image', e.metaKey || e.ctrlKey);
      };
      host.append(row);
      if (layer.kind === 'foreground') {
        const controls = document.createElement('div');
        controls.className =
          'mask-row' + (selected[0] === layer.id ? ' expanded' : '');
        for (const id of [
          'motion',
          'inset',
          'emission',
          'phase',
          'rigid',
          'coverage',
          'foil',
        ] as const) {
          const b = document.createElement('button');
          b.textContent = maskNames[id];
          b.dataset.mask = id;
          b.title = maskNames[id] + ' Mask';
          b.className =
            selected[0] === layer.id && target === id ? 'active' : '';
          b.onclick = () => {
            selectLayer(layer.id, id);
            setTool('brush');
            window.atelierWorkspace?.panel('masks');
          };
          controls.append(b);
        }
        host.append(controls);
      }
    }
    function appendNodes(nodes, depth = 0) {
      for (const node of nodes) {
        if (node.type === 'layer') {
          const layer = doc.layers.find((l) => l.id === node.id);
          if (layer) appendLayer(layer, depth);
          continue;
        }
        const row = document.createElement('div');
        row.className =
          'layer-row layer-group' +
          (selectedGroup === node.id ? ' selected' : '');
        row.dataset.nodeId = node.id;
        row.dataset.groupId = node.id;
        row.style.paddingLeft = 7 + depth * 14 + 'px';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(selectedGroup === node.id));
        wireLayerDrag(row, node.id);
        const fold = document.createElement('button');
        fold.textContent = collapsedGroups.has(node.id) ? '▸' : '▾';
        fold.setAttribute('aria-label', '展开或折叠' + node.name);
        fold.setAttribute(
          'aria-expanded',
          String(!collapsedGroups.has(node.id)),
        );
        fold.onclick = (e) => {
          e.stopPropagation();
          collapsedGroups.has(node.id)
            ? collapsedGroups.delete(node.id)
            : collapsedGroups.add(node.id);
          renderLayers();
        };
        const name = document.createElement('span');
        name.className = 'layer-name';
        const groupName = document.createElement('span');
        groupName.dataset.uiContent = '';
        groupName.textContent = '▱ ' + node.name;
        name.append(groupName);
        name.title = '双击重命名；拖动整组；中部放入组';
        name.ondblclick = (e) => {
          e.stopPropagation();
          const input = document.createElement('input');
          input.value = node.name;
          input.maxLength = 200;
          input.setAttribute('aria-label', '图层组名称');
          name.replaceWith(input);
          input.focus();
          input.select();
          let done = false;
          const finish = (cancel) => {
            if (done) return;
            done = true;
            if (
              !cancel &&
              input.value.trim() &&
              input.value.trim() !== node.name
            )
              changeLayerTree('重命名图层组', (next) =>
                folders.rename(next, node.id, input.value),
              );
            else renderLayers();
          };
          input.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              finish(true);
            }
          };
          input.onblur = () => finish(false);
        };
        const count = document.createElement('small');
        count.textContent = folders.ids(node).length + ' 层';
        row.append(fold, name, count);
        row.onclick = () => {
          if (loading || busy || gesture || freeTransform || applying) return;
          const members = folders.ids(node);
          if (!members.length) {
            say('该组为空，拖入图层后可编辑');
            return;
          }
          selected = members;
          selectedGroup = node.id;
          target = 'image';
          showMask = false;
          for (const item of host.querySelectorAll<HTMLElement>(
            '[data-node-id]',
          )) {
            const chosen = item.dataset.groupId
              ? item.dataset.groupId === node.id
              : selected.includes(item.dataset.layerId);
            item.classList.toggle('selected', chosen);
            item.setAttribute('aria-selected', String(chosen));
          }
          $('ungroup-layers').disabled = false;
          syncProperties();
          draw();
          say('已选中整组；移动工具同步移动成员，包含锁定图层时请先解锁');
        };
        host.append(row);
        if (!collapsedGroups.has(node.id))
          appendNodes(node.children, depth + 1);
      }
    }
    appendNodes(folders.tree(doc));
    host.scrollTop = scroll;
    const rootDrop = document.createElement('div');
    rootDrop.id = 'layer-root-drop';
    rootDrop.textContent = '拖至此处移出组 · 根级底部';
    host.append(rootDrop);
    host.scrollTop = scroll;
    $('ungroup-layers').disabled = !currentGroup();
    $('group-layers').disabled = loading || busy || applying;
  }

  function syncProperties() {
    window.atelierCharacterRig?.refresh();
    window.atelierCharacterAdvanced?.refresh();
    $('document-name').textContent =
      doc.name + (workshop ? ' · ' + workshop.name : '.cardproj');
    const layer = active();
    if (!layer) return;
    const historyBlocked =
      loading || busy || applying || !!gesture || freeTransform;
    for (const [cmd, stack, key] of [
      ['undo', undo, '⌘/Ctrl Z'],
      ['redo', redo, '⌘/Ctrl Shift Z · ⌘/Ctrl Y'],
    ] as const) {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-command="${cmd}"]`,
      );
      button.disabled = historyBlocked || !stack.length;
      button.title =
        key +
        (stack.length
          ? ' · ' + stack[stack.length - 1].label
          : ' · 无可' + (cmd === 'undo' ? '撤销' : '重做') + '操作');
    }
    $('layer-x').value = String(Math.round(layer.x));
    $('layer-y').value = String(Math.round(layer.y));
    $('layer-scale').value = String(Math.round(layer.scale * 100));
    $('layer-opacity').value = String(Math.round(layer.opacity * 100));
    $('layer-name').value = String(layer.name);
    $('title-text').value = String(
      importedCardTitle.resolve(layer, doc.locale).text,
    );
    $('text-controls').hidden = layer.kind !== 'text';
    const imageTitle =
      layer.kind === 'text' &&
      !!importedCardTitle.resolve(layer, doc.locale).src;
    $('image-title-note').hidden = !imageTitle;
    $('title-text').disabled = layer.locked || imageTitle;
    for (const id of [
      'text-font',
      'text-size',
      'text-weight',
      'text-color',
      'text-stroke',
      'text-stroke-width',
      'text-align',
      'text-italic',
      'import-font',
    ] as const)
      $(id).disabled = layer.locked || imageTitle;
    const style = textStyle(layer);
    for (const [id, key] of [
      ['text-font', 'fontFamily'],
      ['text-size', 'fontSize'],
      ['text-weight', 'fontWeight'],
      ['text-color', 'color'],
      ['text-stroke', 'stroke'],
      ['text-stroke-width', 'strokeWidth'],
      ['text-align', 'align'],
    ] as const)
      $(id).value = String(style[key]);
    $('text-italic').checked = style.italic;
    $('property-target').textContent =
      target === 'image' ? '图像内容' : maskNames[target] + ' Mask';
    $('active-target').textContent =
      layer.name +
      ' > ' +
      (target === 'image' ? '图像' : maskNames[target] + ' Mask');
    $('mask-display').classList.toggle('active', showMask);
    $('mask-display').textContent = showMask ? '隐藏 Mask' : '显示 Mask';
    $('mask-display').disabled = layer.kind !== 'foreground';
    for (const id of [
      'layer-x',
      'layer-y',
      'layer-scale',
      'layer-opacity',
    ] as const)
      $(id).disabled = layer.locked;
    $('depth').value = String(doc.effects.depth * 100);
    $('parallax').value = String(doc.effects.background * 100);
    $('cape-motion').checked = doc.effects.cape;
    $('weapon-flow').checked = doc.effects.flow;
    $('feather-mask').disabled = target === 'image' || busy || layer.locked;
    $('create-mesh').disabled = !selection || busy;
    $('selection-info').textContent = selection
      ? `${Math.round(selection.w)} × ${Math.round(selection.h)} 选区${selectionMask && selectionLayer === layer.id ? ' · 粉色区域' : ''}`
      : '无选区';
    $('close-lasso').disabled = lassoPoints.length < 3 || busy;
    const subjectSelection = $('selection-target').value === 'subject';
    $('apply-selection').disabled =
      !selection ||
      (subjectSelection
        ? !images.has(layer.id)
        : layer.kind !== 'foreground') ||
      busy ||
      layer.locked;
    $('extract-selection').disabled =
      !selection || !images.has(layer.id) || busy;
    $('select-alpha').disabled = !images.has(layer.id) || busy;
    $('rasterize-text').disabled = layer.locked || layer.kind !== 'text';
    $('delete-layer').disabled =
      layer.locked ||
      ['foreground', 'background', 'frame'].includes(layer.kind);
    document.body.dataset.tool = tool;
    window.atelierEffectTools?.refresh();
    window.atelierWorkspace?.refresh(window.cardEditorHost.state());
    window.atelierAI?.refresh({
      layerId: layer.id,
      layer: layer.name,
      available: images.has(layer.id),
      locked: layer.locked,
      selection: !!selection && selectionLayer === layer.id,
      documentToken,
      revision,
    });
    window.atelierCutout?.refresh({ layer, busy: historyBlocked });
    window.atelierWorkshop?.refresh({
      workshop,
      document: doc,
      busy: historyBlocked,
      revision,
      documentToken,
    });
    window.atelierComponents?.refresh(window.cardEditorHost.state());
    window.atelierAssetWorkspace?.refresh(window.cardEditorHost.state());
    window.atelierParticles?.refresh();
    window.atelierCosmetics?.refresh();
    window.atelierMaterial?.refresh();
    window.atelierCharacterEffects?.refresh();
  }
  function setTool(next, character = false) {
    if (!character) window.atelierCharacterRig?.deactivate();
    tool = next;
    document.body.dataset.tool = tool;
    window.atelierWorkspace?.tool(next);
    document
      .querySelectorAll<HTMLElement>('[data-tool]')
      .forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
    $('tool-name').textContent = {
      move: 'V 移动',
      brush: 'B 画笔',
      select: 'M 选区',
      lasso: 'L 套索',
      magnetic: 'L 磁性套索',
      text: 'T 文字',
      wand: 'W 魔棒',
      smart: 'S 智能对象',
      hand: 'H 抓手',
      zoom: 'Z 缩放',
      anchor: '锚点 · 拖动控制点',
      emitter: '发射区域 · 点击或拖框',
    }[tool];
    canvas.style.cursor = {
      move: 'default',
      brush: 'crosshair',
      select: 'crosshair',
      lasso: 'crosshair',
      magnetic: 'crosshair',
      text: 'text',
      wand: 'crosshair',
      smart: 'crosshair',
      hand: 'grab',
      zoom: 'zoom-in',
      anchor: 'crosshair',
      emitter: 'crosshair',
    }[tool];
    if (next === 'smart') {
      bridge
        .invoke('smart-info')
        .then((info) => {
          $('smart-engine-note').textContent = info.available
            ? 'MobileSAM 本地模型已就绪 · Shift 添加 · Alt 排除'
            : 'MobileSAM 未就绪，请安装依赖或使用 GrabCut';
        })
        .catch((e) => ($('smart-engine-note').textContent = e.message));
    }
    if (next === 'text') {
      const text =
        doc && active()?.kind === 'text'
          ? active()
          : doc?.layers.find((l) => l.kind === 'text');
      if (text) {
        selectLayer(text.id);
        $('title-text').focus();
      }
    }
  }
  function fit() {
    if (
      document.querySelector<HTMLElement>('.view-stage')?.dataset.view ===
      'space'
    ) {
      window.atelierSpace?.fit();
      return;
    }
    if (canvas.clientWidth < 100 || canvas.clientHeight < 100) return;
    view.zoom = Math.max(
      0.05,
      Math.min(
        (canvas.clientWidth - 90) / 1024,
        (canvas.clientHeight - 80) / 1536,
      ),
    );
    view.panX = 0;
    view.panY = 0;
    draw();
  }
  function draw() {
    if (drawScheduled) return;
    drawScheduled = true;
    requestAnimationFrame(() => {
      drawScheduled = false;
      paintCanvas();
    });
  }
  function origin() {
    return {
      x: canvas.clientWidth / 2 - 512 * view.zoom + view.panX,
      y: canvas.clientHeight / 2 - 768 * view.zoom + view.panY,
    };
  }
  function docPoint(e) {
    const r = canvas.getBoundingClientRect(),
      o = origin();
    return {
      x: (e.clientX - r.left - o.x) / view.zoom,
      y: (e.clientY - r.top - o.y) / view.zoom,
    };
  }
  const contentBoundsCache = new WeakMap();
  function contentBounds(layer) {
    const source =
      layer.kind === 'text' ? textRaster(layer) : images.get(layer.id);
    if (!source || !['text', 'image'].includes(layer.kind))
      return { x: 0, y: 0, w: 1024, h: 1536 };
    const image =
      layer.kind === 'text'
        ? source
        : importedCardFrameArtwork.imageForLayer(
            layer,
            registeredImage(layer, source),
          );
    if (!contentBoundsCache.has(image))
      contentBoundsCache.set(
        image,
        importedCardTransform.alphaBounds(imageAlpha(image)),
      );
    return contentBoundsCache.get(image) || { x: 0, y: 0, w: 1024, h: 1536 };
  }
  function transformCorners(layer) {
    return importedCardTransform.corners(
      contentBounds(layer),
      importedCardRuntime.placement(doc, layer),
    );
  }
  function canResize(layer) {
    return (
      !!layer &&
      !layer.locked &&
      layer.visible &&
      target === 'image' &&
      layer.kind !== 'frame' &&
      selected.length === 1
    );
  }
  function resizeCorner(p) {
    if (
      !canResize(active()) ||
      !($('transform-controls').checked || freeTransform)
    )
      return -1;
    return transformCorners(active()).findIndex(
      (q) => Math.hypot(p.x - q.x, p.y - q.y) < 10 / view.zoom,
    );
  }
  function scaleLayer(layer, value) {
    const b = contentBounds(layer);
    Object.assign(
      layer,
      importedCardTransform.scaleAt(
        layer,
        importedCardRuntime.placement(doc, layer),
        { x: b.x + b.w / 2, y: b.y + b.h / 2 },
        value,
      ),
    );
  }
  function layerBox(layer) {
    const p = importedCardRuntime.placement(doc, layer);
    return {
      x: p.x + (1024 - 1024 * p.scale) / 2,
      y: p.y + (1536 - 1536 * p.scale) / 2,
      w: 1024 * p.scale,
      h: 1536 * p.scale,
    };
  }
  function roundFrame(context) {
    context.beginPath();
    context.moveTo(55, 0);
    context.lineTo(969, 0);
    context.lineTo(1024, 55);
    context.lineTo(1024, 1481);
    context.lineTo(969, 1536);
    context.lineTo(55, 1536);
    context.lineTo(0, 1481);
    context.lineTo(0, 55);
    context.closePath();
  }

  function syncFonts() {
    for (const option of [...$('text-font').options] as const)
      if (option.dataset.embedded) option.remove();
    for (const font of doc.fonts || []) {
      const option = new Option(font.name, font.family);
      option.dataset.embedded = 'true';
      $('text-font').add(option);
    }
    for (const family of new Set<string>(
      doc.layers
        .filter((l) => l.kind === 'text')
        .map((l) => textStyle(l).fontFamily),
    )) {
      if (![...$('text-font').options].some((o) => o.value === family)) {
        $('text-font').add(new Option(family, family));
      }
    }
  }

  function drawLayer(
    context,
    layer,
    document = doc,
    imageMap = images,
    overrideImage = null,
  ) {
    if (!layer.visible) return;
    context.save();
    context.globalAlpha = layer.opacity;
    const pl = importedCardRuntime.placement(document, layer);
    context.globalCompositeOperation =
      layer.blend === 'add' ? 'lighter' : 'source-over';
    if (
      pl.clip ||
      layer.kind === 'background' ||
      layer.role === 'background-candidate' ||
      layer.role === 'baseplate'
    )
      importedCardFrame.clip(context, importedCardFrame.resolve(document));
    context.translate(512 + pl.x, 768 + pl.y);
    context.rotate(pl.rotation);
    context.scale(pl.scale, pl.scale);
    context.translate(-512, -768);
    if (overrideImage || imageMap.has(layer.id)) {
      const source =
        overrideImage ||
        adjustedImage(layer, registeredImage(layer, imageMap.get(layer.id)));
      const image = importedCardFrameArtwork.imageForLayer(layer, source);
      if (
        context.canvas?.id !== 'editor-canvas' ||
        !window.atelierCharacterAdvanced?.drawLayer(
          context,
          document,
          layer,
          image,
        )
      )
        context.drawImage(image, 0, 0, 1024, 1536);
    } else if (layer.kind === 'frame') {
      if (
        !importedCardFrameArtwork.draw(context, document.componentScenes?.frame)
      )
        importedCardFrame.draw(context, importedCardFrame.resolve(document));
    } else if (layer.kind === 'text') drawText(context, layer, document);
    context.restore();
  }
  function popRaster(layer, image, inset) {
    if (!image) return null;
    let cached = popRasterCache.get(image);
    const key = JSON.stringify([layer.componentAdjustments, layer.adjustments]);
    if (
      cached &&
      cached.inset === inset &&
      cached.version === (maskVersions.get(inset) || 0) &&
      cached.key === key
    )
      return cached.canvas;
    const c = canvasFor(),
      cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(adjustedImage(layer, image), 0, 0, 1024, 1536);
    if (inset) {
      const mask = canvasFor(),
        mc = mask.getContext('2d', { willReadFrequently: true });
      mc.drawImage(inset, 0, 0, 1024, 1536);
      const weights = mc.getImageData(0, 0, 1024, 1536).data,
        data = cc.getImageData(0, 0, 1024, 1536);
      for (let i = 0; i < data.data.length; i += 4) {
        const w = weights[i] / Math.max(1, data.data[i + 3]),
          t = Math.max(0, Math.min(1, (w - 0.02) / 0.48));
        data.data[i + 3] *= 1 - t * t * (3 - 2 * t);
      }
      cc.putImageData(data, 0, 0);
    }
    popRasterCache.set(image, {
      inset,
      version: maskVersions.get(inset) || 0,
      key,
      canvas: c,
    });
    return c;
  }
  function drawComposition(context, document = doc, imageMap = images) {
    const layers = importedCardStats
        .paintOrder(document.layers)
        .filter((l) => l.visible),
      style = importedCardFrame.resolve(document),
      isBack = importedCardSpatial.background;
    if (document.assetKind === 'frame') {
      for (const layer of layers) drawLayer(context, layer, document, imageMap);
      return;
    }
    for (const l of layers.filter(isBack))
      drawLayer(context, l, document, imageMap);
    for (const l of layers.filter((l) => l.kind === 'frame'))
      drawLayer(context, l, document, imageMap);
    const pop = {
        ...importedCardRuntime.compositionDefaults,
        ...document.composition,
      },
      inset = imageMap.get('mask:inset') || masks.get('inset')?.canvas;
    for (const l of layers.filter((l) => l.kind !== 'frame' && !isBack(l))) {
      if (!importedCardSpatial.character(l)) {
        drawLayer(context, l, document, imageMap);
        continue;
      }
      context.save();
      importedCardFrame.clip(context, style);
      drawLayer(context, l, document, imageMap);
      context.restore();
      context.save();
      context.beginPath();
      context.rect(-8192, -8192, 17408, 17920);
      importedCardFrame.windowPath(context, style, true);
      context.clip('evenodd');
      context.beginPath();
      const left = pop.left ? -8192 : style.width,
        top = pop.top ? -8192 : style.width,
        right = pop.right ? 9216 : 1024 - style.width,
        bottom = pop.bottom ? 9728 : 1536 - style.width;
      context.rect(left, top, right - left, bottom - top);
      context.clip();
      drawLayer(
        context,
        l,
        document,
        imageMap,
        popRaster(l, imageMap.get(l.id), inset),
      );
      context.restore();
    }
  }
  function compose() {
    const c = canvasFor();
    drawComposition(c.getContext('2d'));
    return c.toDataURL('image/png');
  }
  function framePreview(document = doc) {
    return (
      importedCardFrameArtwork.preview(document) ||
      importedCardFrameRaster.preview(importedCardFrame.resolve(document))
    );
  }
  function drawSelectionOverlay() {
    if (!selection || !selectionMask || selectionLayer !== active()?.id) return;
    let overlay = selectionOverlays.get(selectionMask);
    if (!overlay) {
      overlay = canvasFor();
      const oc = overlay.getContext('2d'),
        pixels = oc.createImageData(1024, 1536);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 245;
        pixels.data[i + 1] = 98;
        pixels.data[i + 2] = 138;
        pixels.data[i + 3] = selectionMask.data[i] * 0.36;
      }
      oc.putImageData(pixels, 0, 0);
      selectionOverlays.set(selectionMask, overlay);
    }
    const pl = importedCardRuntime.placement(doc, active());
    ctx.save();
    ctx.translate(512 + pl.x, 768 + pl.y);
    ctx.rotate(pl.rotation);
    ctx.scale(pl.scale, pl.scale);
    ctx.drawImage(overlay, -512, -768);
    ctx.restore();
  }
  function paintCanvas() {
    if (!doc) return;
    const ratio = Math.min(devicePixelRatio, 2),
      w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const pixelW = Math.round(w * ratio),
      pixelH = Math.round(h * ratio);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const o = origin();
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.fillStyle = '#2c333c';
    ctx.fillRect(0, 0, 1024, 1536);
    window.atelierCharacterAdvanced?.beginFrame();
    drawComposition(ctx);
    if (!animationFeedback && showMask && masks.has(target)) {
      const pl = importedCardRuntime.placement(doc, active());
      ctx.save();
      ctx.translate(512, 768);
      if (target !== 'subject') {
        ctx.translate(pl.x, pl.y);
        ctx.rotate(pl.rotation);
        ctx.scale(pl.scale, pl.scale);
      }
      ctx.drawImage(
        maskDisplayMode === 'gray'
          ? masks.get(target).canvas
          : masks.get(target).overlay,
        -512,
        -768,
      );
      ctx.restore();
    }
    drawSelectionOverlay();
    drawAnimationFeedback();
    window.atelierCharacterRig?.background(ctx);
    window.atelierCharacterAdvanced?.draw(ctx, view.zoom);
    window.atelierCharacterAdvanced?.outline(ctx, view.zoom);
    window.atelierCharacterRig?.draw(ctx, view.zoom);
    window.atelierCharacterAdvanced?.foreground(ctx, view.zoom);
    window.atelierParticles?.draw(ctx, view.zoom);
    if (tool === 'anchor' && active()) drawAnchors();
    if (tool === 'smart' && smartSession?.layerId === active()?.id) {
      for (let i = 0; i < smartSession.points.length; i++) {
        const p = worldPoint(
          smartSession.points[i][0],
          smartSession.points[i][1],
          active(),
        );
        ctx.fillStyle = smartSession.labels[i] ? '#72efaa' : '#ff7795';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / view.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1 / view.zoom;
    ctx.strokeStyle = '#3e4a55';
    ctx.strokeRect(0, 0, 1024, 1536);
    if (selection) {
      ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
      ctx.strokeStyle = '#7cd5c4';
      if (selection.points) {
        ctx.beginPath();
        selection.points.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        ctx.closePath();
        ctx.stroke();
      } else ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
      ctx.setLineDash([]);
    }
    if (lassoPoints.length) {
      ctx.strokeStyle = '#f5d69b';
      ctx.beginPath();
      lassoPoints.forEach((p, i) => {
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
      for (const p of lassoPoints) {
        ctx.fillStyle = '#f5d69b';
        ctx.fillRect(
          p.x - 3 / view.zoom,
          p.y - 3 / view.zoom,
          6 / view.zoom,
          6 / view.zoom,
        );
      }
    }
    for (const guide of showGuides ? doc.meshGuides || [] : []) {
      ctx.strokeStyle = '#68beb28c';
      ctx.lineWidth = 0.6 / view.zoom;
      ctx.beginPath();
      for (let i = 0; i < guide.indices.length; i += 3) {
        for (const n of [0, 1, 2, 0] as const) {
          const j = guide.indices[i + n];
          const x = guide.uv[j * 2] * 1024,
            y = guide.uv[j * 2 + 1] * 1536;
          n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    const layer = active(),
      characterEditing =
        document.body.dataset.inspectorPanel === 'motion' &&
        doc.characterRig &&
        ($<HTMLSelectElement>('rig-canvas-tool')?.value !== 'off' ||
          $<HTMLSelectElement>('skin-tool')?.value !== 'off');
    if (layer && tool === 'move' && target === 'image' && !characterEditing) {
      const points = transformCorners(layer);
      ctx.strokeStyle = '#6bc8b9';
      ctx.lineWidth = 1 / view.zoom;
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.stroke();
      if (
        canResize(layer) &&
        ($('transform-controls').checked || freeTransform)
      ) {
        for (const p of points) {
          ctx.fillStyle = '#f5d69b';
          ctx.fillRect(
            p.x - 4 / view.zoom,
            p.y - 4 / view.zoom,
            8 / view.zoom,
            8 / view.zoom,
          );
        }
      }
      canvas.dataset.contentBounds = JSON.stringify(contentBounds(layer));
      canvas.dataset.transformHandles = JSON.stringify(
        points.map((p) => ({
          x: o.x + p.x * view.zoom,
          y: o.y + p.y * view.zoom,
        })),
      );
    } else {
      delete canvas.dataset.transformHandles;
    }
    ctx.restore();
    $('zoom-status').textContent = Math.round(view.zoom * 100) + '%';
    canvas.dataset.characterView = JSON.stringify({
      zoom: view.zoom,
      origin: o,
    });
    canvas.dataset.frameRaster = JSON.stringify(
      importedCardFrameRaster.stats(),
    );
    canvas.dataset.revision = String(revision);
    canvas.dataset.target = target;
    if (tool !== 'anchor') delete canvas.dataset.anchorHandles;
    canvas.dataset.layer = selected[0];
    canvas.dataset.selection = selection ? JSON.stringify(selection) : '';
    syncRegionHighlight();
  }
  let animationFeedback = null;
  function drawAnimationFeedback() {
    if (!animationFeedback?.locate) {
      delete canvas.dataset.animationBounds;
      return;
    }
    const f = animationFeedback;
    ctx.save();
    if (f.scope === 'whole') {
      const points = importedCardAnimationAuthoring.guide(
        { ...f.sample, pitch: (f.sample.pitch * Math.PI) / 180 },
        importedCardSpatial.camera(doc),
      );
      ctx.strokeStyle = '#ffd58a';
      ctx.lineWidth = 2 / view.zoom;
      ctx.setLineDash([7 / view.zoom, 4 / view.zoom]);
      ctx.beginPath();
      points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.closePath();
      ctx.stroke();
      canvas.dataset.animationBounds = JSON.stringify(points);
    } else {
      const l = doc.layers.find((l) => l.id === f.layerId),
        m = masks.get(f.maskId);
      if (l && m) {
        const p = importedCardRuntime.placement(doc, l);
        ctx.translate(512 + p.x, 768 + p.y);
        ctx.rotate(p.rotation);
        ctx.scale(p.scale, p.scale);
        ctx.globalAlpha = 0.7;
        ctx.drawImage(m.overlay, -512, -768);
      }
      delete canvas.dataset.animationBounds;
    }
    ctx.restore();
  }
  let regionMode = 'none',
    regionMaskId = 'motion',
    regionSelectionCache = null,
    regionSelectionVersion = 0;
  function syncRegionHighlight() {
    const layer = active();
    if (!doc || !layer) return;
    if (animationFeedback?.locate) {
      $('preview-region-mode').disabled = true;
      $('preview-region-mode').value = String(
        animationFeedback.scope === 'region' ? 'mask' : 'none',
      );
    } else $('preview-region-mode').disabled = false;
    if (animationFeedback?.locate && animationFeedback.scope === 'whole') {
      window.cardPreview.setRegion?.({ mode: 'none', layerId: layer.id });
      return;
    }
    if (animationFeedback?.locate && animationFeedback.scope === 'region') {
      const f = animationFeedback,
        m = masks.get(f.maskId);
      window.cardPreview.setRegion?.({
        mode: 'mask',
        layerId: f.layerId,
        maskId: f.maskId,
        map: m?.canvas,
        version: m ? maskVersions.get(m.canvas) : 0,
      });
      return;
    }
    const value: {
        mode: string;
        layerId: string;
        map?: ImageData | HTMLCanvasElement;
        version?: number;
        maskId?: string;
      } = { mode: regionMode, layerId: layer.id },
      control = $('preview-region-mode'),
      note = $('preview-region-note');
    let message = '';
    if (regionMode === 'mask') {
      if (target !== 'image') regionMaskId = target;
      const mask = masks.get(regionMaskId);
      value.map = mask?.canvas;
      value.version = mask ? maskVersions.get(mask.canvas) : 0;
      value.maskId = regionMaskId;
      const supported =
        regionMaskId === 'subject' || importedCardSpatial.character(layer);
      message = supported
        ? maskNames[regionMaskId] + ' · 橙色为有效区域'
        : '请选择人物或已拆出的衣料层';
      if (!supported) value.map = null;
    } else if (regionMode === 'selection') {
      if (selection && selectionLayer === layer.id) {
        const key = JSON.stringify([
          selection,
          importedCardRuntime.placement(doc, layer),
        ]);
        if (
          !regionSelectionCache ||
          regionSelectionCache.key !== key ||
          regionSelectionCache.source !== selectionMask
        ) {
          let map = selectionMask,
            previewCanvas = regionSelectionCache?.canvas;
          if (!map) {
            previewCanvas ||= canvasFor();
            map = previewCanvas;
            const cc = map.getContext('2d');
            cc.fillStyle = 'black';
            cc.fillRect(0, 0, 1024, 1536);
            cc.fillStyle = 'white';
            cc.beginPath();
            const points = selection.points || [
              { x: selection.x, y: selection.y },
              { x: selection.x + selection.w, y: selection.y },
              { x: selection.x + selection.w, y: selection.y + selection.h },
              { x: selection.x, y: selection.y + selection.h },
            ];
            points.forEach((p, i) => {
              const q = localPoint(p, layer);
              i ? cc.lineTo(q.x, q.y) : cc.moveTo(q.x, q.y);
            });
            cc.closePath();
            cc.fill();
          }
          regionSelectionCache = {
            key,
            source: selectionMask,
            map,
            canvas: previewCanvas,
            version: ++regionSelectionVersion,
          };
        }
        value.map = regionSelectionCache.map;
        value.version = regionSelectionCache.version;
        message = '橙色为当前选区 · 跟随图层变换';
      } else message = '在当前图层上拖框、套索或智能选区';
    } else if (regionMode === 'connection')
      message = importedCardSpatial.connection(doc, layer)
        ? '蓝：固定 · 黄：过渡 · 粉：自由末端'
        : '请选择已拆出的披风或裙摆';
    else if (regionMode === 'channels')
      message = importedCardSpatial.character(layer)
        ? '青：框内 · 橙：破框 · 按实际遮挡显示'
        : '请选择人物或已拆出的衣料层';
    else if (regionMode === 'layer')
      message = layer.name + ' · 青色标记可见部分';
    control.value = regionMode;
    note.hidden = regionMode === 'none';
    note.textContent = message;
    window.cardPreview.setRegion?.(value);
  }
  function localPoint(p, layer) {
    const pl = importedCardRuntime.placement(doc, layer),
      x = p.x - 512 - pl.x,
      y = p.y - 768 - pl.y,
      c = Math.cos(pl.rotation),
      sin = Math.sin(pl.rotation);
    return {
      x: (c * x + sin * y) / pl.scale + 512,
      y: (-sin * x + c * y) / pl.scale + 768,
    };
  }
  function worldPoint(x, y, layer) {
    const pl = importedCardRuntime.placement(doc, layer),
      c = Math.cos(pl.rotation),
      s = Math.sin(pl.rotation);
    x = (x - 512) * pl.scale;
    y = (y - 768) * pl.scale;
    return { x: 512 + pl.x + c * x - s * y, y: 768 + pl.y + s * x + c * y };
  }
  function anchorValues(l) {
    return (
      l.motionAnchor ||
      (l.attachment?.anchor?.edge === 'segment'
        ? { root: l.attachment.anchor.root, tip: l.attachment.anchor.tip }
        : { root: [512, 540], tip: [512, 1200] })
    );
  }
  function drawAnchors() {
    const l = active(),
      a = anchorValues(l),
      points: Array<[number, number, string]> =
        anchorMode === 'pivot'
          ? [
              [
                (l.pivot?.u ?? 0.5) * 1024,
                (l.pivot?.v ?? 0.5) * 1536,
                '旋转中心',
              ],
            ]
          : [
              [a.root[0], a.root[1], '固定点'],
              [a.tip[0], a.tip[1], '自由端'],
            ];
    ctx.save();
    ctx.lineWidth = 2 / view.zoom;
    ctx.strokeStyle = '#f6c76b';
    if (points.length === 2) {
      ctx.beginPath();
      points.forEach(([x, y], i) => {
        const p = worldPoint(x, y, l);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
    }
    const handles = [];
    for (const [x, y, label] of points) {
      const p = worldPoint(x, y, l);
      ctx.fillStyle = label === '固定点' ? '#70baff' : '#f6c76b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 / view.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${12 / view.zoom}px system-ui`;
      ctx.fillText(i18n.text(label, i18n.language(document.documentElement.lang)), p.x + 12 / view.zoom, p.y - 9 / view.zoom);
      const o = origin();
      handles.push({
        x: o.x + p.x * view.zoom,
        y: o.y + p.y * view.zoom,
        label,
      });
    }
    canvas.dataset.anchorHandles = JSON.stringify(handles);
    ctx.restore();
  }
  function updateAnchor(p, g) {
    const l = active(),
      pl = g.placement,
      x = p.x - 512 - pl.x,
      y = p.y - 768 - pl.y,
      c = Math.cos(pl.rotation),
      s = Math.sin(pl.rotation),
      q = [
        Math.max(0, Math.min(1023, (c * x + s * y) / pl.scale + 512)),
        Math.max(0, Math.min(1535, (-s * x + c * y) / pl.scale + 768)),
      ];
    if (g.point === 'pivot') {
      l.pivot = { u: q[0] / 1024, v: q[1] / 1536 };
      const offset = importedCardMaskEdit.pivotOffset(
        l.pivot,
        pl.scale,
        pl.rotation,
      );
      l.x = g.baseX + g.baseOffset.x - offset.x;
      l.y = g.baseY + g.baseOffset.y - offset.y;
    } else {
      const a = structuredClone(l.motionAnchor || anchorValues(l)),
        other = g.point === 'root' ? a.tip : a.root;
      if (Math.hypot(q[0] - other[0], q[1] - other[1]) < 16) return;
      a[g.point] = q;
      l.motionAnchor = a;
      if (l.splitSourceId) {
        l.attachment = {
          maxOffset: 0.025,
          blendWidth: 64,
          motion: 0.35,
          ...l.attachment,
          anchor: { edge: 'segment', ...a },
        };
      }
    }
    syncPreview();
    draw();
  }
  function stamp(p) {
    const layer = active(),
      mask = masks.get(target);
    if (!mask || layer.locked) return;
    const overlayPixels = mask.overlayPixels;
    const subject = target === 'subject',
      q = subject ? p : localPoint(p, layer),
      radius = Number($('brush-size').value) / 2,
      strength = Number($('brush-strength').value) / 100;
    const x0 = Math.max(0, Math.floor(q.x - radius)),
      y0 = Math.max(0, Math.floor(q.y - radius)),
      x1 = Math.min(1023, Math.ceil(q.x + radius)),
      y1 = Math.min(1535, Math.ceil(q.y + radius));
    const guard = masks.get('rigid')?.pixels.data;
    const coverage = masks.get('coverage')?.pixels.data;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const pixel = selection
            ? subject
              ? { x, y }
              : worldPoint(x, y, layer)
            : null,
          pixelDocX = pixel?.x,
          pixelDocY = pixel?.y;
        if (
          selection &&
          (pixelDocX < selection.x ||
            pixelDocX > selection.x + selection.w ||
            pixelDocY < selection.y ||
            pixelDocY > selection.y + selection.h)
        )
          continue;
        if (selectionMask && selectionLayer === layer.id) {
          const selected = subject ? localPoint({ x, y }, layer) : { x, y };
          if (
            selected.x < 0 ||
            selected.x >= 1024 ||
            selected.y < 0 ||
            selected.y >= 1536 ||
            selectionMask.data[
              (Math.floor(selected.y) * 1024 + Math.floor(selected.x)) * 4
            ] < 1
          )
            continue;
        }
        const distance = Math.hypot(x - q.x, y - q.y) / radius;
        if (distance >= 1) continue;
        const i = (y * 1024 + x) * 4;
        if (!subject && target !== 'coverage' && coverage && coverage[i] < 1)
          continue;
        const protectedValue =
          target === 'motion' && $('rigid-protection').checked && guard
            ? guard[i] / 255
            : 0;
        const old = mask.pixels.data[i];
        let value = importedCardMaskEdit.brush(
          old,
          brushValue,
          strength,
          distance,
          brushHardness,
        );
        value = Math.min(value, Math.round(255 * (1 - protectedValue)));
        mask.pixels.data[i] =
          mask.pixels.data[i + 1] =
          mask.pixels.data[i + 2] =
            value;
        overlayPixels.data[i + 3] = value * 0.65;
      }
    if (x1 >= x0 && y1 >= y0) {
      mask.ctx.putImageData(
        mask.pixels,
        0,
        0,
        x0,
        y0,
        x1 - x0 + 1,
        y1 - y0 + 1,
      );
      mask.overlayCtx.putImageData(
        overlayPixels,
        0,
        0,
        x0,
        y0,
        x1 - x0 + 1,
        y1 - y0 + 1,
      );
    }
    if (x1 >= x0 && y1 >= y0)
      paintDirty = importedCardMaskEdit.union(paintDirty, {
        x: x0,
        y: y0,
        width: x1 - x0 + 1,
        height: y1 - y0 + 1,
      });
    if (!paintSync) {
      const paintedTarget = target;
      paintSync = requestAnimationFrame(() => flushPaint(paintedTarget));
    }
  }
  function flushPaint(id) {
    if (paintSync) cancelAnimationFrame(paintSync);
    paintSync = 0;
    const rect = paintDirty;
    paintDirty = null;
    const mask = masks.get(id);
    if (!mask || !rect) return;
    maskVersions.set(mask.canvas, (maskVersions.get(mask.canvas) || 0) + 1);
    window.cardPreview.updateMask(id, mask.pixels, rect, {
      canvas: mask.canvas,
      version: maskVersions.get(mask.canvas),
    });
    draw();
  }
  function hit(p) {
    for (const layer of doc.layers) {
      if (!layer.visible || layer.locked) continue;
      const b = layerBox(layer),
        q0 = localPoint(p, layer);
      if (q0.x < 0 || q0.x >= 1024 || q0.y < 0 || q0.y >= 1536) continue;
      if (layer.kind === 'text') {
        const q = localPoint(p, layer);
        if (
          imageAlpha(textRaster(layer))[
            Math.floor(q.y) * 1024 + Math.floor(q.x)
          ] > 10
        )
          return layer.id;
        continue;
      }
      if (layer.kind === 'frame') {
        const style = importedCardFrame.resolve(doc);
        if (
          importedCardFrame.contains(style, q0.x, q0.y) &&
          !importedCardFrame.contains(style, q0.x, q0.y, style.width)
        )
          return layer.id;
        continue;
      }
      if (layer.kind === 'foreground') {
        const q = localPoint(p, layer),
          x = Math.max(0, Math.min(1023, Math.floor(q.x))),
          y = Math.max(0, Math.min(1535, Math.floor(q.y)));
        if (masks.get('coverage').pixels.data[(y * 1024 + x) * 4] < 10)
          continue;
      } else if (images.has(layer.id)) {
        const q = localPoint(p, layer),
          x = Math.max(0, Math.min(1023, Math.floor(q.x))),
          y = Math.max(0, Math.min(1535, Math.floor(q.y)));
        if (
          imageAlpha(
            importedCardFrameArtwork.imageForLayer(
              layer,
              registeredImage(layer, images.get(layer.id)),
            ),
          )[y * 1024 + x] < 10
        )
          continue;
      }
      return layer.id;
    }
    return null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!doc || loading || applying) return;
    const p = docPoint(e);
    canvas.setPointerCapture(e.pointerId);
    if (space || tool === 'hand') {
      gesture = {
        kind: 'pan',
        x: e.clientX,
        y: e.clientY,
        panX: view.panX,
        panY: view.panY,
      };
      return;
    }
    if (tool === 'zoom') {
      view.zoom = Math.min(2.5, view.zoom * (e.altKey ? 0.8 : 1.25));
      draw();
      return;
    }
    if (
      e.button === 0 &&
      tool === 'move' &&
      target === 'image' &&
      !busy &&
      !gesture &&
      !freeTransform
    ) {
      try {
        const edit =
          window.atelierCharacterAdvanced?.pointerDown(p, view.zoom, e) ||
          window.atelierCharacterRig?.pointerDown(p, view.zoom);
        if (edit) {
          if (edit.update) {
            gesture = { kind: 'character', before: snapshot(), ...edit };
            if (edit.onPress !== false) edit.update(doc, p);
            syncPreview();
            draw();
          }
          return;
        }
      } catch (error) {
        if (gesture) endGesture(true);
        say(error.message);
        return;
      }
    }
    if (tool === 'smart') {
      const layer = active(),
        im = images.get(layer.id);
      if (!im || busy) {
        say('先选择图像图层');
        return;
      }
      const q = localPoint(p, layer);
      if (q.x < 0 || q.x >= 1024 || q.y < 0 || q.y >= 1536) return;
      const previousSelection = captureSelection();
      const same =
        smartSession?.layerId === layer.id && smartSession?.src === layer.src;
      if ($('smart-mode').value === 'box') {
        smartSession = {
          layerId: layer.id,
          src: layer.src,
          points: [],
          labels: [],
          box: null,
        };
        selectionMask = null;
        selectionLayer = layer.id;
        gesture = {
          kind: 'smart-box',
          start: q,
          selectionBefore: previousSelection,
        };
        return;
      }
      if (!same || (!e.shiftKey && !e.altKey))
        smartSession = {
          layerId: layer.id,
          src: layer.src,
          points: [],
          labels: [],
          box: null,
        };
      if (smartSession.points.length >= 64) {
        say('最多 64 个对象提示点');
        return;
      }
      smartSession.points.push([q.x, q.y]);
      smartSession.labels.push(e.altKey ? 0 : 1);
      runSmartSelection(previousSelection);
      return;
    }
    if (tool === 'lasso' || tool === 'magnetic') {
      if (!images.has(active().id)) {
        say('先选择图像图层');
        return;
      }
      if (!lassoPoints.length) {
        selection = null;
        selectionMask = null;
        selectionLayer = active().id;
      }
      if (selectionLayer !== active().id) {
        say('请先完成或取消原图层的套索');
        return;
      }
      const q = localPoint(p, active());
      if (q.x < 0 || q.x > 1024 || q.y < 0 || q.y > 1536) return;
      if (
        lassoPoints.length >= 3 &&
        Math.hypot(p.x - lassoPoints[0].x, p.y - lassoPoints[0].y) <
          12 / view.zoom
      ) {
        closeLasso();
        return;
      }
      lassoPoints.push(p);
      syncProperties();
      draw();
      say('继续沿区域点击；Enter 闭合，Backspace 删除上一点');
      return;
    }
    if (tool === 'wand') {
      const layer = active(),
        im = images.get(layer.id);
      if (!im || busy) return;
      const q = localPoint(p, layer);
      processTask(
        '魔棒颜色选区',
        'wand_selection',
        {
          image: pngFromImage(registeredImage(layer, im)),
          x: Math.floor(q.x),
          y: Math.floor(q.y),
          tolerance: Number($('wand-tolerance').value),
          contiguous: $('wand-contiguous').checked,
          feather: Number($('selection-feather').value),
        },
        async (result) => setSelectionImage(result.image),
      );
      return;
    }
    if (tool === 'select') {
      selectionMask = null;
      lassoPoints = [];
      selectionLayer = active().id;
      gesture = { kind: 'select', start: p };
      selection = { x: p.x, y: p.y, w: 0, h: 0 };
      draw();
      return;
    }
    if (tool === 'emitter') {
      if (busy || gesture || freeTransform) return;
      if (window.atelierParticles?.canDraw()) {
        gesture = { kind: 'emitter', before: snapshot(), start: p };
        window.atelierParticles.drag(p, p, doc);
        syncPreview();
        draw();
      }
      return;
    }
    if (tool === 'anchor') {
      const l = active();
      if (l.locked || l.kind === 'frame') {
        say('先选择未锁定的图片图层');
        return;
      }
      const a = anchorValues(l),
        q = localPoint(p, l),
        point =
          anchorMode === 'pivot'
            ? 'pivot'
            : Math.hypot(q.x - a.root[0], q.y - a.root[1]) <=
                Math.hypot(q.x - a.tip[0], q.y - a.tip[1])
              ? 'root'
              : 'tip';
      gesture = {
        kind: 'anchor',
        before: snapshot(),
        point,
        baseX: l.x,
        baseY: l.y,
        baseOffset: importedCardMaskEdit.pivotOffset(
          l.pivot,
          importedCardRuntime.placement(doc, l).scale,
          importedCardRuntime.placement(doc, l).rotation,
        ),
        placement: importedCardRuntime.placement(doc, l),
      };
      updateAnchor(p, gesture);
      return;
    }
    if (tool === 'brush') {
      if (target === 'image') {
        say('先点击人物层的运动、框内外或发光 Mask');
        return;
      }
      if (active().locked) {
        say('当前图层已锁定');
        return;
      }
      if (target === 'subject' && !masks.has('subject'))
        void registerMask('subject', blankMaskCanvas());
      gesture = { kind: 'brush', before: snapshot(), last: p, target };
      stamp(p);
      return;
    }
    if (tool === 'move') {
      const corner = resizeCorner(p);
      if (
        corner < 0 &&
        !freeTransform &&
        $('auto-select').checked &&
        target === 'image'
      ) {
        const id = hit(p);
        if (id && !selected.includes(id)) selectLayer(id);
      }
      if (
        doc.layers.some(
          (l) => selected.includes(l.id) && (l.locked || l.kind === 'frame'),
        )
      ) {
        say('选中范围包含锁定图层或固定卡框；请解锁或取消选择卡框');
        return;
      }
      if (target !== 'image') {
        say('Mask 与原图保持注册。先点击图像缩略图再移动');
        return;
      }
      const kind =
        corner >= 0
          ? 'transform-scale'
          : freeTransform
            ? 'transform-move'
            : 'move';
      gesture = {
        kind,
        before: snapshot(),
        start: p,
        layers: doc.layers
          .filter((l) => selected.includes(l.id))
          .map((l) => ({ ...l })),
        originalScale: active().scale,
        corner,
        bounds: contentBounds(active()),
        placement: importedCardRuntime.placement(doc, active()),
        deferred: freeTransform,
      };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!gesture) {
      if (window.atelierCharacterAdvanced?.hover(docPoint(e))) {
        canvas.style.cursor = 'crosshair';
        return;
      }
      if (tool === 'move')
        canvas.style.cursor =
          window.atelierCharacterRig?.cursor(docPoint(e), view.zoom) ||
          (resizeCorner(docPoint(e)) >= 0 ? 'nwse-resize' : 'default');
      return;
    }
    const p = docPoint(e),
      g = gesture;
    if (g.kind === 'character') {
      try {
        g.update(doc, p);
        syncPreview();
        draw();
      } catch (error) {
        endGesture(true);
        say(error.message);
      }
      return;
    }
    if (g.kind === 'emitter') {
      window.atelierParticles.drag(p, g.start, doc);
      syncPreview();
      draw();
      return;
    }
    if (g.kind === 'anchor') {
      updateAnchor(p, g);
      return;
    }
    if (g.kind === 'pan') {
      view.panX = g.panX + e.clientX - g.x;
      view.panY = g.panY + e.clientY - g.y;
      draw();
      return;
    }
    if (g.kind === 'smart-box') {
      const q = localPoint(p, active()),
        x = Math.max(0, Math.min(1024, q.x)),
        y = Math.max(0, Math.min(1536, q.y));
      smartSession.box = [
        Math.min(g.start.x, x),
        Math.min(g.start.y, y),
        Math.max(g.start.x, x),
        Math.max(g.start.y, y),
      ];
      const [x0, y0, x1, y1] = smartSession.box;
      selection = selectionBounds(
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ].map((v) => worldPoint(v[0], v[1], active())),
      );
      syncProperties();
      draw();
      return;
    }
    if (g.kind === 'select') {
      const x1 = Math.max(0, Math.min(1024, g.start.x)),
        x2 = Math.max(0, Math.min(1024, p.x)),
        y1 = Math.max(0, Math.min(1536, g.start.y)),
        y2 = Math.max(0, Math.min(1536, p.y));
      selection = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x1 - x2),
        h: Math.abs(y1 - y2),
      };
      syncProperties();
      draw();
      return;
    }
    if (g.kind === 'brush') {
      const dist = Math.hypot(p.x - g.last.x, p.y - g.last.y),
        steps = Math.min(
          100,
          Math.max(1, Math.ceil(dist / (Number($('brush-size').value) * 0.25))),
        );
      for (let i = 1; i <= steps; i++)
        stamp({
          x: g.last.x + ((p.x - g.last.x) * i) / steps,
          y: g.last.y + ((p.y - g.last.y) * i) / steps,
        });
      g.last = p;
      return;
    }
    if (g.kind === 'transform-scale') {
      Object.assign(
        active(),
        importedCardTransform.dragScale(
          g.layers.find((l) => l.id === active().id),
          g.placement,
          g.bounds,
          g.corner,
          p,
        ),
      );
      syncPreview();
      syncProperties();
      draw();
      return;
    }
    if (g.kind === 'move' || g.kind === 'transform-move') {
      for (const original of g.layers) {
        const layer = doc.layers.find((l) => l.id === original.id);
        if (layer.locked) continue;
        let x = original.x + p.x - g.start.x,
          y = original.y + p.y - g.start.y;
        if (Math.abs(x) < 8 / view.zoom) x = 0;
        if (Math.abs(y) < 8 / view.zoom) y = 0;
        layer.x = Math.round(x);
        layer.y = Math.round(y);
      }
      syncPreview();
      syncProperties();
      draw();
    }
  });
  async function endGesture(cancel = false) {
    const g = gesture;
    if (!g) return;
    gesture = null;
    if (g.kind === 'character') {
      try {
        if (cancel) doc = g.before;
        else {
          importedCardRuntime.validate(doc);
          if (
            JSON.stringify(doc.characterRig) !==
              JSON.stringify(g.before.characterRig) ||
            JSON.stringify(doc.actions) !== JSON.stringify(g.before.actions)
          )
            push(g.before, g.label);
        }
      } catch (error) {
        cancel = true;
        doc = g.before;
        say(error.message);
      }
      syncPreview();
      syncProperties();
      draw();
      g.finish?.({ cancelled: cancel });
      return;
    }
    if (g.kind === 'emitter') {
      if (cancel) doc = g.before;
      else if (
        JSON.stringify(doc.emissionRegions) !==
          JSON.stringify(g.before.emissionRegions) ||
        JSON.stringify(doc.particles) !== JSON.stringify(g.before.particles)
      )
        push(g.before, '定位发射区域');
      syncPreview();
      syncProperties();
      draw();
      return;
    }
    if (g.kind === 'anchor') {
      if (cancel) doc = g.before;
      else
        push(
          g.before,
          g.point === 'pivot' ? '设置旋转中心' : '设置衣料固定点与自由端',
        );
      syncPreview();
      syncProperties();
      draw();
      return;
    }
    if (g.kind === 'brush') {
      flushPaint(g.target);
      doc.masks[g.target] = masks.get(g.target).canvas.toDataURL('image/png');
      if (cancel) {
        doc = g.before;
        await registerMask(g.target, doc.masks[g.target] || blankMaskCanvas());
        draw();
        return;
      }
      if (g.target === 'coverage') await updateCoverage();
      push(g.before, '绘制 ' + maskNames[g.target] + ' Mask');
      say('Mask 已更新，3D 已同步；一笔对应一次撤销');
    } else if (['move', 'transform-move', 'transform-scale'].includes(g.kind)) {
      if (cancel) {
        doc = g.before;
        syncPreview();
        syncProperties();
        draw();
      } else if (
        !g.deferred &&
        g.layers.some((l) => {
          const current = doc.layers.find((x) => x.id === l.id);
          return (
            current &&
            (current.x !== l.x ||
              current.y !== l.y ||
              current.scale !== l.scale)
          );
        })
      ) {
        push(
          g.before,
          g.kind === 'transform-scale'
            ? '缩放图层'
            : g.space
              ? '空间视图移动图层'
              : '移动图层',
        );
      }
      syncProperties();
    } else if (g.kind === 'smart-box') {
      if (
        cancel ||
        !smartSession?.box ||
        smartSession.box[2] - smartSession.box[0] < 3 ||
        smartSession.box[3] - smartSession.box[1] < 3
      ) {
        selection = null;
        draw();
        return;
      }
      await runSmartSelection(g.selectionBefore);
    } else if (g.kind === 'select') {
      if (selection.w < 3 || selection.h < 3) selection = null;
      syncProperties();
      draw();
    }
  }
  canvas.addEventListener('pointerup', () =>
    endGesture().catch((e) => say(e.message)),
  );
  canvas.addEventListener('pointercancel', () =>
    endGesture(true).catch((e) => say(e.message)),
  );
  canvas.addEventListener('lostpointercapture', () => {
    if (gesture) endGesture(true).catch((e) => say(e.message));
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (space || e.shiftKey) {
        view.panX -= e.deltaX;
        view.panY -= e.deltaY;
      } else
        view.zoom = Math.max(
          0.12,
          Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015)),
        );
      draw();
    },
    { passive: false },
  );
  async function updateCoverage() {
    const layer = doc.layers.find((l) => l.kind === 'foreground');
    const master = await imageFrom(layer.master || layer.src);
    const c = canvasFor(),
      cc = c.getContext('2d');
    cc.drawImage(master, 0, 0);
    const pixels = cc.getImageData(0, 0, 1024, 1536),
      coverage = masks.get('coverage').pixels.data;
    for (let i = 0; i < pixels.data.length; i += 4)
      pixels.data[i + 3] = Math.min(pixels.data[i + 3], coverage[i]);
    cc.putImageData(pixels, 0, 0);
    layer.src = c.toDataURL('image/png');
    images.set(layer.id, await imageFrom(layer.src));
    syncTextures();
  }
  async function restore(entry, destination) {
    if (!entry) return;
    if (freeTransform || applying) {
      say('先完成当前变换或处理应用');
      return;
    }
    applying = true;
    try {
      destination.push({
        document: snapshot(),
        workshop: workshop,
        label: entry.label,
        ...(entry.selection ? { selection: await captureSelection() } : {}),
        ...(entry.editorView ? { editorView: editorView() } : {}),
      });
      const changedCard = doc.id !== entry.document.id;
      workshop = entry.workshop ? W.clone(entry.workshop) : null;
      await updateDocument(entry.document);
      if (entry.selection) {
        const s = entry.selection;
        selectionLayer = s.layerId;
        selectionMask = null;
        selection = s.bounds;
        lassoPoints = s.points;
        smartSession = s.smart
          ? {
              ...structuredClone(s.smart),
              src: doc.layers.find((l) => l.id === s.smart.layerId)?.src,
            }
          : null;
        if (doc.layers.some((l) => l.id === s.layerId)) selected = [s.layerId];
        if (s.image) {
          await setSelectionImage(s.image);
          selection = s.bounds;
        }
      }
      dirty();
      $('document-name').textContent =
        doc.name + (workshop ? ' · ' + workshop.name : '.cardproj');
      syncFonts();
      syncPreview();
      if (changedCard && entry.editorView) restoreEditorView(entry.editorView);
      renderLayers();
      syncProperties();
      draw();
      $('history-log').textContent = entry.label + ' / 历史恢复';
      say('已恢复图层、Mask 与实时预览');
    } finally {
      applying = false;
      syncProperties();
    }
  }
  async function processTask(label, op, args, apply, selectionOverride = null) {
    if (busy) {
      say('已有处理任务，可先取消');
      return;
    }
    busy = true;
    const token = ++taskToken,
      atRevision = revision,
      atLayer = selected[0];
    const before = snapshot(),
      selectionBefore = selectionOverride
        ? await selectionOverride
        : [
              'selection',
              'refine_selection',
              'wand_selection',
              'smart_selection',
            ].includes(op)
          ? await captureSelection()
          : null;
    $('cancel-task').hidden = false;
    $('task-log').textContent =
      label +
      ' · ' +
      (op === 'smart_selection'
        ? '本地模型处理中，首次加载需要数秒'
        : 'Rust 处理中');
    syncProperties();
    try {
      const result = await bridge.invoke('process', { op, args });
      if (token !== taskToken) return;
      if (
        atRevision !== revision ||
        gesture ||
        freeTransform ||
        atLayer !== selected[0]
      ) {
        say('文档或编辑目标已发生变化，旧任务结果未覆盖当前编辑');
        $('task-log').textContent = '结果已过期；请在当前版本重新执行';
        return;
      }
      applying = true;
      await apply(result);
      applying = false;
      if (token !== taskToken) return;
      push(before, label, selectionBefore);
      renderLayers();
      $('task-log').textContent =
        `${label} · ${result.engine || 'Rust'} ${result.elapsedMs.toFixed(1)} ms${result.embeddingCached ? ' · 图片缓存' : ''}`;
      say('处理结果已应用，可撤销');
    } catch (error) {
      if (token === taskToken) {
        say(error.message);
        $('task-log').textContent = '任务结束：' + error.message;
      }
    } finally {
      applying = false;
      if (token === taskToken) {
        busy = false;
        $('cancel-task').hidden = true;
        syncProperties();
      }
    }
  }
  $('feather-mask').onclick = () => {
    if (!masks.has(target) || active().locked) return;
    const id = target;
    const args: { image: string; radius: number; guard?: string } = {
      image: masks.get(id).canvas.toDataURL('image/png'),
      radius: 4,
    };
    if (id === 'motion' && $('rigid-protection').checked)
      args.guard = doc.masks.rigid;
    processTask(
      '羽化 ' + maskNames[id] + ' Mask',
      'feather',
      args,
      async (result) => {
        doc.masks[id] = result.image;
        await registerMask(id, result.image);
        if (id === 'coverage') await updateCoverage();
      },
    );
  };
  $('create-mesh').onclick = () => {
    if (!selection) return;
    const r = { ...selection };
    const bounds = [
      Math.max(0, r.x / 1024),
      Math.max(0, r.y / 1536),
      Math.min(1, (r.x + r.w) / 1024),
      Math.min(1, (r.y + r.h) / 1536),
    ];
    processTask(
      '创建区域网格引导',
      'mesh',
      { bounds, subdivisions: 12 },
      async (result) => {
        doc.meshGuides.push({
          ...result,
          id: 'mesh-' + Date.now(),
          layerId: selected[0],
        });
      },
    );
  };
  $('cancel-task').onclick = async () => {
    taskToken++;
    busy = false;
    $('cancel-task').hidden = true;
    await bridge.invoke('cancel');
    $('task-log').textContent = '已取消 Rust 处理';
    syncProperties();
    say('任务已取消，文档未被旧结果覆盖');
  };
  $('guide-display').onclick = () => {
    showGuides = !showGuides;
    $('guide-display').textContent = showGuides ? '隐藏引导' : '显示引导';
    draw();
  };
  $('clear-selection').onclick = () =>
    changeSelection(false).catch((e) => say(e.message));
  async function changeSelection(all) {
    if (!doc || loading || applying || gesture || freeTransform) return;
    if (busy) await $('cancel-task').onclick(new PointerEvent('click'));
    if (!all && !selection && !lassoPoints.length && !smartSession) return;
    const before = snapshot(),
      previous = await captureSelection();
    selection = all ? { x: 0, y: 0, w: 1024, h: 1536 } : null;
    selectionMask = null;
    selectionLayer = all ? active().id : null;
    lassoPoints = [];
    smartSession = null;
    if (all) setTool('select');
    push(before, all ? '全选画幅' : '取消选区', previous);
  }
  $('smart-reset').onclick = () => $('clear-selection').click();
  async function runSmartSelection(previousSelection = null) {
    try {
      const layer = active();
      if (!smartSession || smartSession.layerId !== layer.id) return;
      const s = smartSession;
      await processTask(
        '智能对象选区',
        'smart_selection',
        {
          image: pngFromImage(registeredImage(layer, images.get(layer.id))),
          points: s.points,
          labels: s.labels,
          box: s.box,
          engine: $('smart-engine').value,
        },
        async (result) => {
          await setSelectionImage(result.image);
          $('smart-engine-note').textContent =
            result.engine +
            ' · ' +
            result.activePixels +
            ' 像素' +
            (result.embeddingCached ? ' · 复用图片缓存' : '');
        },
        previousSelection,
      );
    } catch (e) {
      say(e.message);
    }
  }
  function selectionBounds(points) {
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
      points,
    };
  }
  async function captureSelection() {
    return {
      layerId: selectionLayer,
      bounds: selection ? structuredClone(selection) : null,
      points: structuredClone(lassoPoints),
      smart: smartSession
        ? {
            layerId: smartSession.layerId,
            points: structuredClone(smartSession.points),
            labels: [...smartSession.labels],
            box: smartSession.box ? [...smartSession.box] : null,
          }
        : null,
      image:
        selectionMask && selectionLayer === active()?.id
          ? await localSelection()
          : null,
    };
  }
  async function localSelection(cardSpace = false) {
    if (!selection || selectionLayer !== active().id)
      throw Error('请在当前图层重新建立选区');
    if (selectionMask) {
      const c = canvasFor();
      c.getContext('2d').putImageData(selectionMask, 0, 0);
      if (!cardSpace) return c.toDataURL('image/png');
      const registered = blankMaskCanvas(),
        ctx = registered.getContext('2d');
      const pl = importedCardRuntime.placement(doc, active());
      ctx.translate(512 + pl.x, 768 + pl.y);
      ctx.rotate(pl.rotation);
      ctx.scale(pl.scale, pl.scale);
      ctx.drawImage(c, -512, -768);
      return registered.toDataURL('image/png');
    }
    const c = canvasFor(),
      cc = c.getContext('2d');
    cc.fillStyle = 'black';
    cc.fillRect(0, 0, 1024, 1536);
    cc.fillStyle = 'white';
    cc.beginPath();
    for (const [i, p] of [
      [selection.x, selection.y],
      [selection.x + selection.w, selection.y],
      [selection.x + selection.w, selection.y + selection.h],
      [selection.x, selection.y + selection.h],
    ].entries()) {
      const point = { x: p[0], y: p[1] };
      const q = cardSpace ? point : localPoint(point, active());
      i ? cc.lineTo(q.x, q.y) : cc.moveTo(q.x, q.y);
    }
    cc.closePath();
    cc.fill();
    return c.toDataURL('image/png');
  }
  async function setSelectionImage(src, points = null) {
    const im = await imageFrom(src),
      c = canvasFor(),
      cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(im, 0, 0);
    selectionMask = cc.getImageData(0, 0, 1024, 1536);
    selectionLayer = active().id;
    const b = layerBox(active());
    if (points)
      selection = selectionBounds(
        points.map((p) => worldPoint(p[0], p[1], active())),
      );
    else {
      let x0 = 1024,
        y0 = 1536,
        x1 = 0,
        y1 = 0;
      for (let y = 0; y < 1536; y++)
        for (let x = 0; x < 1024; x++)
          if (selectionMask.data[(y * 1024 + x) * 4] > 10) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      selection =
        x1 >= x0 && y1 >= y0
          ? selectionBounds(
              [
                [x0, y0],
                [x1 + 1, y0],
                [x1 + 1, y1 + 1],
                [x0, y1 + 1],
              ].map((p) => worldPoint(p[0], p[1], active())),
            )
          : null;
    }
    syncProperties();
    draw();
  }
  async function closeLasso() {
    if (lassoPoints.length < 3 || busy) return;
    const layer = active(),
      points = lassoPoints
        .map((p) => localPoint(p, layer))
        .map((p) => [p.x, p.y]);
    const magnetic = tool === 'magnetic';
    await processTask(
      magnetic ? '磁性套索边缘吸附' : '建立套索选区',
      'selection',
      {
        image: pngFromImage(registeredImage(layer, images.get(layer.id))),
        points,
        magnetic,
        width: Number($('lasso-width').value),
        feather: Number($('selection-feather').value),
      },
      async (result) => {
        await setSelectionImage(result.image, result.points);
        lassoPoints = [];
      },
    );
  }
  $('close-lasso').onclick = closeLasso;
  $('select-alpha').onclick = async () => {
    const layer = active(),
      im = images.get(layer.id);
    if (!im) return;
    const c = canvasFor(),
      cc = c.getContext('2d', { willReadFrequently: true });
    cc.drawImage(registeredImage(layer, im), 0, 0, 1024, 1536);
    const p = cc.getImageData(0, 0, 1024, 1536);
    for (let i = 0; i < p.data.length; i += 4) {
      p.data[i] = p.data[i + 1] = p.data[i + 2] = p.data[i + 3];
      p.data[i + 3] = 255;
    }
    cc.putImageData(p, 0, 0);
    await setSelectionImage(c.toDataURL('image/png'));
    lassoPoints = [];
    say('已根据透明通道选择实际轮廓；可继续提取 Mask');
  };
  async function applySelectionToMask() {
    if (!doc || loading || busy || gesture || freeTransform || applying) return;
    try {
      const id = $('selection-target').value;
      const subject = id === 'subject';
      if (
        (subject ? !images.has(active().id) : active().kind !== 'foreground') ||
        active().locked
      )
        throw Error(
          subject ? '请选择未锁定的图片层' : '选择未锁定的连续人物层',
        );
      if (
        !['mask-weight-value', 'mask-gradient-start'].every(
          (id) => $<HTMLInputElement>(id).validity.valid,
        )
      )
        throw Error('灰度权重需要0–255');
      const args: {
        image: string;
        selection: string;
        mode: string;
        gradient: string;
        value: number;
        startValue: number;
        start?: number[];
        end?: number[];
        coverage?: string;
        guard?: string;
      } = {
        image:
          doc.masks[id] ||
          (subject ? blankMaskCanvas().toDataURL('image/png') : ''),
        selection: await localSelection(subject),
        mode: $('selection-mode').value,
        gradient: $<HTMLSelectElement>('selection-gradient').value,
        value: Number($<HTMLInputElement>('mask-weight-value').value) / 255,
        startValue:
          Number($<HTMLInputElement>('mask-gradient-start').value) / 255,
      };
      if (args.gradient === 'line' && subject)
        throw Error('主体标注请选择画布方向或均匀权重');
      if (args.gradient === 'line') {
        const a = active().motionAnchor;
        if (!a) throw Error('先在画布设置固定点与自由端');
        args.start = a.root;
        args.end = a.tip;
      }
      if (id !== 'coverage' && !subject) args.coverage = doc.masks.coverage;
      if (id === 'motion' && $('rigid-protection').checked)
        args.guard = doc.masks.rigid;
      await processTask(
        '选区提取 ' + maskNames[id] + ' Mask',
        'mask_combine',
        args,
        async (result) => {
          doc.masks[id] = result.image;
          await registerMask(id, result.image);
          if (id === 'coverage') await updateCoverage();
          target = id;
          showMask = true;
        },
      );
    } catch (e) {
      say(e.message);
    }
  }
  $('apply-selection').onclick = () => applySelectionToMask();
  $('selection-target').onchange = () => syncProperties();
  $('extract-selection').onclick = async () => {
    try {
      const source = { ...active() },
        mask = await localSelection();
      await processTask(
        '选区复制为独立图像',
        'alpha',
        {
          image: pngFromImage(registeredImage(source, images.get(source.id))),
          mask,
        },
        async (result) => {
          const layer = {
            ...source,
            id: 'region-' + Date.now(),
            name: source.name + ' / 选区',
            kind: 'image',
            src: result.image,
            master: undefined,
            sourceWindow: undefined,
          };
          doc.layers.unshift(layer);
          images.set(layer.id, await imageFrom(result.image));
          window.cardPreview.addImage(layer, images.get(layer.id));
          selected = [layer.id];
          target = 'image';
          selection = null;
          selectionMask = null;
        },
      );
    } catch (e) {
      say(e.message);
    }
  };
  for (const [id, field, scale, min, max] of [
    ['layer-x', 'x', 1, -4096, 4096],
    ['layer-y', 'y', 1, -4096, 4096],
    ['layer-scale', 'scale', 0.01, 0.01, 10],
    ['layer-opacity', 'opacity', 0.01, 0, 1],
  ] as const) {
    const apply = (e) => {
      if (active().locked || $(id).value === '') return;
      const value = Number($(id).value) * scale;
      if (
        !Number.isFinite(value) ||
        (e.type === 'input' && (value < min || value > max))
      )
        return;
      if (active()[field] === value) return;
      mutate('修改图层属性', () => {
        const v = Math.max(min, Math.min(max, value));
        if (
          field === 'scale' &&
          (active().kind === 'text' || active().role === 'wordmark')
        )
          scaleLayer(active(), v);
        else active()[field] = v;
      });
    };
    $(id).onchange = apply;
    $(id).oninput = apply;
  }
  $('title-text').oninput = () => {
    const l = active(),
      text = $('title-text').value;
    if (
      l.kind !== 'text' ||
      l.locked ||
      importedCardTitle.resolve(l, doc.locale).text === text
    )
      return;
    if (importedCardStats.isStat(l)) {
      try {
        importedCardStats.value(l.role, text);
      } catch (e) {
        say(e.message);
        return;
      }
    }
    mutate('编辑文字', () => {
      if (l.titleArt)
        importedCardTitle.upsert(l, {
          locale: doc.locale,
          text,
          src: undefined,
        });
      else l.text = text;
    });
  };
  $('title-text').onchange = $('title-text').oninput;
  $('layer-name').onchange = () =>
    mutate('重命名图层', () => (active().name = $('layer-name').value));
  for (const [id, key] of [
    ['text-font', 'fontFamily'],
    ['text-size', 'fontSize'],
    ['text-weight', 'fontWeight'],
    ['text-color', 'color'],
    ['text-stroke', 'stroke'],
    ['text-stroke-width', 'strokeWidth'],
    ['text-align', 'align'],
    ['text-italic', 'italic'],
  ] as const)
    $(id).onchange = (e) => {
      if (active().kind !== 'text' || active().locked) return;
      let value: string | number | boolean =
        id === 'text-italic' ? $(id).checked : $(id).value;
      if (['text-size', 'text-stroke-width'].includes(id)) {
        if (value === '') return;
        const number = Number(value),
          min = id === 'text-size' ? 12 : 0,
          max = id === 'text-size' ? 300 : 24;
        if (
          !Number.isFinite(number) ||
          (e.type === 'input' && (number < min || number > max))
        )
          return;
        value = Math.max(min, Math.min(max, number));
      }
      if (textStyle(active())[key] === value) return;
      mutate('调整文字 ' + key, () => {
        const l = active();
        if (l.titleArt)
          importedCardTitle.upsert(l, {
            locale: doc.locale,
            text: importedCardTitle.resolve(l, doc.locale).text,
            style: { ...textStyle(l), [key]: value },
            src: undefined,
          });
        else l.textStyle = { ...textStyle(l), [key]: value };
      });
    };
  for (const id of [
    'text-size',
    'text-stroke-width',
    'text-color',
    'text-stroke',
  ] as const)
    $(id).oninput = $(id).onchange;
  $('rasterize-text').onclick = async () => {
    const source = active();
    if (source.kind !== 'text' || source.locked) return;
    const c = textRaster(source),
      src = c.toDataURL('image/png'),
      im = await imageFrom(src);
    if (source.titleArt) {
      const value = importedCardTitle.resolve(source, doc.locale);
      mutate('当前语言字标转图片', () => {
        importedCardTitle.upsert(source, {
          locale: doc.locale,
          text: value.text,
          src,
        });
        titleImages.set(src, im);
      });
      say('当前语言已使用图片字标，其他语言与共用扫光保留');
      return;
    }
    mutate('文字转图片，保留可编辑源', () => {
      const layer = {
        ...source,
        id: 'wordmark-' + Date.now(),
        kind: 'image',
        role: 'wordmark',
        titleArt: undefined,
        name: source.name + ' / 图片字标',
        src,
        sourceTextId: source.id,
      };
      source.visible = false;
      doc.layers.unshift(layer);
      images.set(layer.id, im);
      window.cardPreview.addImage(layer, im);
      selected = [layer.id];
      target = 'image';
    });
  };
  $('add-text-layer').onclick = () => {
    mutate('新增可编辑文字', () => {
      const layer = {
        id: 'text-' + Date.now(),
        kind: 'text',
        name: '附加文字',
        text: '新文字',
        textStyle: { ...textStyle({}), fontSize: 48 },
        x: 0,
        y: -140,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
      };
      doc.layers.unshift(layer);
      selected = [layer.id];
      target = 'image';
    });
    setTool('text');
  };
  async function importFont(value) {
    space = false;
    const layer = active(),
      atRevision = revision;
    if (layer.kind !== 'text' || layer.locked) return;
    const font = {
      name: value.name,
      family: 'AtelierFont-' + Date.now(),
      src: value.src,
    };
    await registerFont(font);
    if (atRevision !== revision || active().id !== layer.id) {
      say('编辑目标已改变，请重新导入字体');
      return;
    }
    mutate('导入工程字体', () => {
      doc.fonts = [...(doc.fonts || []), font];
      if (layer.titleArt)
        importedCardTitle.upsert(layer, {
          locale: doc.locale,
          text: importedCardTitle.resolve(layer, doc.locale).text,
          style: { ...textStyle(layer), fontFamily: font.family },
          src: undefined,
        });
      else layer.textStyle = { ...textStyle(layer), fontFamily: font.family };
      syncFonts();
    });
    setTool('text');
    say('字体已嵌入工程，2D 与 3D 使用同一字标栅格');
  }
  $('import-font').onclick = async () => {
    pickingFile = true;
    if (desktop) {
      try {
        const value = await bridge.invoke('import-font');
        pickingFile = false;
        space = false;
        if (value.src) await importFont(value);
      } catch (e) {
        pickingFile = false;
        say(e.message);
      }
    } else $('font-file').click();
  };
  $('font-file').onchange = async () => {
    pickingFile = false;
    space = false;
    try {
      const file = $('font-file').files[0];
      if (!file) return;
      if (file.size > 12 * 1024 * 1024) throw Error('字体超过 12 MB');
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['ttf', 'otf', 'woff2'].includes(ext))
        throw Error('仅支持 TTF / OTF / WOFF2');
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(
            'data:font/' +
              ext +
              ';base64,' +
              String(reader.result).split(',')[1],
          );
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await importFont({ name: file.name, src });
    } catch (e) {
      say('字体导入失败：' + e.message);
    } finally {
      $('font-file').value = String('');
    }
  };
  for (const [id, delta] of [
    ['layer-up', -1],
    ['layer-down', 1],
  ] as const)
    $(id).onclick = () => {
      const index = doc.layers.indexOf(active()),
        next = index + delta;
      if (next < 0 || next >= doc.layers.length) return;
      changeLayerTree('调整图层顺序', (d) =>
        folders.reorder(d, active().id, next),
      );
    };
  function clearLayerReferences(ids: Set<string>, retainedId?: string) {
    for (const action of doc.actions || []) {
      for (const frame of action.drawOrder || [])
        frame.layers = frame.layers.filter((id) => !ids.has(id));
      for (const id of ids) {
        if (action.layerTracks) delete action.layerTracks[id];
        if (action.deformTracks) delete action.deformTracks[id];
      }
      if (action.particleEvents)
        action.particleEvents = action.particleEvents.filter(
          (event) => !ids.has(event.particles.emitter?.layerId),
        );
    }
    if (doc.characterRig) {
      doc.characterRig.bindings = doc.characterRig.bindings.filter(
        (binding) => !ids.has(binding.layerId),
      );
      if (doc.characterRig.meshes)
        doc.characterRig.meshes = doc.characterRig.meshes.filter(
          (mesh) => !ids.has(mesh.layerId),
        );
    }
    if (doc.emissionRegions)
      doc.emissionRegions = doc.emissionRegions.filter(
        (region) => !ids.has(region.layerId),
      );
    if (ids.has(doc.shader.fragmentTarget) && doc.shader.fragmentTarget !== retainedId)
      doc.shader.fragmentTarget = 'all';
    const wordmark = doc.characterEffects?.wordmark;
    if (wordmark) {
      if (ids.has(wordmark.layerId)) delete wordmark.layerId;
      if (ids.has(wordmark.occluderId)) delete wordmark.occluderId;
    }
  }
  $('delete-layer').onclick = () => {
    const layer = active();
    if (
      layer.locked ||
      ['foreground', 'background', 'frame'].includes(layer.kind)
    )
      return;
    mutate('删除图层（可撤销）', () => {
      doc.layers = doc.layers.filter((l) => l.id !== layer.id);
      clearLayerReferences(new Set([layer.id]));
      selected = [doc.layers[0].id];
      target = 'image';
    });
  };
  for (const [id, field] of [
    ['depth', 'depth'],
    ['parallax', 'background'],
  ] as const)
    $(id).onchange = () =>
      mutate(
        '调整效果参数',
        () => (doc.effects[field] = Number($(id).value) / 100),
      );
  for (const [id, field] of [
    ['cape-motion', 'cape'],
    ['weapon-flow', 'flow'],
  ] as const)
    $(id).onchange = () =>
      mutate('切换动态效果', () => (doc.effects[field] = $(id).checked));
  document
    .querySelectorAll<HTMLElement>('[data-pose]')
    .forEach(
      (b) => (b.onclick = () => setPreviewPose(Number(b.dataset.pose), 0)),
    );
  for (const id of ['preview-yaw', 'preview-pitch'] as const)
    $(id).oninput = () => {
      const yaw = Number($('preview-yaw').value),
        pitch = Number($('preview-pitch').value);
      if (
        $('preview-yaw').value !== '' &&
        $('preview-pitch').value !== '' &&
        Number.isFinite(yaw) &&
        Number.isFinite(pitch) &&
        yaw >= -360 &&
        yaw <= 360 &&
        pitch >= -35 &&
        pitch <= 35
      )
        setPreviewPose(yaw, pitch);
    };
  document.querySelectorAll<HTMLElement>('[data-nudge]').forEach(
    (b) =>
      (b.onclick = () => {
        try {
          const step = Number($('nudge-step').value);
          if (!Number.isFinite(step) || step < 1 || step > 500)
            throw Error('移动步长为 1–500 px');
          const direction = b.dataset.nudge;
          applyEditorCommands(
            [
              {
                op: 'move',
                layerId: active().id,
                dx:
                  direction === 'left'
                    ? -step
                    : direction === 'right'
                      ? step
                      : 0,
                dy:
                  direction === 'up' ? -step : direction === 'down' ? step : 0,
              },
            ],
            null,
            '移动图层 / ' + direction,
          );
        } catch (e) {
          say(e.message);
        }
      }),
  );
  $('toggle-play').onclick = () => {
    if (window.atelierAnimation?.context().action) {
      window.atelierAnimation.play();
      return;
    }
    doc.effects.paused = window.cardPreview.setPaused(
      !(window.cardPreview.getView()?.paused ?? doc.effects.paused),
    );
    syncPreview();
    $('time-value').textContent = doc.effects.paused ? '暂停' : '实时';
  };
  function seekPreviewEffects(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30) return;
    if (window.atelierAnimation?.context().action) {
      window.atelierAnimation.seek(seconds);
      return;
    }
    doc.effects.paused = true;
    window.cardPreview.setPaused(true);
    syncPreview();
    window.cardPreview.setTime(seconds);
    $('effect-time').value = String(seconds);
    $('effect-seconds').value = String(seconds.toFixed(2));
    $('time-value').textContent = seconds.toFixed(2) + 's';
    $('toggle-play').textContent = '播放';
  }
  $('effect-time').oninput = () =>
    seekPreviewEffects(Number($('effect-time').value));
  $('effect-seconds').oninput = $('effect-seconds').onchange = () => {
    if ($('effect-seconds').value !== '')
      seekPreviewEffects(Number($('effect-seconds').value));
  };
  $('wire-view').onclick = () => {
    wire = !wire;
    window.cardPreview.showWire(wire);
    $('wire-view').classList.toggle('active', wire);
  };
  $('mask-display').onclick = () => {
    if (active().kind !== 'foreground') return;
    showMask = !showMask;
    if (target === 'image') target = 'motion';
    syncProperties();
    renderLayers();
    draw();
  };
  $('paint-color').onclick = () => {
    white = !white;
    brushValue = white ? 255 : 0;
    $('paint-color').firstChild.textContent = white ? '◻' : '◼';
    syncProperties();
    say(white ? '白色增加当前权重' : '黑色减弱当前权重');
  };
  $('fit-view').onclick = fit;
  $('actual-view').onclick = () => {
    view.zoom = 1;
    draw();
  };
  $('duplicate-layer').onclick = () => {
    const layer = active();
    if (!['image', 'background'].includes(layer.kind)) {
      say('连续人物与实体框保持单一表面；可复制背景或导入图像');
      return;
    }
    mutate('复制图层', () => {
      const copy = {
        ...layer,
        id: 'layer-' + Date.now(),
        name: layer.name + ' 副本',
        previewReference: false,
        kind: 'image',
        x: layer.x + 15,
        y: layer.y + 15,
      };
      doc.layers.splice(1, 0, copy);
      images.set(copy.id, images.get(layer.id));
      window.cardPreview.addImage(copy, images.get(layer.id));
      selected = [copy.id];
    });
  };
  async function importImage(value) {
    space = false;
    const im = await imageFrom(value.src);
    if (
      im.naturalWidth > 8192 ||
      im.naturalHeight > 8192 ||
      im.naturalWidth * im.naturalHeight > 16_777_216
    )
      throw Error('图像超过 16 MP 编辑预算');
    // First version registers imports to the card canvas; preserve their original
    // aspect by letterboxing before native resampling.
    const role = importRole,
      replacing = active();
    if (role === 'replace' && (replacing.kind !== 'image' || replacing.locked))
      throw Error('请选择未锁定的叠加图像图层');
    const previousCharacter = role === 'foreground' && doc.characterEffects
      ? doc.layers.find((layer) => layer.kind === 'foreground')
      : undefined;
    const oldParts = previousCharacter
      ? doc.layers.filter((layer) => layer.splitSourceId === previousCharacter.id)
      : [];
    if (previousCharacter?.locked || oldParts.some((layer) => layer.locked))
      throw Error('请先解锁原人物及其拆层，再替换人物');
    const c = canvasFor();
    const cc = c.getContext('2d');
    const scale =
      role === 'background' || role === 'back'
        ? Math.max(c.width / im.naturalWidth, c.height / im.naturalHeight)
        : Math.min(c.width / im.naturalWidth, c.height / im.naturalHeight);
    cc.drawImage(
      im,
      (c.width - im.naturalWidth * scale) / 2,
      (c.height - im.naturalHeight * scale) / 2,
      im.naturalWidth * scale,
      im.naturalHeight * scale,
    );
    await processTask(
      '导入 ' +
        {
          foreground: '连续人物层',
          background: '背景',
          back: '卡背',
          wordmark: '图片字标',
          image: '叠加图层',
          replace: '替换素材',
        }[role],
      'resize',
      { image: c.toDataURL('image/png'), width: 1024, height: 1536 },
      async (result) => {
        const normalized = await imageFrom(result.image);
        if (role === 'replace') {
          replacing.src = result.image;
          delete replacing.sourceWindow;
          images.set(replacing.id, normalized);
          syncTextures();
          target = 'image';
          return;
        }
        if (role === 'back') {
          delete doc.backScene;
          doc.back = result.image;
          window.cardPreview.setTexture('art_back', normalized);
          images.set('space-back', normalized);
          return;
        }
        if (role === 'foreground' || role === 'background') {
          let layer = doc.layers.find((l) => l.kind === role);
          if (!layer) {
            layer = {
              id: role,
              name: value.name,
              kind: role,
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              visible: true,
              locked: false,
            };
            doc.layers.push(layer);
          }
          Object.assign(layer, {
            src: result.image,
            name: value.name,
            visible: true,
            x: 0,
            y: 0,
            scale: 1,
            sourceWindow: undefined,
          });
          images.set(layer.id, normalized);
          if (role === 'foreground') {
            if (previousCharacter) {
              const removed = new Set<string>(oldParts.map((part) => part.id));
              doc.layers = doc.layers.filter((part) => !removed.has(part.id));
              clearLayerReferences(new Set([layer.id, ...removed]), layer.id);
              for (const id of removed) images.delete(id);
              delete layer.underpaint;
              delete layer.ownershipMask;
              delete layer.ownershipEncoding;
              delete layer.motionAnchor;
              delete layer.anatomy;
              delete layer.pivot;
              delete layer.rotation;
              delete layer.splitEdgeOriginal;
            }
            layer.master = result.image;
            doc.previewMode = 'authored';
            doc.foregroundMesh ||= await bridge.invoke('process', {
              op: 'mesh',
              args: { bounds: [0, 0, 1, 1], subdivisions: 40 },
            });
            window.cardPreview.setDocument(doc);
            const pixels = cc.getImageData(0, 0, 1024, 1536);
            for (const id of requiredMaskIds) {
              const mc = canvasFor(),
                mctx = mc.getContext('2d'),
                p = mctx.createImageData(1024, 1536);
              for (let i = 0; i < p.data.length; i += 4) {
                p.data[i] =
                  p.data[i + 1] =
                  p.data[i + 2] =
                    id === 'coverage' ? pixels.data[i + 3] :
                    id === 'inset' && doc.characterEffects ? 255 : 0;
                p.data[i + 3] = 255;
              }
              mctx.putImageData(p, 0, 0);
              doc.masks[id] = mc.toDataURL('image/png');
              await registerMask(id, doc.masks[id]);
            }
            selection = null;
            selectionMask = null;
            selectionLayer = null;
            lassoPoints = [];
          }
          selected = [layer.id];
          syncTextures();
        } else {
          const layer: CardLayer = {
            id: 'image-' + Date.now(),
            name: value.name,
            kind: 'image',
            role,
            src: result.image,
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            visible: true,
            locked: false,
          };
          doc.layers.unshift(layer);
          images.set(layer.id, normalized);
          window.cardPreview.addImage(layer, normalized);
          selected = [layer.id];
          if (role === 'wordmark') {
            const title = doc.layers.find((l) => l.id === 'title');
            if (title) title.visible = false;
          }
        }
        target = 'image';
        showMask = false;
      },
    );
  }
  $('import-file').onchange = async () => {
    pickingFile = false;
    space = false;
    try {
      const file = $('import-file').files[0];
      if (!file) return;
      if (file.size > 24 * 1024 * 1024) throw Error('图像超过 24 MB');
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await importImage({ name: file.name, src });
    } catch (e) {
      say(e.message);
    } finally {
      $('import-file').value = String('');
    }
  };
  function editorClosed() {
    return (
      document.body.dataset.appMode !== 'editor' ||
      !!window.atelierWorkshopTabs?.closed()
    );
  }
  async function command(cmd, exportReady = false) {
    try {
      if (cmd === 'shortcuts') {
        $('shortcuts-dialog').showModal();
        return;
      }
      if (document.body.dataset.appMode === 'loading') return;
      if (
        ['home', 'new', 'open'].includes(cmd) &&
        (busy || applying || gesture || freeTransform)
      ) {
        say('请先结束当前处理、笔划或变换');
        return;
      }
      if (cmd === 'home') return window.atelierHome.show();
      if (cmd === 'new' && document.body.dataset.appMode === 'home') {
        newFromHome = true;
        $('new-name').value = String('未命名卡片');
        $('new-dialog').showModal();
        $('new-name').select();
        return;
      }
      if (cmd === 'open') return window.atelierHome.openFile();
      if (!doc || loading || applying) return;
      if (
        editorClosed() &&
        !['new', 'open', 'save', 'save-as', 'export'].includes(cmd)
      ) {
        say('请先从工坊打开一张卡片');
        return;
      }
      if (
        ['save', 'save-as', 'export', 'open', 'new'].includes(cmd) &&
        (gesture || freeTransform)
      ) {
        say('请先结束当前笔划或变换');
        return;
      }
      if ((cmd === 'undo' || cmd === 'redo') && (gesture || freeTransform)) {
        say('请先结束当前笔划或变换');
        return;
      }
      if (cmd === 'undo' || cmd === 'redo') {
        if (busy) await $('cancel-task').onclick(new PointerEvent('click'));
        const from = cmd === 'undo' ? undo : redo,
          to = cmd === 'undo' ? redo : undo;
        if (!from.length) {
          say('没有可' + (cmd === 'undo' ? '撤销' : '重做') + '的操作');
          return;
        }
        return await restore(from.pop(), to);
      }
      if (cmd === 'select-all' || cmd === 'deselect')
        return await changeSelection(cmd === 'select-all');
      if (
        [
          'transform',
          'duplicate',
          'delete-layer',
          'group-layers',
          'ungroup-layers',
        ].includes(cmd) &&
        (busy || gesture || freeTransform)
      ) {
        say('请先结束当前处理或变换');
        return;
      }
      if (cmd === 'group-layers') return $('group-layers').click();
      if (cmd === 'ungroup-layers') return $('ungroup-layers').click();
      if (cmd === 'transform') return transformStart();
      if (cmd === 'duplicate')
        return selection &&
          selectionLayer === active().id &&
          images.has(active().id)
          ? await $('extract-selection').onclick(new PointerEvent('click'))
          : $('duplicate-layer').click();
      if (cmd === 'delete-layer') return $('delete-layer').click();
      if (cmd === 'zoom-in' || cmd === 'zoom-out') {
        view.zoom = Math.max(
          0.05,
          Math.min(3, view.zoom * (cmd === 'zoom-in' ? 1.25 : 0.8)),
        );
        draw();
        return;
      }
      if (cmd === 'invert-selection')
        return await window.cardEditorHost.refine('invert', 0);
      if (cmd === 'fit') return fit();
      if (cmd === 'actual') {
        view.zoom = 1;
        draw();
        return;
      }
      if (cmd === 'new') {
        newFromHome = false;
        if (!workshop && revision !== savedRevision) {
          say('请先保存当前工程，再新建空白卡片');
          return;
        }
        $('new-dialog').showModal();
        return;
      }
      if (cmd === 'save' || cmd === 'save-as') {
        const savedVersion = revision;
        const result = workshop
          ? await bridge.invoke('save-workshop', {
              workshop: await W.encode(W.commit(workshop, snapshot())),
              saveAs: cmd === 'save-as',
            })
          : await bridge.invoke('save', {
              document: snapshot(),
              saveAs: cmd === 'save-as',
            });
        if (!result.canceled) {
          savedRevision = savedVersion;
          notifyDirty();
          say('工程已保存：' + result.file);
        }
        return;
      }
      if (cmd === 'export' && !exportReady && window.atelierExportPanel)
        return window.atelierExportPanel.open(() => command('export', true));
      if (cmd === 'export' && workshop) {
        const captured = W.commit(workshop, snapshot());
        if (doc.exportSettings)
          for (const c of captured.cards)
            c.document.exportSettings = {
              ...structuredClone(doc.exportSettings),
              layers:
                c.id === captured.activeCardId
                  ? { ...doc.exportSettings.layers }
                  : { ...(c.document.exportSettings?.layers || {}) },
            };
        applying = true;
        syncProperties();
        try {
          const stageToken = crypto.randomUUID();
          for (const c of captured.cards) {
            say('导出卡片 ' + c.name + '…');
            const output = await renderCardOutput(W.resolve(captured, c.id));
            say('暂存导出图像：' + c.name);
            await bridge.invoke('export-preview-stage', {
              token: stageToken,
              cardId: c.id,
              output,
            });
          }
          say('打包共享素材与 Godot SDK…');
          const result = await bridge.invoke('export-workshop', {
            workshop: await W.encode(captured),
            stageToken,
          });
          if (!result.canceled)
            say(
              '工坊已导出：' +
                result.directory +
                ' · ' +
                result.cards +
                ' 张卡片 / ' +
                result.sharedFiles +
                ' 个去重文件',
            );
        } finally {
          applying = false;
          syncProperties();
        }
        return;
      }
      if (cmd === 'export') {
        const layerRasters: Record<string, string> = {};
        for (const layer of doc.layers.filter((l) =>
          ['text', 'frame'].includes(l.kind),
        )) {
          const c = layer.kind === 'text' ? textRaster(layer) : canvasFor();
          if (layer.kind === 'frame')
            drawLayer(c.getContext('2d'), {
              ...layer,
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              visible: true,
            });
          layerRasters[layer.id] = c.toDataURL('image/png');
        }
        const result = await bridge.invoke('export', {
          document: snapshot(),
          front: compose(),
          layerRasters,
          titleRasters: await titleOutputs(doc),
          framePreview: framePreview(doc),
        });
        if (!result.canceled) say('素材与 Mask 已导出：' + result.directory);
        return;
      }
      if (cmd === 'import') {
        $('import-dialog').showModal();
      }
    } catch (e) {
      say(e.message);
    }
  }
  async function dispatchCommand(cmd) {
    if (
      ['undo', 'redo', 'select-all'].includes(cmd) &&
      window.atelierShaderEditors?.textCommand(cmd)
    )
      return;
    if (
      ['undo', 'redo', 'select-all'].includes(cmd) &&
      importedCardShortcuts.editable(document.activeElement)
    ) {
      if (desktop) return bridge.invoke('edit-text', { command: cmd });
      document.execCommand(cmd === 'select-all' ? 'selectAll' : cmd);
      return;
    }
    if (document.querySelector('dialog[open]:not(#ai-dialog)')) return;
    return command(cmd);
  }
  document
    .querySelectorAll<HTMLElement>('[data-command]')
    .forEach((b) => (b.onclick = () => dispatchCommand(b.dataset.command)));
  bridge.onCommand?.((cmd) =>
    dispatchCommand(cmd).catch((e) => say(e.message)),
  );
  $('shortcuts-close').onclick = () => $('shortcuts-dialog').close();
  const shortcutMac = /Mac|iPhone|iPad/.test(navigator.platform);
  for (const [name, mac, other] of importedCardShortcuts.help) {
    const tr = document.createElement('tr');
    for (const value of [name, shortcutMac ? mac : other] as const) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    $('shortcuts-list').append(tr);
  }
  $('new-cancel').onclick = () => $('new-dialog').close();
  const createBlankDocument = (name: string) =>
    blankDocument(name, {
      language: i18n.language(document.documentElement.lang),
      mesh: () =>
        bridge.invoke('process', {
          op: 'mesh',
          args: { bounds: [0, 0, 1, 1], subdivisions: 40 },
        }),
      textStyle: () => textStyle({}),
    });
  $('new-confirm').onclick = async () => {
    const name = $('new-name').value;
    $('new-dialog').close();
    await window.atelierHome.run(name.trim() || '未命名卡片', async () => {
      window.atelierHome.progress('创建空白画布与独立 Mask…', 16);
      await window.atelierHome.paint();
      const document = await createBlankDocument(name);
      if (workshop && !newFromHome)
        await workshopOperation('add', { document });
      else await openHomeResult(await bridge.invoke('home-new', { document }));
      say(
        workshop
          ? '空白卡片已加入工坊；可应用共享资源'
          : '空白工程已创建；导入背景、人物、卡背或 PNG 字标',
      );
    }, !!name.trim());
  };
  $('sample-project').onclick = async () => {
    if (revision !== savedRevision) {
      say('请保存当前工程后再载入样卡');
      return;
    }
    await window.atelierHome.run('示例卡片', async () => {
      template ||= (await bridge.invoke('template')).template;
      return openHomeResult(
        await bridge.invoke('home-new', {
          document: structuredClone(template),
        }),
      );
    }, false);
  };
  $('import-cancel').onclick = () => $('import-dialog').close();
  $('import-confirm').onclick = async () => {
    importRole = $('import-role').value;
    $('import-dialog').close();
    pickingFile = true;
    if (desktop) {
      try {
        const value = await bridge.invoke('import');
        pickingFile = false;
        space = false;
        if (value.src) await importImage(value);
      } catch (e) {
        pickingFile = false;
        say(e.message);
      }
    } else $('import-file').click();
  };
  for (const id of ['font-file', 'import-file'] as const)
    $(id).addEventListener('cancel', () => {
      pickingFile = false;
      space = false;
    });
  let transformBefore = null;
  $('transform-controls').onchange = draw;
  $('image-title-edit').onclick = () => {
    document.body.classList.remove('dock-collapsed', 'panels-hidden');
    window.atelierWorkspace.panel('appearance');
    window.atelierWorkspace.syncLayout();
  };
  function transformStart() {
    if (active().locked || target !== 'image') {
      say('请选择未锁定的图像或字标图层');
      return;
    }
    setTool('move');
    transformBefore = snapshot();
    freeTransform = true;
    $('transform-hint').hidden = false;
    draw();
  }
  async function transformEnd(commit) {
    if (!freeTransform) return;
    freeTransform = false;
    $('transform-hint').hidden = true;
    gesture = null;
    if (commit) push(transformBefore, '自由变换');
    else {
      doc = transformBefore;
      syncPreview();
      syncProperties();
      draw();
    }
    transformBefore = null;
  }
  document.addEventListener('keydown', (e) => {
    if (
      e.defaultPrevented ||
      e.isComposing ||
      (e.target instanceof Element &&
        e.target.closest('#ai-dialog') &&
        !importedCardShortcuts.editable(e.target))
    )
      return;
    if (e.key === 'Escape' && gesture?.kind === 'character') {
      e.preventDefault();
      endGesture(true).catch((error) => say(error.message));
      return;
    }
    // A focused slider owns navigation keys; they must not nudge a card layer.
    if (
      e.target instanceof Element &&
      e.target.matches('input[type="range"]') &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        ' ',
      ].includes(e.key)
    )
      return;
    const editing = importedCardShortcuts.editable(e.target),
      shortcut = importedCardShortcuts.resolve(e, { editing });
    if (shortcut) {
      if (shortcut.startsWith('text-')) {
        // Ctrl/Cmd Y is not a native redo binding on every platform.
        if (shortcut === 'text-redo' && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          if (desktop)
            bridge
              .invoke('edit-text', { command: 'redo' })
              .catch((error) => say(error.message));
          else document.execCommand('redo');
        }
        return;
      }
      if (
        shortcut === 'delete-layer' &&
        lassoPoints.length &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        lassoPoints.pop();
        draw();
        syncProperties();
        return;
      }
      e.preventDefault();
      if (pickingFile || document.querySelector('dialog[open]:not(#ai-dialog)'))
        return;
      if (!e.repeat || ['zoom-in', 'zoom-out'].includes(shortcut))
        command(shortcut);
      return;
    }
    if (
      pickingFile ||
      editing ||
      document.querySelector('dialog[open]:not(#ai-dialog)') ||
      !doc ||
      loading ||
      applying ||
      editorClosed()
    )
      return;
    const key = e.key.toLowerCase();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (key === ' ') {
      space = true;
      e.preventDefault();
    }
    if (freeTransform) {
      if (key === 'enter') transformEnd(true);
      if (key === 'escape') transformEnd(false);
      return;
    }
    if (key === 'escape') {
      $('clear-selection').click();
      return;
    }
    if (lassoPoints.length) {
      if (key === 'enter') {
        e.preventDefault();
        closeLasso();
        return;
      }
      if (key === 'backspace') {
        e.preventDefault();
        lassoPoints.pop();
        draw();
        syncProperties();
        return;
      }
    }
    if (
      {
        v: 'move',
        m: 'select',
        l: e.shiftKey ? 'magnetic' : 'lasso',
        b: 'brush',
        t: 'text',
        h: 'hand',
        z: 'zoom',
        w: 'wand',
        s: 'smart',
      }[key]
    )
      setTool(
        {
          v: 'move',
          m: 'select',
          l: e.shiftKey ? 'magnetic' : 'lasso',
          b: 'brush',
          t: 'text',
          h: 'hand',
          z: 'zoom',
          w: 'wand',
          s: 'smart',
        }[key],
      );
    if (key === 'x') $('paint-color').click();
    if (key === '[' || key === ']')
      $('brush-size').value = String(
        Math.max(
          1,
          Math.min(300, Number($('brush-size').value) + (key === ']' ? 5 : -5)),
        ),
      );
    if (
      key.startsWith('arrow') &&
      target === 'image' &&
      !doc.layers.some(
        (l) => selected.includes(l.id) && (l.locked || l.kind === 'frame'),
      )
    ) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      mutate('微调图层位置', () => {
        for (const layer of doc.layers.filter(
          (l) => selected.includes(l.id) && !l.locked,
        )) {
          layer.x +=
            key === 'arrowright' ? step : key === 'arrowleft' ? -step : 0;
          layer.y += key === 'arrowdown' ? step : key === 'arrowup' ? -step : 0;
        }
      });
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') space = false;
  });
  window.addEventListener('blur', () => {
    space = false;
    if (gesture) endGesture(true).catch((e) => say(e.message));
  });
  window.addEventListener('focus', () => {
    space = false;
  });
  new ResizeObserver(() => {
    if (doc) draw();
  }).observe(canvas);
  document
    .querySelectorAll<HTMLElement>('[data-tool]')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  function editorView() {
    return {
      mode: document.querySelector<HTMLElement>('.view-stage').dataset.view,
      canvas: { ...view },
      pose: window.cardPreview.getView(),
      selected: [...selected],
      target,
      showMask,
      paused: doc.effects.paused,
    };
  }
  function setPreviewPose(yaw, pitch = 0) {
    window.cardPreview.pose(yaw, pitch);
    $('preview-yaw').value = String(Math.round(yaw));
    $('preview-pitch').value = String(Math.round(pitch));
  }
  function restoreEditorView(state) {
    window.atelierWorkspace.view(state.mode, false);
    view = { ...state.canvas };
    selected = state.selected.filter((id) =>
      doc.layers.some((l) => l.id === id),
    );
    if (!selected.length) selected = [doc.layers[0].id];
    target = state.target;
    showMask = state.showMask;
    setPreviewPose(state.pose.yaw, state.pose.pitch);
    window.cardPreview.setTime(state.pose.time);
    doc.effects.paused = state.paused;
    syncPreview();
    $('effect-time').value = String(Math.min(30, state.pose.time));
    $('time-value').textContent = state.paused ? '暂停' : '实时';
    renderLayers();
    syncProperties();
    draw();
  }
  function editorBinding() {
    const s = editorView();
    return {
      documentToken,
      revision,
      viewKey: JSON.stringify([
        s.mode,
        s.canvas,
        s.selected,
        s.target,
        s.pose.yaw,
        s.pose.pitch,
        s.paused,
        s.paused ? s.pose.time : null,
      ]),
    };
  }
  function applyEditorCommands(
    commands,
    binding = null,
    label = 'AI 调整图层与预览',
  ) {
    if (
      editorClosed() &&
      !(
        commands.length === 1 &&
        commands[0].op === 'workshop' &&
        ['newCard', 'switchCard'].includes(commands[0].action)
      )
    )
      throw Error('请先从工坊打开卡片，或新建卡片');
    if (commands.some(importedEditorCommands.isAuthoring))
      return applyProductionCommands(commands, binding);
    if (!doc || loading || busy || gesture || freeTransform || applying)
      throw Error('请先结束当前操作或变换');
    if (binding) {
      const now = editorBinding();
      if (!importedEditorCommands.bindingMatches(binding, now, commands))
        throw Error('工程、图层或视图已变化；请基于当前画面重新发送');
    }
    const before = snapshot(),
      beforeView = editorView(),
      plan = importedEditorCommands.plan(before, commands, selected[0]);
    importedCardRuntime.validate(plan.document);
    if (plan.preview.actionId)
      window.cardPreview.compileShader(plan.document.shader);
    doc = plan.document;
    selected = [plan.selected];
    target = 'image';
    showMask = false;
    if (plan.preview.mode)
      window.atelierWorkspace.view(plan.preview.mode, false);
    if (plan.preview.yaw !== undefined)
      setPreviewPose(plan.preview.yaw, plan.preview.pitch);
    if (plan.preview.seconds !== undefined) {
      window.cardPreview.setTime(plan.preview.seconds);
      $('effect-time').value = String(plan.preview.seconds);
      $('time-value').textContent = plan.preview.paused
        ? plan.preview.seconds.toFixed(1) + 's'
        : '实时';
    }
    syncTextures();
    push(before, label);
    undo.at(-1).editorView = beforeView;
    if (plan.preview.actionId)
      window.cardPreview.playAction(plan.preview.actionId);
    renderLayers();
    draw();
    say(commands.length + ' 项操作已应用 · 实时预览已同步 · ⌘/Ctrl Z 撤销');
    return { message: commands.length + ' 项操作已应用，可撤销', revision };
  }
  async function applyProductionCommands(
    commands,
    binding,
    label = 'AI 制作图层 / Mask / 动效',
  ) {
    importedEditorCommands.validate(commands);
    const initial = editorBinding(),
      productionToken = taskToken;
    const check = () => {
      if (taskToken !== productionToken) throw Error('制作处理已取消');
      if (!doc || loading || busy || gesture || freeTransform)
        throw Error('请先结束当前操作');
      const now = editorBinding();
      if (!importedEditorCommands.bindingMatches(initial, now, commands))
        throw Error('工程、图层或视图已变化；请重新发送制作要求');
    };
    if (applying) throw Error('正在应用制作操作');
    check();
    if (
      binding &&
      !importedEditorCommands.bindingMatches(binding, initial, commands)
    )
      throw Error('工程、图层或视图已变化；请基于当前画面重新发送');
    if (commands[0].op === 'recoverImage') {
      const c = commands[0],
        j = await bridge.invoke('agent-recover-candidate', {
          id: c.jobId,
          threshold: c.threshold ?? 4,
          documentToken,
        });
      check();
      return { message: j.message, revision, jobId: j.id };
    }
    if (commands[0].op === 'workshop') {
      const c = commands[0],
        ops = {
          create: 'create',
          newCard: 'add',
          duplicateCard: 'duplicate',
          renameCard: 'rename',
          switchCard: 'switch',
          renameWorkshop: 'rename-workshop',
        };
      if (c.action === 'create' && workshop)
        throw Error('当前已在工坊中，可直接新增卡片');
      const args =
        c.action === 'newCard'
          ? { document: await createBlankDocument(c.name) }
          : c.action === 'switchCard'
            ? { id: c.cardId }
            : { name: c.name };
      check();
      await workshopOperation(ops[c.action], args);
      return {
        message:
          '工坊已执行 ' +
          c.action +
          '；当前卡片：' +
          doc.name +
          (c.action === 'switchCard' ? '' : '，可撤销'),
        revision,
      };
    }
    if (['shared', 'publish'].includes(commands[0].op)) {
      if (!workshop) throw Error('先创建多卡片工坊');
      const c = commands[0];
      await workshopOperation(
        c.op === 'shared' ? 'bind' : 'publish',
        c.op === 'shared'
          ? {
              kind: c.kind,
              resourceId: c.resourceId,
              version: c.version,
              ids: [workshop.activeCardId],
            }
          : { kind: c.kind, name: c.name, resourceId: c.resourceId },
      );
      window.atelierComponents?.revealAuthored?.([c.kind]);
      return {
        message:
          (c.op === 'shared' ? '已绑定' : '已发布') +
          '共享' +
          W.kinds[c.kind] +
          '，可撤销',
        revision,
      };
    }
    const before = snapshot(),
      beforeView = editorView(),
      beforeWorkshop = workshop ? W.commit(workshop, before) : null;
    let loaded = false;
    applying = true;
    syncProperties();
    say('正在准备图层、抠图与 Mask…');
    try {
      if (commands[0].op === 'imageTask') {
        const c = commands[0],
          l = doc.layers.find((l) => l.id === c.layerId);
        if (
          !l ||
          l.locked ||
          (!l.src && l.kind !== 'text') ||
          importedCardStats.isStat(l)
        )
          throw Error('图片任务需要未锁定的图片或英雄字标图层');
        const src = l.src
          ? await imageFrom(l.src)
          : await imageFrom(textRaster(l).toDataURL('image/png'));
        let source = pngFromImage(src);
        if (c.width !== undefined || c.height !== undefined)
          source = (
            await bridge.invoke('process', {
              op: 'resize',
              args: {
                image: source,
                width: c.width || 1024,
                height: c.height || 1536,
              },
            })
          ).image;
        let mask = null;
        if (c.mode === 'inpaint') {
          const registered = canvasFor();
          registered
            .getContext('2d')
            .drawImage(registeredImage(l, src), 0, 0, 1024, 1536);
          const image = registered.toDataURL('image/png');
          const area = c.polygon
            ? await bridge.invoke('process', {
                op: 'selection',
                args: {
                  image,
                  points: c.polygon,
                  magnetic: false,
                  feather: Math.round(c.feather ?? 2),
                },
              })
            : await bridge.invoke('process', {
                op: 'smart_selection',
                args: {
                  image,
                  points: c.points || [],
                  labels: c.labels || [],
                  box: c.box,
                  engine: c.engine || 'sam',
                },
              });
          let selectedMask = area.image;
          if (!c.polygon && (c.feather ?? 2) > 0)
            selectedMask = (
              await bridge.invoke('process', {
                op: 'feather',
                args: {
                  image: selectedMask,
                  radius: Math.round(c.feather ?? 2),
                },
              })
            ).image;
          const full = canvasFor(src.naturalWidth, src.naturalHeight),
            mc = full.getContext('2d'),
            r = l.sourceWindow || {
              x: 0,
              y: 0,
              width: full.width,
              height: full.height,
            };
          mc.fillStyle = 'black';
          mc.fillRect(0, 0, full.width, full.height);
          mc.drawImage(
            await imageFrom(selectedMask),
            r.x,
            r.y,
            r.width,
            r.height,
          );
          mask = full.toDataURL('image/png');
        }
        check();
        const choice = window.atelierAgents.selection();
        const job = await bridge.invoke('agent-start', {
          ...choice,
          mode: c.mode,
          prompt: c.prompt,
          source,
          mask,
          padding: c.padding || [0, 0, 0, 0],
          sourceWindow: c.mode !== 'generate' ? l.sourceWindow : undefined,
          characterContext: importedCardSpatial.imageContext(doc, l),
          characterMaster: importedCardSpatial.characterMaster(doc, l),
          layerId: l.id,
          layerName: l.name,
          documentToken,
          revision,
          sessionId: window.atelierAgentChat.sessionId(),
        });
        try {
          check();
        } catch (e) {
          await bridge.invoke('agent-cancel', { id: job.id });
          throw e;
        }
        const message =
          '图片任务已提交：' +
          job.id +
          '。等待真实候选就绪后，AI 可用 asset 继续搭建图层。';
        say(message);
        window.atelierAgentChat?.refreshTasks?.().catch((e) => say(e.message));
        return { message, revision, jobId: job.id };
      }
      const plan = await bridge.invoke('authoring-prepare', {
        document: before,
        commands,
        selected: selected[0],
        documentToken,
      });
      check();
      // loadDocument decodes all images and compiles GLSL before touching live state.
      await loadDocument(plan.document, false);
      loaded = true;
      if (taskToken !== productionToken + 1) throw Error('制作处理已取消');
      restoreEditorView(beforeView);
      selected = [plan.selected];
      target = 'image';
      showMask = false;
      if (plan.preview.mode)
        window.atelierWorkspace.view(plan.preview.mode, false);
      if (plan.preview.yaw !== undefined)
        setPreviewPose(plan.preview.yaw, plan.preview.pitch);
      if (plan.preview.seconds !== undefined) {
        window.cardPreview.setTime(plan.preview.seconds);
        doc.effects.paused = plan.preview.paused;
      }
      applying = false;
      push(before, label, undefined, beforeWorkshop);
      undo.at(-1).editorView = beforeView;
      window.atelierComponents?.revealAuthored?.([
        ...new Set<string>(
          commands.flatMap((c) =>
            c.op === 'asset' && ['background', 'back'].includes(c.kind)
              ? [c.kind]
              : ['frame', 'particles', 'material'].includes(c.op)
                ? [c.op]
                : ['shader', 'armor'].includes(c.op)
                  ? ['effect']
                  : [],
          ),
        ),
      ]);
      if (plan.preview.actionId)
        window.cardPreview.playAction(plan.preview.actionId);
      renderLayers();
      syncProperties();
      syncPreview();
      draw();
      for (const id of plan.usedJobs)
        bridge.invoke('agent-applied', { id }).catch(() => {});
      const message = (
        commands.length +
        ' 项制作操作已应用，可撤销。' +
        plan.reports.join('；')
      ).slice(0, 500);
      say(message);
      return { message, revision };
    } catch (e) {
      if (loaded) {
        await loadDocument(before, false);
        workshop = beforeWorkshop;
        restoreEditorView(beforeView);
      }
      throw e;
    } finally {
      applying = false;
      syncProperties();
    }
  }
  function cardThumbnail() {
    const c = canvasFor(120, 180),
      cc = c.getContext('2d');
    cc.scale(120 / 1024, 180 / 1536);
    drawComposition(cc);
    return c.toDataURL('image/png');
  }
  function updateWorkshopThumbnail() {
    if (!workshop || !doc || workshop.editingAsset) return;
    W.card(workshop).thumbnail = cardThumbnail();
  }

  async function titleOutputs(
    document,
    bounds: Record<string, Record<string, [number, number]>> = {},
  ) {
    const outputs: Record<string, Record<string, string>> = {};
    for (const l of document.layers.filter((l) => l.titleArt)) {
      outputs[l.id] = {};
      for (const v of l.titleArt.variants) {
        if (v.src && !titleImages.has(v.src))
          titleImages.set(v.src, await imageFrom(v.src));
        const raster = textRaster(l, { ...document, locale: v.locale });
        outputs[l.id][v.locale] = raster.toDataURL('image/png');
        bounds[l.id] ||= {};
        bounds[l.id][v.locale] = titleRasterBounds(raster);
      }
    }
    return outputs;
  }
  async function renderCardOutput(document) {
    say('导出 ' + document.name + '：准备字体');
    await Promise.all([
      ...(document.fonts || []).map(registerFont),
      importedCardStats.loadThemes(document, imageFrom),
      importedCardFrameArtwork.loadDocument(document, imageFrom),
    ]);
    const map = new Map<string, HTMLImageElement>();
    say('导出 ' + document.name + '：解码图层');
    await Promise.all(
      document.layers
        .filter((l) => l.src)
        .map(async (l) => map.set(l.id, await imageFrom(l.src))),
    );
    say('导出 ' + document.name + '：生成多语言字标');
    const titleBounds: Record<string, Record<string, [number, number]>> = {},
      titleRasters = await titleOutputs(document, titleBounds);
    if (document.masks.inset)
      map.set('mask:inset', await imageFrom(document.masks.inset));
    const c = canvasFor(),
      cc = c.getContext('2d'),
      layerRasters: Record<string, string> = {};
    drawComposition(cc, document, map);
    for (const l of document.layers.filter((l) =>
      ['text', 'frame'].includes(l.kind),
    )) {
      const raster = l.kind === 'text' ? textRaster(l, document) : canvasFor();
      if (l.kind === 'frame')
        drawLayer(
          raster.getContext('2d'),
          { ...l, x: 0, y: 0, scale: 1, opacity: 1, visible: true },
          document,
          map,
        );
      layerRasters[l.id] = raster.toDataURL('image/png');
    }
    return {
      front: c.toDataURL('image/png'),
      layerRasters,
      titleRasters,
      titleBounds,
      framePreview: framePreview(document),
    };
  }
  async function workshopOperation(
    op: string,
    args: {
      id?: string;
      workshop?: unknown;
      document?: CardDocument;
      name?: string;
      kind?: ResourceKind;
      value?: WorkshopValue;
      resourceId?: string;
      bind?: boolean;
      binding?: ResourceBinding;
      version?: number;
      ids?: string[];
    } = {},
  ) {
    if (!doc || loading || busy || applying || gesture || freeTransform)
      throw Error('请先完成当前编辑或处理');
    const before = snapshot(),
      beforeWorkshop = workshop ? W.commit(workshop, before) : null;
    let next = beforeWorkshop ? W.clone(beforeWorkshop) : null,
      result = null,
      label = '工坊操作';
    if (op === 'switch') {
      if (!next || (next.activeCardId === args.id && !next.editingAsset))
        return;
      W.card(next, args.id);
      next = importedCardAssetWorkspace.leave(next);
      next.activeCardId = args.id;
      workshop = next;
      const resolved = W.resolve(next);
      try {
        await loadDocument(resolved, false);
      } catch (e) {
        workshop = beforeWorkshop;
        syncPreview();
        syncProperties();
        throw e;
      }
      workshop = next;
      doc.revision = revision;
      syncProperties();
      $('document-name').textContent = doc.name + ' · ' + workshop.name;
      say('已切换到 ' + doc.name + '，编辑保留在工坊中');
      queueSession();
      return;
    }
    if (op === 'open') {
      workshop = args.workshop ? W.migrate(args.workshop) : null;
      try {
        await loadDocument(workshop ? W.resolve(workshop) : args.document);
      } catch (e) {
        workshop = beforeWorkshop;
        throw e;
      }
      syncProperties();
      await newSession();
      return;
    }
    if (op === 'create') {
      next = W.create(
        before,
        'workshop-' + crypto.randomUUID(),
        'card-' + crypto.randomUUID(),
        args.name,
      );
      label = '创建多卡片工坊';
    } else {
      if (!next) throw Error('先创建多卡片工坊');
      if (next.editingAsset && op === 'publish' && !args.value)
        throw Error('请使用工作区上方的发布版本');
      if (
        next.editingAsset &&
        !['publish', 'rename-workshop', 'preview-default'].includes(op)
      )
        throw Error('请先返回正面卡片，再执行该工坊操作');
      if (op === 'duplicate') {
        next = W.duplicate(next, 'card-' + crypto.randomUUID(), args.name);
        label = '复制卡片';
      } else if (op === 'add') {
        await bridge.invoke('validate-card', { document: args.document });
        next = W.add(
          next,
          args.document,
          'card-' + crypto.randomUUID(),
          args.name,
        );
        label = '加入卡片';
      } else if (op === 'rename') {
        W.card(next).name = args.name.trim();
        W.card(next).document.name = args.name.trim();
        label = '重命名卡片';
      } else if (op === 'rename-workshop') {
        next.name = args.name.trim();
        label = '重命名工坊';
      } else if (op === 'remove-card') {
        if (next.cards.length <= 1) throw Error('至少保留一张卡片');
        next.cards = next.cards.filter((c) => c.id !== args.id);
        if (!next.cards.some((c) => c.id === next.activeCardId))
          next.activeCardId = next.cards[0].id;
        label = '移除卡片';
      } else if (op === 'publish') {
        const value = args.value || W.capture(before, args.kind);
        result = W.publish(next, {
          kind: args.kind,
          name: args.name,
          value,
          id: 'resource-' + crypto.randomUUID(),
          resourceId: args.resourceId,
        });
        next =
          args.bind === false
            ? result.workshop
            : W.bind(
                result.workshop,
                args.kind,
                result.resourceId,
                result.version,
                [next.activeCardId],
              );
        label = args.resourceId ? '发布共享资源新版本' : '发布共享资源';
      } else if (op === 'preview-default') {
        next = W.setDefault(next, args.kind, args.binding || null);
        label = '设置工坊默认预览组件';
      } else if (op === 'bind') {
        next = W.bind(next, args.kind, args.resourceId, args.version, args.ids);
        label = '应用共享资源到 ' + args.ids.length + ' 张卡片';
      } else if (op === 'detach') {
        next = W.detach(next, args.kind);
        label = '共享资源转为独立副本';
      } else if (op === 'remove-resource') {
        if (W.uses(next, args.id).length)
          throw Error('资源仍被卡片使用，先替换引用或转为独立副本');
        next.resources = next.resources.filter((r) => r.id !== args.id);
        if (next.assetDrafts)
          for (const [key, d] of Object.entries(next.assetDrafts))
            if (d.resourceId === args.id) delete next.assetDrafts[key];
        label = '移除未使用资源';
      } else throw Error('工坊操作无效');
    }
    W.validate(next);
    const resolved = W.resolve(next);
    await updateDocument(resolved);
    workshop = next;
    push(before, label, undefined, beforeWorkshop);
    $('document-name').textContent = doc.name + ' · ' + workshop.name;
    updateWorkshopThumbnail();
    syncProperties();
    say(label + ' · 可撤销');
    return result;
  }
  async function editAsset(
    resourceId = '',
    version = 0,
    fresh = false,
    kind: ResourceKind = 'back',
  ) {
    if (!workshop || loading || busy || applying || gesture || freeTransform)
      throw Error('请先结束当前操作，并打开工坊');
    applying = true;
    syncProperties();
    try {
      const before = snapshot(),
        beforeWorkshop = W.commit(workshop, before),
        blank = await createBlankDocument('新组件');
      blank.id = 'draft-' + crypto.randomUUID();
      blank.assetKind = kind;
      blank.cosmetics = { ...importedCardCosmetics.defaults };
      const resourceKind = resourceId
        ? W.resource(beforeWorkshop, resourceId).kind
        : kind;
      if (!Object.hasOwn(W.kinds, resourceKind)) throw Error('组件分类无效');
      kind = resourceKind as ResourceKind;
      let value;
      try {
        value = fresh ? null : W.capture(before, kind);
      } catch {}
      if (!resourceId && ['material', 'effect'].includes(kind)) {
        const bg = blank.layers.find((l) => l.kind === 'background');
        bg.src =
          before.layers.find((l) => l.kind === 'background')?.src ||
          before.back;
      }
      let next = importedCardAssetWorkspace.start(beforeWorkshop, {
        resourceId,
        version,
        blank,
        kind,
        value,
      });
      if (kind === 'back' && !resourceId && !fresh) {
        const value = importedCardBack.fromDocument(before);
        if (value?.src)
          next.editingAsset.document = importedCardAssetWorkspace.documentFor(
            value,
            blank,
            '卡背 · 新资产',
            next.editingAsset.document.id,
          );
      }
      next.editingAsset.returnView =
        beforeWorkshop.editingAsset?.returnView || editorView();
      W.validate(next);
      workshop = next;
      try {
        await loadDocument(W.resolve(next), false);
      } catch (e) {
        workshop = beforeWorkshop;
        throw e;
      }
      selected = [
        (kind === 'frame'
          ? doc.layers.find((l) => l.kind === 'frame')
          : kind === 'particles'
            ? doc.layers.find((l) => l.kind === 'foreground')
            : doc.layers.find((l) => l.visible && l.kind === 'foreground') ||
              doc.layers.find((l) => l.visible)
        )?.id || doc.layers[0].id,
      ];
      target = 'image';
      showMask = false;
      window.atelierComponents?.clear();
      window.atelierWorkspace.view('split', false);
      setPreviewPose(0, 0);
      document.body.classList.remove('dock-collapsed', 'panels-hidden');
      window.atelierWorkspace.panel(
        kind === 'frame'
          ? 'frame'
          : kind === 'particles'
            ? 'particles'
            : kind === 'material'
              ? 'appearance'
              : 'properties',
      );
      push(
        before,
        '打开' + W.kinds[kind] + '工作区',
        undefined,
        beforeWorkshop,
      );
      renderLayers();
      syncProperties();
      fit();
      window.dispatchEvent(
        new CustomEvent('atelier-back-editor-open', {
          detail: { resourceId, version },
        }),
      );
      say(
        W.kinds[kind] + '已进入主编辑区 · 图层、Mask、深度、动画与 GLSL 共用',
      );
    } finally {
      applying = false;
      syncProperties();
    }
  }
  async function returnAsset(previewValue = null) {
    if (
      !workshop?.editingAsset ||
      loading ||
      busy ||
      applying ||
      gesture ||
      freeTransform
    )
      throw Error('请先结束组件编辑操作');
    const before = snapshot(),
      beforeWorkshop = W.commit(workshop, before),
      kind = beforeWorkshop.editingAsset.kind,
      returnView = beforeWorkshop.editingAsset.returnView,
      next = importedCardAssetWorkspace.leave(beforeWorkshop);
    workshop = next;
    try {
      await loadDocument(W.resolve(next), false);
    } catch (e) {
      workshop = beforeWorkshop;
      throw e;
    }
    push(before, '返回正面卡片', undefined, beforeWorkshop);
    window.atelierWorkshopTabs?.explicitOpen(next.activeCardId);
    if (returnView) restoreEditorView(returnView);
    if (previewValue) {
      window.atelierComponents.draft(kind, previewValue);
      window.atelierWorkspace.ensurePreview();
      window.cardPreview.transitionPose(kind === 'back' ? 180 : 0, 0);
    }
    say(
      previewValue
        ? W.kinds[kind] + '草稿组合预览 · 已保留独立草稿'
        : '已返回正面 · 组件草稿保留在工坊',
    );
    syncProperties();
  }
  async function assetOutput() {
    const before = snapshot(),
      project = workshop.id,
      token = documentToken,
      version = revision;
    applying = true;
    syncProperties();
    try {
      const value = importedCardAssetWorkspace.pack(
        before,
        await renderCardOutput(before),
        workshop.editingAsset.kind,
      );
      if (
        workshop?.id !== project ||
        documentToken !== token ||
        revision !== version
      )
        throw Error('组件已变化，请重新操作');
      return value;
    } finally {
      applying = false;
      syncProperties();
    }
  }
  async function publishAsset() {
    if (
      !workshop?.editingAsset ||
      loading ||
      busy ||
      applying ||
      gesture ||
      freeTransform
    )
      throw Error('请先结束组件编辑操作');
    const before = snapshot(),
      beforeWorkshop = W.commit(workshop, before),
      value = await assetOutput(),
      result = importedCardAssetWorkspace.publish(
        beforeWorkshop,
        value,
        'resource-' + crypto.randomUUID(),
      );
    W.validate(result.workshop);
    workshop = result.workshop;
    push(before, '发布组件版本 v' + result.version, undefined, beforeWorkshop);
    window.dispatchEvent(
      new CustomEvent('atelier-component-published', {
        detail: {
          resourceId: result.resourceId,
          version: result.version,
          projectId: workshop.id,
        },
      }),
    );
    say(
      W.kinds[workshop.editingAsset.kind] +
        ' v' +
        result.version +
        ' 已发布 · 可继续编辑或组合预览',
    );
    return result;
  }
  async function previewAsset() {
    if (
      !workshop?.editingAsset ||
      loading ||
      busy ||
      applying ||
      gesture ||
      freeTransform
    )
      throw Error('请先结束组件编辑操作');
    const value = await assetOutput();
    await returnAsset(value);
  }
  const exposedcardEditorHost = {
    validateDocument(value: unknown): asserts value is CardDocument {
      importedCardRuntime.validate(value);
    },
    loadImage: imageFrom,
    async applyLaserLayout(fields: LaserLayoutFields | null) {
      if (!doc || busy || loading || applying || gesture || freeTransform)
        throw Error('请先结束当前编辑操作');
      if (!fields && !doc.laserLayout) return;
      const token = documentToken, version = revision;
      const next = await laserLayout.build(doc, fields, imageFrom, masks.get('subject')?.canvas);
      if (documentToken !== token || revision !== version || busy || loading || applying || gesture || freeTransform)
        throw Error('卡面已变化，请重新应用装裱');
      importedCardFrame.validate(next);
      const before = snapshot();
      applying = true;
      try {
        await updateDocument(next);
        push(before, fields ? '应用镭射装裱' : '移除镭射装裱');
        renderLayers();
      } finally {
        applying = false;
        syncProperties();
      }
    },
    imageCacheStats: () => imageAssets.stats(),
    async applyCharacterImport(next, context) {
      const check = () => {
        if (
          loading ||
          busy ||
          gesture ||
          freeTransform ||
          applying ||
          documentToken !== context.documentToken ||
          revision !== context.revision
        )
          throw Error('工程已变化或正忙，请重新检查导入');
      };
      check();
      importedCardRuntime.validate(next);
      // Decode all new sources before replacing live state or adding history.
      await Promise.all(
        next.layers
          .filter(
            (l) =>
              l.src && doc.layers.find((old) => old.id === l.id)?.src !== l.src,
          )
          .map(async (l) => {
            const image = await imageFrom(l.src);
            if (
              image.naturalWidth > 8192 ||
              image.naturalHeight > 8192 ||
              image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024
            )
              throw Error('图集图片超过 16 MP / 8192 px');
          }),
      );
      check();
      const before = snapshot(),
        beforeView = editorView();
      applying = true;
      try {
        await updateDocument(next);
        applying = false;
        selected = [next.characterRig.meshes[0]?.layerId || selected[0]];
        push(before, '导入 Spine JSON 与图集');
        undo.at(-1).editorView = beforeView;
        renderLayers();
        syncProperties();
        syncPreview();
        draw();
        return true;
      } finally {
        applying = false;
        syncProperties();
      }
    },
    editComponent(kind, id = '', version = 0) {
      return editAsset(id, version, false, kind);
    },
    editAsset,
    returnAsset,
    publishAsset,
    previewAsset,
    emitterContext() {
      return workshop?.editingAsset?.kind === 'particles'
        ? W.resolve(workshop, workshop.activeCardId)
        : doc;
    },
    redraw() {
      draw();
    },
    startEmitter() {
      if (loading || busy || applying || gesture || freeTransform) return;
      target = 'image';
      showMask = false;
      setTool('emitter');
      window.atelierWorkspace.view('split');
      syncProperties();
      draw();
    },
    selectTool(name, { character = false } = {}) {
      if (!doc || loading || busy || applying) return;
      target = 'image';
      showMask = false;
      setTool(name, character);
      syncProperties();
      draw();
    },
    startAnchor(mode) {
      const l = active();
      if (
        !l ||
        l.locked ||
        !['image', 'foreground', 'text'].includes(l.kind) ||
        busy ||
        gesture ||
        freeTransform ||
        applying
      ) {
        say('先选择未锁定的图片／字标图层');
        return;
      }
      if (mode === 'cloth' && importedCardSpatial.rigid(l)) {
        say('刚性人物部件使用旋转中心；衣料锚点会使肢体变形');
        return;
      }
      anchorMode = mode;
      target = 'image';
      showMask = false;
      window.atelierWorkspace.view('split');
      setTool('anchor');
      draw();
      say(
        mode === 'pivot'
          ? '在画布点击或拖动旋转中心'
          : '拖动蓝色固定点和黄色自由端；两点间至少16px',
      );
    },
    async splitSelection(role, part, side = 'center', animate = false) {
      if (active()?.kind !== 'foreground' || active().locked || !selection)
        throw Error('在未锁定的人物母版上建立选区后拆层');
      const token = documentToken,
        version = revision,
        id = active().id,
        mask = await localSelection();
      if (token !== documentToken || version !== revision || id !== active().id)
        throw Error('选区准备时工程已变化');
      const newLayerId = 'part-' + crypto.randomUUID();
      return applyProductionCommands(
        [
          {
            op: 'splitLayer',
            layerId: id,
            newLayerId,
            name:
              (importedCardSpatial.parts[part]?.name || '衣料') +
              ' / ' +
              (role === 'rear' ? '后层' : '前层'),
            role,
            ...(part ? { part, side } : {}),
            selectionMask: mask,
            feather: 0,
          },
          ...(animate && importedCardSpatial.parts[part]?.mode === 'cloth'
            ? [{ op: 'attachment' as const, layerId: newLayerId, motion: 1 }]
            : []),
        ],
        undefined,
        '选区拆为' + (role === 'rear' ? '后层' : '前层'),
      );
    },
    async motionFromAnchors() {
      const l = active();
      if (
        l.kind !== 'foreground' ||
        l.locked ||
        importedCardSpatial.rigid(l) ||
        !l.motionAnchor
      )
        throw Error(
          '请选择人物母版并先设置运动锚点；拆出衣料的锚点直接控制连接权重',
        );
      const args = {
        image: doc.masks.motion,
        selection: selection ? await localSelection() : doc.masks.coverage,
        coverage: doc.masks.coverage,
        guard: doc.masks.rigid,
        mode: 'add',
        gradient: 'line',
        start: l.motionAnchor.root,
        end: l.motionAnchor.tip,
        value: 1,
      };
      await processTask(
        '锚点生成运动权重',
        'mask_combine',
        args,
        async (result) => {
          doc.masks.motion = result.image;
          await registerMask('motion', result.image);
          target = 'motion';
          showMask = true;
        },
      );
    },

    setRegionMode(mode, maskId = undefined) {
      if (
        ![
          'none',
          'layer',
          'mask',
          'selection',
          'connection',
          'channels',
        ].includes(mode)
      )
        return;
      regionMode = mode;
      if (maskId && masks.has(maskId)) regionMaskId = maskId;
      syncRegionHighlight();
    },
    selectLayer(id) {
      if (!doc?.layers.some((l) => l.id === id)) return false;
      selectLayer(id);
      return active()?.id === id;
    },
    spaceSource(id) {
      if (!doc) return null;
      if (!id) return images.get('space-back');
      const l = doc.layers.find((l) => l.id === id);
      if (!l) return null;
      if (l.kind === 'text') return textRaster(l);
      const image = images.get(id);
      return image
        ? importedCardSpace.background(l)
          ? image
          : registeredImage(l, image)
        : null;
    },
    spaceMask(id) {
      const m = masks.get(id);
      return m
        ? { canvas: m.canvas, version: maskVersions.get(m.canvas) || 0 }
        : null;
    },
    beginSpaceMove(id) {
      if (loading || busy || gesture || freeTransform || applying) return false;
      const l = doc.layers.find((l) => l.id === id);
      if (!l || l.locked || l.kind === 'frame') {
        say(l?.locked ? '图层已锁定，请先解锁' : '卡框位置固定，请编辑样式');
        return false;
      }
      selectLayer(id);
      gesture = {
        kind: 'move',
        space: true,
        before: snapshot(),
        layers: [{ id: l.id, x: l.x, y: l.y }],
      };
      syncProperties();
      return true;
    },
    updateSpaceMove(dx, dy) {
      if (!gesture?.space) return;
      for (const initial of gesture.layers) {
        const l = doc.layers.find((l) => l.id === initial.id);
        l.x = Math.max(-4096, Math.min(4096, Math.round(initial.x + dx)));
        l.y = Math.max(-4096, Math.min(4096, Math.round(initial.y + dy)));
      }
      syncPreview();
      syncProperties();
      draw();
    },
    async endSpaceMove(cancel = false) {
      if (!gesture?.space) return;
      await endGesture(cancel);
      syncProperties();
      renderLayers();
    },
    checkCutout(capture) {
      if (!doc || loading || busy || gesture || freeTransform || applying)
        throw Error('请先结束当前操作');
      if (
        capture.documentToken !== documentToken ||
        capture.revision !== revision ||
        capture.layerId !== active()?.id
      )
        throw Error('工程或图层已变化，请基于当前图片重新抠图');
      return active();
    },
    async captureCutout() {
      if (!doc || loading || busy || gesture || freeTransform || applying)
        throw Error('请先结束当前操作');
      const layer = active();
      if (!images.has(layer.id))
        throw Error('请选择图片图层，文字可以先转为图片');
      const capture = {
        source: '',
        documentToken,
        revision,
        layerId: layer.id,
        layerName: layer.name,
        canCoverage: layer.kind === 'foreground' && !layer.locked,
      };
      const image =
        layer.kind === 'foreground' && layer.master
          ? await imageFrom(layer.master)
          : images.get(layer.id);
      const c = canvasFor();
      c.getContext('2d').drawImage(
        registeredImage(layer, image),
        0,
        0,
        1024,
        1536,
      );
      capture.source = c.toDataURL('image/png');
      this.checkCutout(capture);
      return capture;
    },
    async applyCutout(capture, result, mode) {
      const source = this.checkCutout(capture);
      if (!['new', 'coverage', 'selection'].includes(mode))
        throw Error('抠图应用方式无效');
      if (mode === 'new' && doc.layers.length >= 64)
        throw Error('图层已达 64 层上限');
      if (
        mode === 'coverage' &&
        (source.kind !== 'foreground' || source.locked)
      )
        throw Error('可见轮廓 Mask 需要未锁定的人物图层');
      const image = await imageFrom(result.image),
        mask = await imageFrom(result.mask),
        previous = await captureSelection();
      this.checkCutout(capture);
      if (
        [image, mask].some(
          (im) => im.naturalWidth !== 1024 || im.naturalHeight !== 1536,
        )
      )
        throw Error('抠图结果尺寸与卡牌不一致');
      const before = snapshot();
      if (mode === 'new') {
        const layer = {
          ...source,
          id: 'cutout-' + crypto.randomUUID(),
          kind: 'image',
          previewReference: false,
          name: source.name + ' / 抠图',
          src: result.image,
          master: undefined,
          sourceWindow: undefined,
          role: undefined,
          locked: false,
          visible: true,
          cutoutMask: result.mask,
          cutoutSourceId: source.id,
        };
        source.visible = false;
        doc.layers.unshift(layer);
        images.set(layer.id, image);
        selected = [layer.id];
        target = 'image';
        showMask = false;
        selection = null;
        selectionMask = null;
        selectionLayer = null;
        smartSession = null;
        lassoPoints = [];
      } else if (mode === 'coverage') {
        source.master = capture.source;
        source.src = result.image;
        source.sourceWindow = undefined;
        images.set(source.id, image);
        doc.masks.coverage = result.mask;
        await registerMask('coverage', mask);
        target = 'image';
        showMask = false;
        selection = null;
        selectionMask = null;
        selectionLayer = null;
        smartSession = null;
        lassoPoints = [];
      } else {
        smartSession = null;
        lassoPoints = [];
        await setSelectionImage(result.mask);
      }
      syncTextures();
      push(
        before,
        mode === 'new'
          ? '一键抠图 / 保留原图'
          : mode === 'coverage'
            ? '一键抠图 / 人物可见轮廓'
            : '一键抠图 / 主体选区',
        previous,
      );
      renderLayers();
      say(
        mode === 'new'
          ? '透明图层已创建，原图保留并隐藏；可撤销或导出 PNG'
          : mode === 'coverage'
            ? '人物轮廓已更新，运动与发光 Mask 保留；可撤销'
            : '主体选区已生成，可修整边缘并提取 Mask',
      );
    },
    smartCutout() {
      setTool('smart');
      say('点选或拖框圈定主体；Shift 添加、Alt 排除，然后选区复制为图像');
    },
    replaceImage() {
      if (active()?.kind !== 'image' || active().locked) return;
      say('选择新的 PNG / JPEG / WebP；Slot、位置和调色参数保留');
      $('import-role').value = String('replace');
      command('import');
    },
    setMaskBrush(value) {
      brushValue =
        typeof value === 'number'
          ? Math.max(0, Math.min(255, Math.round(value)))
          : value
            ? 255
            : 0;
      white = brushValue >= 128;
      syncProperties();
      window.dispatchEvent(
        new CustomEvent('mask-brush-change', {
          detail: { value: brushValue, hardness: brushHardness },
        }),
      );
    },
    setMaskHardness(value) {
      brushHardness = Math.max(0, Math.min(1, value));
    },
    setMaskDisplay(mode) {
      if (!['overlay', 'gray'].includes(mode)) return;
      maskDisplayMode = mode;
      showMask = true;
      syncProperties();
      draw();
    },
    chooseMask(id, toolName = 'brush') {
      if (
        loading ||
        busy ||
        gesture ||
        freeTransform ||
        applying ||
        !maskNames[id]
      )
        return;
      const subject = id === 'subject';
      const candidates = (doc?.layers || []).filter((layer) =>
        subject
          ? images.has(layer.id) &&
            layer.kind !== 'text' &&
            layer.visible !== false
          : layer.kind === 'foreground',
      );
      const layer =
        candidates.find((l) => l.id === active()?.id) ||
        (subject
          ? candidates.find((l) => !l.locked && l.kind === 'background') ||
            candidates.find((l) => !l.locked)
          : null) ||
        candidates[0];
      if (!layer) {
        say(subject ? '请先导入要标注主体的图片' : '请先导入连续人物层');
        return;
      }
      if (subject && !masks.has(id)) void registerMask(id, blankMaskCanvas());
      if (subject) $<HTMLDetailsElement>('mask-selection-tools').open = true;
      window.atelierWorkspace?.view('split');
      showMask = toolName === 'brush';
      $('selection-target').value = String(id);
      selectLayer(layer.id, toolName === 'brush' ? id : 'image');
      setTool(toolName);
      syncProperties();
      say(
        layer.locked
          ? '图层已锁定，先解锁再制作 Mask'
          : toolName === 'brush'
            ? '正在绘制 ' + maskNames[id] + ' Mask · X 切换黑白'
            : '建立选区后点击“选区写入当前 Mask”',
      );
    },
    async markBreakoutSelection() {
      const layer = active();
      if (layer?.kind !== 'foreground' || layer.locked || selectionLayer !== layer.id || !selection)
        throw Error('请先在未锁定的人物上圈选要破框的区域');
      const binding = [documentToken, revision, layer.id];
      const mask = await localSelection();
      if (binding[0] !== documentToken || binding[1] !== revision || binding[2] !== active()?.id)
        throw Error('选区准备时工程已变化');
      await processTask(
        '仅让选区破框',
        'mask_combine',
        { image: blankMaskCanvas('white').toDataURL('image/png'), selection: mask, mode: 'subtract' },
        async (result) => {
          await registerMask('inset', result.image);
          doc.masks.inset = result.image;
          target = 'inset';
          showMask = true;
        },
      );
    },
    clearSubjectMask() {
      if (
        !doc?.masks.subject ||
        loading ||
        busy ||
        gesture ||
        freeTransform ||
        applying
      )
        return;
      mutate('清除镭射主体标注', () => {
        delete doc.masks.subject;
        if (doc.laserLayout) delete doc.laserLayout.sourceMask;
        masks.delete('subject');
        window.cardPreview.removeMask('subject');
        if (target === 'subject') target = 'image';
      });
    },
    applySelectionToMask,
    unlockMaskLayer() {
      if (
        loading ||
        busy ||
        gesture ||
        freeTransform ||
        applying ||
        (active()?.kind !== 'foreground' && !images.has(active()?.id))
      )
        return;
      const layer = active();
      if (layer.locked)
        mutate('解锁人物层制作 Mask', () => (layer.locked = false));
    },
    chooseFrame() {
      const layer = doc?.layers.find((l) => l.kind === 'frame');
      if (layer) selectLayer(layer.id);
    },
    unlockFrame() {
      if (
        active()?.kind === 'frame' &&
        active().locked &&
        !busy &&
        !gesture &&
        !freeTransform &&
        !applying
      )
        mutate('解锁边框样式', () => (active().locked = false));
    },
    async cacheTitle(src) {
      const im = await imageFrom(src);
      if (
        im.naturalWidth > 8192 ||
        im.naturalHeight > 8192 ||
        im.naturalWidth * im.naturalHeight > 16 * 1024 * 1024
      )
        throw Error('字标图片超过尺寸上限');
      titleImages.set(src, im);
      return im;
    },
    scaleTitle(id, value) {
      if (!Number.isFinite(value) || value < 0.01 || value > 10)
        throw Error('缩放范围 1% 到 1000%');
      return this.mutate('缩放图片字标', (d) => {
        const l = d.layers.find((l) => l.id === id);
        if (!l || l.locked || l.kind !== 'text')
          throw Error('请选择未锁定的字标');
        scaleLayer(l, value);
      });
    },
    editTitle(id) {
      if (!this.selectLayer(id)) return false;
      setTool('move');
      window.atelierWorkspace.view('split');
      transformStart();
      return true;
    },
    state: () => ({
      brushValue,
      brushHardness,
      desktop,
      mode: document.body.dataset.appMode,
      document: doc,
      workshop,
      layer: active(),
      tool,
      target,
      busy: busy || loading || applying || !!gesture || freeTransform,
      dirty: revision !== savedRevision,
      revision,
      documentToken,
      showMask,
      white,
      maskDisplayMode,
      selection: !!selection,
    }),
    flushSession,
    openDemo: async (id: string) =>
      openHomeResult(await bridge.invoke('home-open-demo', { id })),
    openRecent: async (id, cardId) =>
      openHomeResult(await bridge.invoke('home-open', { id, cardId })),
    openFileData: async (text) =>
      openHomeResult(
        await bridge.invoke(
          'home-open-file',
          text === undefined ? {} : { text },
        ),
      ),
    pickFile: () => bridge.invoke('home-choose-file'),
    openFileSelection: async (selection) =>
      openHomeResult(await bridge.invoke('home-open-file', { selection })),
    opened,
    refreshPreview() {
      syncPreview();
    },
    workshop: workshopOperation,
    invoke: (method, args = undefined) => bridge.invoke(method, args),
    command,
    mutate(label, fn) {
      if (loading || busy || gesture || freeTransform || applying) {
        say('请先结束当前处理或变换');
        return false;
      }
      const next = snapshot();
      fn(
        next,
        next.layers.find((l) => l.id === selected[0]),
      );
      importedCardRuntime.validate(next);
      const signature = (d) =>
        JSON.stringify([
          d.name,
          d.previewMode,
          d.exportSettings,
          d.cosmetics,
          d.componentScenes,
          d.effects,
          d.characterEffects,
          d.locale,
          d.composition,
          d.armor,
          d.material,
          d.particles,
          d.emissionRegions,
          d.spatial,
          d.characterRig,
          d.deformation,
          d.actions,
          d.slots,
          d.shader,
          d.frameStyle,
          d.frameStyles,
          d.layers.map((l) => [
            l.id,
            l.anatomy,
            l.x,
            l.y,
            l.scale,
            l.rotation,
            l.pivot,
            l.motionAnchor,
            l.opacity,
            l.adjustments,
            l.blend,
            l.slotId,
            l.role,
            l.spatial,
            l.attachment,
            l.text,
            l.visible,
            l.textStyle,
            l.titleArt,
            l.previewReference,
          ]),
        ]);
      if (signature(next) === signature(doc)) return false;
      mutate(label, () => (doc = next));
      return true;
    },
    say,
    fit,
    async refine(operation, radius) {
      try {
        if (!selection || selectionLayer !== active().id) {
          say('请先在当前图层建立选区');
          return;
        }
        const image = await localSelection();
        await processTask(
          '修整选区 / ' + operation,
          'refine_selection',
          { image, operation, radius },
          async (result) => {
            smartSession = null;
            await setSelectionImage(result.image);
          },
        );
      } catch (e) {
        say(e.message);
      }
    },
    compile(config) {
      if (!doc || busy || gesture || freeTransform || applying || loading)
        throw Error('请先结束当前处理或变换');
      const shader = { ...importedCardRuntime.defaults.shader, ...config };
      importedCardRuntime.validate({ ...doc, shader });
      window.cardPreview.compileShader(shader);
      mutate('编译 GLSL 几何与材质效果', () => {
        doc.previewMode = 'authored';
        doc.shader = shader;
      });
      syncTextures();
    },
    async applyMaterialMaker(result, kind) {
      const check = () => {
        if (
          !doc ||
          documentToken !== result.documentToken ||
          selected[0] !== result.layerId ||
          revision !== result.revision
        )
          throw Error('卡片或图层已变化；请重新打开当前图层的节点工程');
        if (
          busy ||
          loading ||
          gesture ||
          freeTransform ||
          applying ||
          active().locked
        )
          throw Error('请先结束当前操作，或解锁图层');
      };
      check();
      const beforeRevision = revision;
      const metadata = {
        project: structuredClone(result.project),
        layerId: result.layerId,
        hash: result.hash,
        toolVersion: '1.7',
      };
      if (kind === 'shader') {
        if (!result.shader)
          throw Error(result.shaderError || '缺少动态 Shader');
        this.compile({
          ...doc.shader,
          ...result.shader,
          editorMode: 'glsl',
          fragmentTarget: result.layerId,
          fragmentMask: 'none',
          fragmentStrength: 1,
          materialMaker: metadata,
        });
        return revision;
      }
      const src = result.images?.[kind];
      if (!src) throw Error('请将节点连接到相应输出后再同步');
      const image = await imageFrom(src);
      check();
      if (image.naturalWidth !== 1024 || image.naturalHeight !== 1536)
        throw Error('回传素材需要统一画布尺寸');
      if (
        ['motion', 'emission', 'phase', 'foil', 'inset', 'rigid'].includes(kind)
      ) {
        if (active().kind !== 'foreground')
          throw Error('共享 Mask 应应用到连续人物母版；其他素材可回传效果图片');
        await processTask(
          'Material Maker / ' + maskNames[kind] + ' Mask',
          'mask_combine',
          {
            image: doc.masks[kind],
            selection: src,
            mode: 'replace',
            value: 1,
            coverage: doc.masks.coverage,
            ...(kind === 'motion' ? { guard: doc.masks.rigid } : {}),
          },
          async (value) => {
            doc.masks[kind] = value.image;
            await registerMask(kind, value.image);
            active().materialMaker = metadata;
            target = kind;
            showMask = true;
          },
        );
        if (revision === beforeRevision)
          throw Error('Mask 未应用，请检查处理状态后重试');
        return revision;
      }
      const before = snapshot();
      check();
      if (kind === 'source') {
        const layer = active();
        if (!['image', 'background'].includes(layer.kind))
          throw Error('仅支持替换图像 / 背景；人物母版保持连续轮廓');
        layer.src = src;
        layer.materialMaker = metadata;
        delete layer.sourceWindow;
        images.set(layer.id, image);
      } else if (kind === 'effect') {
        if (doc.layers.length >= 64) throw Error('最多 64 个图层');
        const layer = {
          ...active(),
          id: 'mm-' + crypto.randomUUID(),
          name: active().name + ' · Material Maker',
          kind: 'image',
          role: 'effect',
          src,
          master: undefined,
          previewReference: false,
          locked: false,
          materialMaker: metadata,
        };
        delete layer.titleArt;
        delete layer.text;
        delete layer.ownershipMask;
        delete layer.cutoutMask;
        doc.layers.unshift(layer);
        images.set(layer.id, image);
        selected = [layer.id];
      } else throw Error('不支持的回传类型');
      syncTextures();
      push(before, '回传 Material Maker 图像');
      renderLayers();
      syncProperties();
      draw();
      return revision;
    },
    setAnimationFeedback(value) {
      animationFeedback = value;
      canvas.dataset.animationTrack = value?.track || '';
      canvas.dataset.animationDraft = String(!!value?.draft);
      if (!value) delete canvas.dataset.animationBounds;
      draw();
    },
    previewEffects(seconds = 0, paused = false, replay = false) {
      if (!doc || loading || busy || gesture || freeTransform || applying)
        return false;
      this.activateRuntime();
      doc.effects.paused = paused;
      window.cardPreview.stopAction();
      syncPreview();
      if (replay) window.cardPreview.replayParticles();
      else window.cardPreview.setTime(seconds);
      window.atelierWorkspace.ensurePreview();
      $('effect-time').value = String(seconds);
      $('time-value').textContent = paused ? seconds.toFixed(2) + 's' : '实时';
      $('toggle-play').textContent = paused ? '播放' : '暂停';
      return true;
    },
    previewCharacterPose(id, seconds, draft) {
      if (
        !doc ||
        loading ||
        busy ||
        freeTransform ||
        applying ||
        (gesture && gesture.kind !== 'character')
      )
        return false;
      window.cardPreview.playAction(id, seconds, true, draft);
      draw();
      return true;
    },
    previewAction(id, seconds = 0, paused = false, draft = null) {
      if (!doc || loading || busy || gesture || freeTransform || applying)
        return false;
      this.activateRuntime();
      syncPreview();
      window.cardPreview.playAction(id, seconds, paused, draft);
      syncPreview();
      return true;
    },
    activateRuntime() {
      if (!doc || doc.previewMode === 'authored') return;
      mutate('启用统一 GLSL 运行时', () => (doc.previewMode = 'authored'));
      syncTextures();
    },
  };
  exposedcardEditorHost satisfies CharacterHost;
  exposedcardEditorHost satisfies WorkspaceHost;
  window.cardEditorHost = exposedcardEditorHost;
  const exposedcardAIHost = {
    captureChatComposition() {
      return compose();
    },
    captureCharacterMaster() {
      return importedCardSpatial.characterMaster(doc, active());
    },
    captureChatSource() {
      const l = active();
      if (l?.kind === 'text') return textRaster(l).toDataURL('image/png');
      const im = l ? images.get(l.id) : null;
      return im ? pngFromImage(im) : null;
    },
    async checkpoint() {
      const current = snapshot();
      return bridge.invoke(
        'production-checkpoint',
        workshop
          ? { workshop: await W.encode(W.commit(workshop, current)) }
          : { document: current },
      );
    },
    checkpointInfo() {
      return bridge.invoke('production-checkpoint-info', {
        id: workshop ? workshop.id : documentToken,
      });
    },
    async recoverCheckpoint() {
      if (loading || busy || gesture || freeTransform || applying)
        throw Error('请先结束当前操作');
      const binding = editorBinding(),
        id = workshop ? workshop.id : documentToken,
        result = await bridge.invoke('production-checkpoint-open', { id });
      if (
        binding.documentToken !== documentToken ||
        binding.revision !== revision
      )
        throw Error('工程已变化，请重新恢复');
      const before = snapshot(),
        beforeWorkshop = workshop ? structuredClone(workshop) : null;
      const recoveredWorkshop = result.workshop
        ? W.migrate(result.workshop)
        : null;
      const next = recoveredWorkshop
        ? W.resolve(recoveredWorkshop)
        : result.document;
      await loadDocument(next, false);
      workshop = recoveredWorkshop;
      revision = Math.max(revision, next.revision || 0);
      push(before, '恢复 AI 制作检查点', undefined, beforeWorkshop);
      updateWorkshopThumbnail();
      syncProperties();
      return result.checkpoint;
    },
    async cancelProduction() {
      if (applying) {
        taskToken++;
        await bridge.invoke('cancel');
      }
    },
    binding: editorBinding,
    applyCommands: applyEditorCommands,
    maskImages: () => (doc ? { ...doc.masks } : null),
    context() {
      if (!doc || editorClosed()) return null;
      const layer = active();
      const maskStats = maskStatistics();
      return {
        binding: editorBinding(),
        workspace: {
          view: document.querySelector<HTMLElement>('.view-stage').dataset.view,
          preview: window.cardPreview.getView(),
        },
        actions: doc.actions.map((a) => structuredClone(a)),
        workshop: workshop
          ? {
              editingAsset: workshop.editingAsset
                ? {
                    kind: workshop.editingAsset.kind,
                    name: doc.name,
                    resourceId: workshop.editingAsset.resourceId,
                    version: workshop.editingAsset.version,
                  }
                : null,
              name: workshop.name,
              activeCardId: workshop.activeCardId,
              cards: workshop.cards.map((c) => ({ id: c.id, name: c.name })),
              resources: workshop.resources.map((r) => ({
                id: r.id,
                kind: r.kind,
                name: r.name,
                versions: r.versions.map((v) => v.version),
              })),
            }
          : null,
        emitterSources: Object.fromEntries(
          ['card', 'frame', 'back'].map((k) => [
            k,
            importedCardComponents.source(
              window.cardEditorHost.emitterContext(),
              k,
            )?.emissionRegions || [],
          ]),
        ),
        document: {
          layerTree: structuredClone(folders.tree(doc)),
          name: doc.name,
          width: doc.width,
          height: doc.height,
          cosmetics: importedCardCosmetics.config(doc.cosmetics),
          frameStyle: importedCardFrame.resolve(doc),
          cardStats: importedCardStats.resolve(doc),
          locale: doc.locale,
          composition: doc.composition,
          armor: doc.armor,
          layers: doc.layers.map((l) => ({
            id: l.id,
            name: l.name,
            kind: l.kind,
            role: l.role,
            previewReference: l.previewReference,
            visible: l.visible,
            locked: l.locked,
            x: l.x,
            y: l.y,
            scale: l.scale,
            opacity: l.opacity,
            text: l.text,
            textStyle: l.textStyle,
            titleArt: l.titleArt
              ? {
                  variants: l.titleArt.variants.map((v) => ({
                    locale: v.locale,
                    text: v.text,
                    image: !!v.src,
                    style: v.style,
                  })),
                  sweep: l.titleArt.sweep,
                }
              : undefined,
            sourceWindow: l.sourceWindow,
            spatial: l.spatial,
            splitSourceId: l.splitSourceId,
            anatomy: l.anatomy,
            attachment: l.attachment,
            underpaint: l.underpaint
              ? {
                  jobId: l.underpaint.jobId,
                  filledPixels: l.underpaint.filledPixels,
                }
              : undefined,
            slotId: l.slotId,
          })),
          characterDepth: importedCardSpatial.depthAudit(doc),
          masks: Object.keys(doc.masks),
          maskStats,
          effects: doc.effects,
          material: importedCardComponents.materialContext(doc.material),
          particles: doc.particles,
          emissionRegions: doc.emissionRegions,
          spatial: doc.spatial,
          shader: doc.shader,
        },
        layer: { id: layer.id, name: layer.name, kind: layer.kind },
        selection: !!selection,
      };
    },
    invoke: (method, args = undefined) => bridge.invoke(method, args),
    say,
    async capture(mode) {
      if (!doc || loading || gesture || freeTransform || applying || busy)
        throw Error('请先结束当前笔划或变换');
      const layer = active(),
        im = images.get(layer.id);
      if (!im) throw Error('请选择图片图层；文字可以先转为图片');
      const source = pngFromImage(im),
        sourceWindow = layer.sourceWindow ? { ...layer.sourceWindow } : null,
        boundToken = documentToken,
        boundRevision = revision,
        wasPolygon = !!selectionMask;
      let mask = null;
      if (mode === 'inpaint' && selection && selectionLayer === layer.id) {
        let selectionImage = await localSelection();
        if (!wasPolygon && Number($('selection-feather').value) > 0)
          selectionImage = (
            await bridge.invoke('process', {
              op: 'feather',
              args: {
                image: selectionImage,
                radius: Number($('selection-feather').value),
              },
            })
          ).image;
        const local = await imageFrom(selectionImage);
        const c = canvasFor(im.naturalWidth, im.naturalHeight),
          cc = c.getContext('2d');
        cc.fillStyle = 'black';
        cc.fillRect(0, 0, c.width, c.height);
        const r = sourceWindow || {
          x: 0,
          y: 0,
          width: c.width,
          height: c.height,
        };
        cc.drawImage(local, r.x, r.y, r.width, r.height);
        mask = c.toDataURL('image/png');
      }
      if (
        boundToken !== documentToken ||
        boundRevision !== revision ||
        active().id !== layer.id
      )
        throw Error('准备期间工程已变化，请重新提交');
      return {
        source,
        mask,
        sourceWindow,
        characterContext: importedCardSpatial.imageContext(doc, layer),
        characterMaster: importedCardSpatial.characterMaster(doc, layer),
        layerId: layer.id,
        layerName: layer.name,
        documentToken: boundToken,
        revision: boundRevision,
        locked: layer.locked,
      };
    },
    async repair(job, selectionMask) {
      if (!selectionMask) throw Error('补全任务缺少区域 Mask');
      return applyProductionCommands(
        [
          {
            op: 'repairLayer',
            layerId: job.layerId,
            jobId: job.id,
            selectionMask,
            feather: 0,
            protectRigid: true,
          },
        ],
        undefined,
        'AI 补全后层缺口',
      );
    },
    async apply(job, src, asNew = false, fitExpanded = false) {
      const check = () => {
        if (job.documentToken !== documentToken)
          throw Error('这是另一个工程的候选图；请重新提交任务');
        if (gesture || freeTransform || applying || loading || busy)
          throw Error('请先结束当前操作');
        const l = doc.layers.find((l) => l.id === job.layerId);
        if (!asNew && (!l || l.locked || revision !== job.revision))
          throw Error('工程已变化或图层被锁定；请作为新图层加入，或重新提交');
        if (asNew && doc.layers.length >= 64) throw Error('图层已达 64 层上限');
        return l;
      };
      const bound = check();
      if (!asNew) {
        const current = pngFromImage(images.get(bound.id)),
          raw = Uint8Array.from(atob(current.split(',')[1]), (c) =>
            c.charCodeAt(0),
          ),
          digest = await crypto.subtle.digest('SHA-256', raw),
          fingerprint = [...new Uint8Array(digest)]
            .map((n) => n.toString(16).padStart(2, '0'))
            .join('');
        if (fingerprint !== job.sourceHash)
          throw Error('源图已变化，请作为新图层加入或重新提交');
      }
      const im = await imageFrom(src);
      check();
      const before = snapshot();
      let layer = doc.layers.find((l) => l.id === job.layerId);
      const originalWindow = job.sourceWindow || {
        x: 0,
        y: 0,
        width: job.width,
        height: job.height,
      };
      let sourceWindow =
        job.mode === 'outpaint'
          ? {
              ...originalWindow,
              x: originalWindow.x + job.padding[0],
              y: originalWindow.y + job.padding[1],
            }
          : job.sourceWindow || undefined;
      if (fitExpanded) sourceWindow = undefined;
      if (asNew) {
        const index = layer ? doc.layers.indexOf(layer) : 0,
          background =
            layer?.kind === 'background' ||
            layer?.role === 'background-candidate';
        layer = {
          id: 'ai-' + crypto.randomUUID(),
          name: (job.layerName || '素材') + ' / AI 候选',
          kind: 'image',
          role: background ? 'background-candidate' : 'ai-candidate',
          x: layer?.x || 0,
          y: layer?.y || 0,
          scale: layer?.scale || 1,
          opacity: 1,
          visible: true,
          locked: false,
        };
        doc.layers.splice(index, 0, layer);
      }
      Object.assign(layer, {
        src,
        sourceWindow,
        visible: true,
        aiProvenance: {
          jobId: job.id,
          adapter: job.adapter,
          model: job.model || '',
          reasoning: job.reasoning || '',
          sessionId: job.sessionId || null,
          operation: job.mode,
          prompt: job.prompt,
          sourceHash: job.sourceHash,
          createdAt: job.createdAt,
        },
      });
      if (layer.kind === 'foreground') layer.master = src;
      images.set(layer.id, im);
      selected = [layer.id];
      target = 'image';
      showMask = false;
      selection = null;
      selectionMask = null;
      selectionLayer = null;
      lassoPoints = [];
      syncTextures();
      push(
        before,
        asNew
          ? 'AI 结果加入新图层'
          : '应用 AI ' +
              {
                edit: '改图',
                inpaint: '局部重绘',
                outpaint: '扩图',
                generate: '生成素材',
              }[job.mode],
      );
      renderLayers();
      say(
        'AI 结果已应用，可撤销；人物材质 / 运动 Mask 保留，请检查新画面对应区域',
      );
    },
  };
  exposedcardAIHost satisfies AgentUIHost;
  window.cardAIHost = exposedcardAIHost;
  async function openHomeResult(result) {
    if (result.canceled) return false;
    const previous = {
      workshop,
      document: doc ? snapshot() : null,
      view: doc ? editorView() : null,
      revision,
      savedRevision,
      undo,
      redo,
    };
    workshop = result.workshop ? W.migrate(result.workshop) : null;
    try {
      await loadDocument(workshop ? W.resolve(workshop) : result.document);
      const activated = await bridge.invoke('home-activate', {
        ticket: result.ticket,
      });
      if (result.recovery) {
        revision = result.recovery.revision;
        savedRevision = result.recovery.savedRevision;
        doc.revision = revision;
        if (result.recovery.view) restoreEditorView(result.recovery.view);
      } else {
        setPreviewPose(0, 0);
        window.cardPreview.stopInspection?.();
      }
      recovery.activate(activated.sessionToken);
      notifyDirty();
      document.body.dataset.editorDocument = doc.name;
      document.body.dataset.editorCard =
        workshop?.activeCardId || documentToken;
      document.body.dataset.recovered = String(!!result.recovery);
      say(
        result.recovery
          ? '已恢复 ' +
              doc.name +
              (revision !== savedRevision ? ' · 含未保存修改' : '')
          : result.recoveryError
            ? '恢复副本读取失败，已打开保存版本：' + result.recoveryError
            : '已打开 ' + doc.name,
      );
      return true;
    } catch (e) {
      workshop = previous.workshop;
      if (previous.document) {
        await loadDocument(previous.document, false);
        revision = previous.revision;
        savedRevision = previous.savedRevision;
        undo = previous.undo;
        redo = previous.redo;
        if (previous.view) restoreEditorView(previous.view);
      } else {
        doc = null;
        images.clear();
        masks.clear();
      }
      throw e;
    }
  }
  function opened(explicit = true) {
    if (!doc) return;
    syncProperties();
    if (explicit && workshop)
      window.atelierWorkshopTabs?.explicitOpen(workshop.activeCardId);
    queueSession();
    console.log(
      'EDITOR_READY',
      JSON.stringify({
        version: appVersion,
        document: doc.name,
        desktop,
        layers: doc.layers.length,
        masks: masks.size,
        recovered: document.body.dataset.recovered === 'true',
        preview: canvas.dataset.target,
      }),
    );
  }
  async function boot() {
    try {
      const result = await bridge.invoke('home-bootstrap');
      desktop = result.desktop;
      appVersion = result.appVersion;
      if (appVersion) {
        document.title = `Cardscape ${appVersion} · Electron / Rust`;
        document
          .querySelectorAll<HTMLElement>('.editor-statusbar .version')
          .forEach((el) => (el.textContent = appVersion));
      }
      $('engine-label').textContent =
        `应用 ${result.appVersion || '旧版'} · Rust ${result.engine.version}`;
      $('engine-led').classList.add('ready');
      $('task-log').textContent = 'Rust 原生处理已连接';
      loading = false;
      window.atelierHome.ready(result);
      document.body.dataset.ready = 'true';
      document.body.dataset.engine = 'rust';
      console.log(
        'HOME_READY',
        JSON.stringify({
          version: result.appVersion,
          desktop,
          recent: result.entries.length,
          documentLoaded: false,
        }),
      );
    } catch (e) {
      loading = false;
      window.atelierHome.mode('home');
      window.atelierHome.error('初始化失败：' + e.message);
      $('engine-label').textContent = 'Rust 未就绪';
      console.error('EDITOR_ERROR', e.message);
    }
  }
  // View changes also survive refresh; continuously ticking animation is not an edit.
  for (const event of ['pointerup', 'change', 'wheel'] as const)
    document.addEventListener(event, queueSession, { passive: true });
  window.addEventListener('atelier-view-change', queueSession);
  window.addEventListener(
    'atelier-app-mode',
    (e: CustomEvent<{ mode: string }>) => {
      if (e.detail.mode === 'editor') queueSession();
    },
  );
  window.addEventListener('beforeunload', () => recovery.unload());
  boot();
  return {
    cardEditorHost: exposedcardEditorHost,
    cardAIHost: exposedcardAIHost,
  };
})();
