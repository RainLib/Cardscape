import { element } from '../core/dom.ts';
import type { PreviewControlBindings } from '../../shared/preview-controls';
import { createShowcase } from './card-showcase.ts';
function required<T>(value: T | null): T {
  if (value === null) throw Error('缺少预览控制条元素');
  return value;
}
/* Preview transport uses the same action and clock as the animation timeline. */
export const moduleApi = (() => {
  'use strict';
  const bindings = window as unknown as PreviewControlBindings;
  const $ = element,
    host = bindings.cardEditorHost,
    preview = bindings.cardPreview,
    panel = $('preview-panel');
  const player = document.createElement('div');
  player.id = 'preview-player';
  player.innerHTML = `<label class="preview-action-label">动作 <select id="preview-action" aria-label="3D 预览动作"></select></label><div class="preview-transport"><button id="preview-action-start" title="回到动作起点" aria-label="3D 动作回到起点">⏮</button><span id="preview-play-slot"></span><button id="preview-action-timeline" title="在底部时间轴编辑当前动作">时间轴</button><span id="preview-action-mode"></span></div>`;
  required(panel.querySelector('.preview-controls')).prepend(player);
  $('preview-play-slot').append($('toggle-play'));
  $('toggle-play').setAttribute('aria-label', '3D 播放或暂停当前动作');
  const zoom = document.createElement('div');
  zoom.id = 'preview-zoom-tools';
  zoom.innerHTML = `<button id="preview-zoom-out" aria-label="缩小 3D 预览">−</button><label><input id="preview-zoom" type="number" min="25" max="300" step="5" value="100" aria-label="3D 预览缩放百分比">%</label><button id="preview-zoom-in" aria-label="放大 3D 预览">＋</button><button id="preview-zoom-fit" title="恢复 100% 适应窗口">适应</button>`;
  required(panel.querySelector('.panel-heading')).after(zoom);
  const root = document.querySelector<HTMLElement>('#card-showcase');
  const showcase = root
    ? createShowcase(root, {
        preview,
        canvas: () => panel.querySelector('#author-model-canvas'),
        title: () => host.state().document?.name || 'Cardscape',
        identity: () => {
          const state = host.state();
          return state.documentToken + '/' + state.revision;
        },
        prepare: () => bindings.atelierWorkspace.ensurePreview(),
      })
    : undefined;
  let lastKey = '';
  function setZoom(value: number) {
    preview.setZoom(value);
    const percent = Math.round(preview.getZoom() * 100);
    element<HTMLInputElement>('preview-zoom').value = String(percent);
    zoom.dataset.zoom = String(preview.getZoom());
    try {
      localStorage.setItem('cardscape-preview-zoom', String(preview.getZoom()));
    } catch {}
  }
  function refresh(s = host.state()) {
    const d = s.document;
    showcase?.refresh(Boolean(d));
    if (!d) return;
    const a = bindings.atelierAnimation.context().action,
      key = JSON.stringify([
        s.documentToken,
        (d.actions || []).map((a) => [a.id, a.name]),
        a?.id,
      ]);
    if (key !== lastKey) {
      lastKey = key;
      element<HTMLSelectElement>('preview-action').replaceChildren(
        ...(d.actions || []).map((a) => new Option(a.name, a.id)),
      );
      element<HTMLSelectElement>('preview-action').value = a?.id || '';
    }
    for (const id of [
      'preview-action',
      'preview-action-start',
      'toggle-play',
      'preview-action-timeline',
      'effect-time',
      'effect-seconds',
    ] as const)
      element<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        id,
      ).disabled = !!s.busy || !a;
    sync();
  }
  function sync() {
    const a = bindings.atelierAnimation.context().action;
    if (!a) return;
    const seconds = bindings.atelierAnimation.context().seconds,
      playing = bindings.atelierAnimation.isPlaying();
    $('toggle-play').textContent = playing ? '暂停' : '播放';
    $('toggle-play').setAttribute('aria-pressed', String(playing));
    $('preview-action-mode').textContent = a.loop ? '循环' : '单次';
    for (const id of ['effect-time', 'effect-seconds'] as const)
      $(id).max = String(a.duration);
    $('effect-time').value = String(seconds);
    if (document.activeElement !== $('effect-seconds'))
      $('effect-seconds').value = seconds.toFixed(2);
    $('time-value').textContent = '/ ' + a.duration.toFixed(2) + ' s';
    player.dataset.action = a.id;
    player.dataset.seconds = seconds.toFixed(3);
    player.dataset.playing = String(playing);
    const expanded = bindings.atelierAnimation.isOpen();
    for (const id of [
      'rig-pose-timeline',
      'preview-action-timeline',
    ] as const) {
      const button = $(id);
      if (!button) continue;
      button.textContent = expanded ? '收起时间轴' : '时间轴';
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-controls', 'animation-timeline');
    }
  }
  element<HTMLSelectElement>('preview-action').onchange = () => {
    bindings.atelierWorkspace.selectAction(
      element<HTMLSelectElement>('preview-action').value,
    );
    bindings.atelierAnimation.seek(0);
    refresh();
  };
  $('preview-action-start').onclick = () => bindings.atelierAnimation.seek(0);
  $('preview-action-timeline').onclick = () =>
    bindings.atelierAnimation.isOpen()
      ? bindings.atelierAnimation.close()
      : bindings.atelierAnimation.open();
  required(required($('effect-time').closest('label')).firstChild).textContent =
    '动作 ';
  $('effect-time').setAttribute('aria-label', '3D 动作进度');
  $('effect-seconds').setAttribute('aria-label', '3D 动作时刻秒');
  $('preview-zoom-in').onclick = () => setZoom(preview.getZoom() * 1.2);
  $('preview-zoom-out').onclick = () => setZoom(preview.getZoom() / 1.2);
  $('preview-zoom-fit').onclick = () => setZoom(1);
  element<HTMLInputElement>('preview-zoom').onchange = () => {
    const v = Number(element<HTMLInputElement>('preview-zoom').value);
    setZoom(
      element<HTMLInputElement>('preview-zoom').value !== '' &&
        Number.isFinite(v)
        ? v / 100
        : preview.getZoom(),
    );
  };
  element<HTMLInputElement>('preview-zoom').oninput = () => {
    const e = element<HTMLInputElement>('preview-zoom'),
      v = Number(e.value);
    if (e.value !== '' && v >= 25 && v <= 300) setZoom(v / 100);
  };
  for (const canvas of panel.querySelectorAll('canvas')) {
    canvas.title =
      '滚轮缩放 · 拖动查看视差 · Alt 拖动自由旋转 · 空格播放 / 暂停';
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta =
          e.deltaY *
          (e.deltaMode === 1
            ? 16
            : e.deltaMode === 2
              ? canvas.clientHeight
              : 1);
        setZoom(preview.getZoom() * Math.exp(-delta * 0.0015));
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      if (
        e.code === 'Space' &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        bindings.atelierAnimation.play();
      }
    });
  }
  const exposedatelierPreviewPlayer = { refresh, sync };
  bindings.atelierPreviewPlayer = exposedatelierPreviewPlayer;
  window.addEventListener('atelier-preview-frame', sync);
  let initial = 1;
  try {
    initial = Number(localStorage.getItem('cardscape-preview-zoom')) || 1;
  } catch {}
  setZoom(initial);
  refresh();
  return { atelierPreviewPlayer: exposedatelierPreviewPlayer };
})();
