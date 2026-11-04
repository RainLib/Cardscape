import { createActionAudioEditor } from './action-audio-editor.ts';
import { element } from '../core/dom.ts';
import { createActionParticleEditor } from './action-particle-editor.ts';
import type { CharacterAction, Ease } from '../../shared/character';
import type { CardDocument } from '../../shared/document';
import type { CharacterPanelState } from '../../shared/character-editor';
import type { CharacterPanelBindings } from '../../shared/character-panels';
import type { EditorElements } from '../../types/editor-elements';
import type { CharacterPanelElements } from '../../shared/character-elements';
import type { RuntimeTrackSpec, PreviewFrame } from '../../shared/runtime';
type TimelineElements = EditorElements & CharacterPanelElements;
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('当前动画目标已变化');
  return value;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function previewFrame(value: unknown): PreviewFrame | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    typeof v.paused !== 'boolean' ||
    typeof v.activeAction !== 'boolean' ||
    typeof v.seconds !== 'number' ||
    !Number.isFinite(v.seconds) ||
    typeof v.duration !== 'number' ||
    !Number.isFinite(v.duration) ||
    (v.effectSeconds !== undefined &&
      (typeof v.effectSeconds !== 'number' ||
        !Number.isFinite(v.effectSeconds)))
  )
    return null;
  return {
    id: v.id,
    paused: v.paused,
    activeAction: v.activeAction,
    seconds: v.seconds,
    duration: v.duration,
    effectSeconds:
      typeof v.effectSeconds === 'number' ? v.effectSeconds : undefined,
  };
}
import type { CharacterAnimationPort } from '../../shared/character-panels';
import type { WeightAnimationPort } from '../../shared/character-editor';
import importedCardRuntime from '../rendering/runtime-core.ts';
import importedCardAnimationAuthoring from './animation-authoring-model.ts';
import importedCardCharacterAnimation from '../character/character-animation-model.ts';
import importedCardShortcuts from '../editing/shortcuts.ts';
/* Action authoring uses the same sampler as the portable GPU player. */
export const moduleApi = (() => {
  'use strict';
  const bindings = window as unknown as CharacterPanelBindings & {
    atelierPreviewPlayer?: { sync(): void };
    atelierPreviewTools: { open(kind: 'inspection'): void };
  };
  const $ = <K extends keyof TimelineElements>(id: K): TimelineElements[K] =>
      element<TimelineElements[K]>(id),
    host = bindings.cardEditorHost,
    runtime = importedCardRuntime,
    workspace = bindings.atelierWorkspace,
    model = importedCardAnimationAuthoring,
    rig = importedCardCharacterAnimation;
  let boneId = '',
    controlType: 'bone' | 'ik' | 'expression' = 'bone';
  const controlField = () =>
    controlType === 'bone'
      ? 'boneTracks'
      : controlType === 'ik'
        ? 'ikTracks'
        : 'expressionTracks';
  const targets = (d: CardDocument) =>
    controlType === 'bone'
      ? d.characterRig?.bones
      : controlType === 'ik'
        ? d.characterRig?.constraints
        : d.characterRig?.expressions;
  let state: CharacterPanelState = {
      document: null,
      documentToken: '',
      revision: 0,
      busy: false,
    },
    actionId = 'idle',
    seconds = 0,
    track = 'motion',
    valueDraft = false,
    opened = false,
    renderKey = '',
    playing = false,
    trackGroup: 'effects' | 'whole' | 'all' = 'effects',
    draftAction: CharacterAction | null = null,
    fps = 30;
  try {
    fps = Number(localStorage.getItem('atelier-animation-fps')) || 30;
  } catch {}
  if (![24, 30, 60].includes(fps)) fps = 30;
  const selectedAction = () =>
    state.document?.actions?.find((a) => a.id === actionId) || null;
  const currentAction = () => required(selectedAction());
  const particleEditor = createActionParticleEditor(
    {
      current: () => ({
        document: state.document,
        action: selectedAction(),
        seconds,
        busy: !!state.busy,
      }),
      mutate: (label, change) => mutate(label, change),
      say: (message) => status(message, true),
    },
    document,
  );
  $('timeline-status').before(particleEditor.element);
  const audioEditor = createActionAudioEditor(
    {
      current: () => ({
        document: state.document,
        action: selectedAction(),
        seconds,
        busy: !!state.busy,
      }),
      mutate: (label, change) => mutate(label, change),
      say: (message) => status(message, true),
    },
    document,
  );
  $('timeline-status').before(audioEditor.element);
  const compositionControls = document.createElement('details');
  compositionControls.id = 'timeline-composition';
  const compositionSummary = document.createElement('summary');
  compositionSummary.textContent = '动画层序与切入过渡';
  compositionControls.append(compositionSummary);
  const fadeLabel = document.createElement('label'),
    fadeInput = document.createElement('input');
  fadeLabel.textContent = '切入过渡（秒）';
  fadeInput.type = 'number';
  fadeInput.min = '0';
  fadeInput.max = '2';
  fadeInput.step = '.05';
  fadeInput.setAttribute('aria-label', '动作切入过渡秒数');
  fadeLabel.append(fadeInput);
  const frontButton = document.createElement('button'),
    backButton = document.createElement('button'),
    orderReset = document.createElement('button'),
    orderDelete = document.createElement('button'),
    orderNote = document.createElement('p');
  frontButton.textContent = '选中图层移到最前';
  backButton.textContent = '选中图层移到最后';
  orderReset.textContent = '记录初始层序';
  orderDelete.textContent = '删除当前层序帧';
  for (const button of [frontButton, backButton, orderReset, orderDelete])
    button.type = 'button';
  compositionControls.append(
    fadeLabel,
    frontButton,
    backButton,
    orderReset,
    orderDelete,
    orderNote,
  );
  $('timeline-status').before(compositionControls);
  fadeInput.onchange = () => {
    if (fadeInput.value !== '' && fadeInput.validity.valid)
      mutate('设置动作切入过渡', (_d, a) => {
        a.transitionDuration = Number(fadeInput.value);
      });
  };
  function recordOrder(front: boolean) {
    const layer = state.layer;
    if (!layer || layer.locked)
      return status('先选择并解锁要调整遮挡的图层', true);
    mutate('记录动画层序', (d, a) => {
      const layers = runtime
        .orderedLayers([...d.layers].reverse(), a, progress())
        .filter(
          (l) =>
            l.kind !== 'frame' &&
            l.kind !== 'background' &&
            !['far', 'mid', 'near'].includes(l.spatial?.role || '') &&
            !['baseplate', 'background-candidate'].includes(l.role || ''),
        );
      if (!layers.some((l) => l.id === layer.id))
        throw Error('背景与卡框不参与人物层序动画');
      const ids = layers.filter((l) => l.id !== layer.id).map((l) => l.id);
      if (front) ids.push(layer.id);
      else ids.unshift(layer.id);
      const at = +progress().toFixed(6);
      a.drawOrder = (a.drawOrder || []).filter(
        (f) => Math.abs(f.at - at) > 0.000001,
      );
      a.drawOrder.push({ at, layers: ids });
      a.drawOrder.sort((a, b) => a.at - b.at);
    });
  }
  frontButton.onclick = () => recordOrder(true);
  backButton.onclick = () => recordOrder(false);
  orderReset.onclick = () =>
    mutate('记录初始层序', (_d, a) => {
      const at = +progress().toFixed(6);
      a.drawOrder = (a.drawOrder || []).filter(
        (f) => Math.abs(f.at - at) > 0.000001,
      );
      a.drawOrder.push({ at, layers: [] });
      a.drawOrder.sort((a, b) => a.at - b.at);
    });
  orderDelete.onclick = () =>
    mutate('删除动画层序帧', (_d, a) => {
      a.drawOrder = (a.drawOrder || []).filter(
        (f) => Math.abs(f.at - progress()) > 0.000001,
      );
      if (!a.drawOrder.length) delete a.drawOrder;
    });
  const documentState = () => required(state.document);
  const progress = () =>
    Math.min(1, seconds / (selectedAction()?.duration || 1));
  const specs = (): Record<string, RuntimeTrackSpec> =>
    boneId
      ? controlType === 'bone'
        ? rig.tracks
        : controlType === 'ik'
          ? rig.advanced.ikTracks
          : rig.advanced.expressionTracks
      : runtime.animationTracks;
  const clip = (): CharacterAction | null => {
    const action = selectedAction();
    if (!action) return null;
    return boneId
      ? { ...action, tracks: action[controlField()]?.[boneId] }
      : action;
  };
  const currentClip = () => required(clip());
  const frameAt = () =>
    clip()?.tracks?.[track]?.find((f) => Math.abs(f.at - progress()) < 0.0001);
  const draftFor = (a: CharacterAction, value: number, ease: Ease) =>
    boneId
      ? controlType === 'bone'
        ? rig.keyframe(a, boneId, track, seconds, value, ease)
        : rig.controlKeyframe(
            documentState(),
            a,
            controlType,
            boneId,
            track,
            seconds,
            value,
            ease,
          )
      : model.draft(a, track, seconds, value, ease);
  function assignTracks(a: CharacterAction, next: CharacterAction) {
    if (boneId) {
      a[controlField()] ||= {};
      a[controlField()]![boneId] = next.tracks || {};
    } else a.tracks = next.tracks;
  }
  const numeric = (value: object, key: string): number => {
    const field: unknown = Reflect.get(value, key);
    if (typeof field !== 'number' || !Number.isFinite(field))
      throw Error('动画轨道值无效');
    return field;
  };
  const sampleRuntime = () => {
    const value = runtime.action(
      draftAction ? { actions: [draftAction] } : documentState(),
      actionId,
      seconds,
      { seek: true },
    );
    return {
      ...value,
      yaw: (value.rotation * 180) / Math.PI,
      pitch: (value.pitch * 180) / Math.PI,
    };
  };
  const sample = () => {
    if (boneId)
      return controlType === 'bone'
        ? rig.local(
            draftAction ||
              bindings.atelierCharacterRig?.draftAction() ||
              currentAction(),
            boneId,
            progress(),
          )
        : rig.control(
            documentState(),
            draftAction ||
              bindings.atelierCharacterRig?.draftAction() ||
              currentAction(),
            controlType,
            boneId,
            progress(),
          );
    return sampleRuntime();
  };
  function status(text: string, error = false) {
    $('timeline-status').textContent = error ? text : '';
    $('timeline-status').classList.toggle('timeline-status-error', error);
    $('timeline-status').hidden = !error;
    $('timeline-record').title = error ? '' : text;
  }
  function updateTime() {
    particleEditor.refresh();
    audioEditor.refresh();
    const a = selectedAction();
    for (const control of [
      fadeInput,
      frontButton,
      backButton,
      orderReset,
      orderDelete,
    ])
      control.disabled = !!state.busy || !a;
    if (a && document.activeElement !== fadeInput)
      fadeInput.value = String(a.transitionDuration || 0);
    orderNote.textContent = a
      ? '层序帧：' +
        (a.drawOrder || [])
          .map((f) => (f.at * a.duration).toFixed(2) + 's')
          .join(' / ')
      : '';
    if (!a) return;
    bindings.atelierPreviewPlayer?.sync();
    $('timeline-frame-number').textContent =
      '帧 ' + Math.round(seconds * fps) + ' / ' + Math.round(a.duration * fps);
    seconds = Math.max(0, Math.min(a.duration, seconds));
    $('timeline-time').max = String(a.duration);
    $('timeline-time').value = String(seconds);
    $('timeline-seconds').max = String(a.duration);
    if (document.activeElement !== $('timeline-seconds'))
      $('timeline-seconds').value = String(+seconds.toFixed(3));
    $('timeline-duration').textContent = '/ ' + a.duration + ' s';
    $('timeline-end').textContent = a.duration + ' s';
    $('timeline-tracks').style.setProperty(
      '--playhead',
      progress() * 100 + '%',
    );
    $('timeline-play').textContent = playing ? '暂停动作' : '播放动作';
    if ($('rig-pose-play'))
      $('rig-pose-play').textContent = playing ? '暂停' : '播放';
    const spec = specs()[track];
    $('timeline-value').min = String(spec.min);
    $('timeline-value').max = String(spec.max);
    $('timeline-value').step = String(spec.step);
    if (!valueDraft && document.activeElement !== $('timeline-value'))
      $('timeline-value').value = String(+numeric(sample(), track).toFixed(3));
    if (document.activeElement !== $('timeline-ease'))
      $('timeline-ease').value = String(frameAt()?.ease || 'linear');
    $('timeline-delete').disabled = !!state.busy || !frameAt();
    $('timeline-clear').disabled =
      !!state.busy || !clip()?.tracks?.[track]?.length;
    $('timeline-discard').hidden = !valueDraft;
    $('timeline-discard').disabled = !!state.busy;
    $('timeline-action-delete').disabled =
      !!state.busy || (state.document?.actions?.length || 0) <= 1;
    $('timeline-record').disabled =
      !!state.busy ||
      ((clip()?.tracks?.[track]?.length || 0) >= 64 && !frameAt());
    feedback();
    for (const b of $('timeline-tracks').querySelectorAll<HTMLButtonElement>(
      '[data-key-at]',
    ))
      b.classList.toggle(
        'selected',
        b.dataset.track === track &&
          Math.abs(Number(b.dataset.keyAt) - progress()) < 0.0001,
      );
  }
  function renderTracks() {
    const a = selectedAction();
    if (!a) return;
    const key = JSON.stringify([
      a.id,
      clip()?.tracks,
      a.duration,
      track,
      trackGroup,
      boneId,
    ]);
    if (key === renderKey) return;
    renderKey = key;
    $('timeline-tracks').replaceChildren();
    for (const [id, spec] of Object.entries(specs())) {
      if (!boneId && trackGroup !== 'all' && model.group(id) !== trackGroup)
        continue;
      const row = document.createElement('div');
      row.className = 'timeline-track-row' + (track === id ? ' active' : '');
      row.dataset.track = id;
      const label = document.createElement('button');
      label.textContent = spec.name;
      label.title = '选择 ' + spec.name + ' 轨道';
      label.dataset.trackLabel = id;
      label.onclick = () => {
        chooseTrack(id);
        required(
          $('timeline-tracks').querySelector<HTMLButtonElement>(
            '[data-track-label="' + id + '"]',
          ),
        ).focus({ preventScroll: true });
      };
      const lane = document.createElement('div');
      lane.className = 'timeline-track-lane';
      lane.setAttribute('aria-label', spec.name + ' 时间位置');
      lane.onclick = (e) => {
        if (e.target !== lane) return;
        chooseTrack(id);
        const rect = lane.getBoundingClientRect();
        seek(((e.clientX - rect.left) / rect.width) * a.duration);
      };
      const frames = clip()?.tracks?.[id];
      if (!frames?.length) {
        const note = document.createElement('span');
        note.className = 'timeline-track-empty';
        note.textContent = '无关键帧';
        note.title = '当前使用动作预设，尚未添加自定义关键帧';
        lane.append(note);
      }
      for (const f of frames || []) {
        const button = document.createElement('button');
        button.className = 'timeline-key';
        button.textContent = '◆';
        button.dataset.keyAt = String(f.at);
        button.dataset.track = id;
        button.style.left = f.at * 100 + '%';
        button.setAttribute(
          'aria-label',
          spec.name +
            ' 关键帧 ' +
            (f.at * a.duration).toFixed(3) +
            ' 秒，值 ' +
            +f.value.toFixed(3),
        );
        button.title =
          (f.at * a.duration).toFixed(3) +
          ' s · ' +
          f.value +
          spec.unit +
          ' · ' +
          { linear: '线性', smooth: '平滑', hold: '保持' }[f.ease || 'linear'];
        button.onclick = (e) => {
          e.stopPropagation();
          chooseTrack(id);
          seek(f.at * a.duration);
          required(
            $('timeline-tracks').querySelector<HTMLButtonElement>(
              '[data-track="' + id + '"][data-key-at="' + f.at + '"]',
            ),
          ).focus({ preventScroll: true });
        };
        lane.append(button);
      }
      row.append(label, lane);
      if (frames?.length) {
        const clear = document.createElement('button');
        clear.className = 'timeline-track-clear';
        clear.textContent = '×';
        clear.title = '清除 ' + spec.name + ' 轨道全部关键帧，可撤销';
        clear.setAttribute('aria-label', '清除 ' + spec.name + ' 轨道');
        clear.onclick = () => {
          chooseTrack(id);
          clearTrack();
          required(
            $('timeline-tracks').querySelector<HTMLButtonElement>(
              '[data-track-label="' + id + '"]',
            ),
          ).focus({ preventScroll: true });
        };
        row.append(clear);
      }
      $('timeline-tracks').append(row);
    }
  }
  function chooseTrack(id: string, preservePose = false) {
    if (!preservePose) bindings.atelierCharacterRig?.resetPose(false);
    track = id;
    draftAction = null;
    valueDraft = false;
    if (!boneId && trackGroup !== 'all' && model.group(id) !== trackGroup) {
      trackGroup = model.group(id);
      $('timeline-group').value = String(trackGroup);
    }
    $('timeline-track').value = String(id);
    renderTracks();
    if (opened)
      host.previewAction(
        actionId,
        seconds,
        true,
        preservePose ? bindings.atelierCharacterRig?.draftAction() : null,
      );
    updateTime();
  }
  function refresh(
    next: CharacterPanelState,
    id: string = actionId,
    changed = false,
  ) {
    state = next;
    if (!next.document) return;
    bindings.atelierCharacterRig?.refresh();
    bindings.atelierCharacterAdvanced?.refresh();
    if (boneId && !targets(next.document)?.some((b) => b.id === boneId)) {
      boneId = '';
      track = 'motion';
      renderKey = '';
    }
    const targetSelect = $('timeline-target');
    targetSelect.replaceChildren(new Option('整卡与局部效果', ''));
    for (const b of next.document.characterRig?.bones || [])
      targetSelect.add(new Option('关节 · ' + b.name, b.id));
    for (const c of next.document.characterRig?.constraints || [])
      targetSelect.add(new Option('IK · ' + c.name, 'ik:' + c.id));
    for (const e of next.document.characterRig?.expressions || [])
      targetSelect.add(new Option('表情 · ' + e.name, 'expression:' + e.id));
    targetSelect.value = boneId
      ? controlType === 'bone'
        ? boneId
        : controlType + ':' + boneId
      : '';
    const switchAction = actionId !== id;
    actionId = id;
    if (changed || switchAction) {
      seconds = 0;
      playing = false;
      valueDraft = false;
      draftAction = null;
      renderKey = '';
      if (switchAction || changed) {
        trackGroup = ['enter', 'exit', 'flip'].includes(
          selectedAction()?.event || '',
        )
          ? 'whole'
          : 'effects';
        track =
          trackGroup === 'whole'
            ? selectedAction()?.event === 'flip'
              ? 'yaw'
              : Object.keys(selectedAction()?.tracks || {}).find(
                  (k) => model.group(k) === 'whole',
                ) || 'x'
            : 'motion';
        $('timeline-group').value = String(trackGroup);
        $('timeline-track').value = String(track);
      }
    }
    if (boneId) {
      trackGroup = 'all';
      $('timeline-group').value = 'all';
      if (!specs()[track])
        track =
          controlType === 'bone'
            ? 'rotation'
            : controlType === 'ik'
              ? 'x'
              : 'value';
    }
    $('timeline-group').disabled = !!next.busy || !!boneId;
    $('timeline-target').disabled = !!next.busy;
    $('timeline-track').replaceChildren();
    for (const [id, spec] of Object.entries(specs()))
      $('timeline-track').add(new Option(spec.name, id));
    $('timeline-track').value = String(track);
    const a = selectedAction();
    if (!a) {
      playing = false;
      draftAction = null;
      valueDraft = false;
      renderKey = '';
      for (const id of [
        'timeline-action',
        'timeline-play',
        'timeline-start',
        'timeline-prev',
        'timeline-next',
        'timeline-seconds',
        'timeline-time',
        'timeline-track',
        'timeline-value',
        'timeline-ease',
        'timeline-record',
        'timeline-prev-key',
        'timeline-next-key',
        'timeline-fps',
        'timeline-delete',
        'timeline-clear',
        'timeline-discard',
        'timeline-action-delete',
      ] as const)
        $(id).disabled = true;
      $('timeline-tracks').replaceChildren();
      host.setAnimationFeedback(null);
      return;
    }
    const list = $('timeline-action');
    list.replaceChildren();
    for (const action of next.document.actions || [])
      list.add(new Option(action.name, action.id));
    list.value = actionId;
    for (const id of [
      'timeline-action',
      'timeline-play',
      'timeline-start',
      'timeline-prev',
      'timeline-next',
      'timeline-seconds',
      'timeline-time',
      'timeline-track',
      'timeline-value',
      'timeline-ease',
      'timeline-record',
      'timeline-prev-key',
      'timeline-next-key',
      'timeline-fps',
    ] as const)
      $(id).disabled = !!next.busy;
    $('timeline-record').disabled =
      !!next.busy ||
      ((clip()?.tracks?.[track]?.length || 0) >= 64 && !frameAt());
    renderTracks();
    updateTime();
  }
  function open(showPanel = true) {
    opened = true;
    $('animation-timeline').hidden = false;
    $('animation-open').classList.add('active');
    $('animation-open').setAttribute('aria-expanded', 'true');
    $('workspace-mode').value = 'animate';
    document.body.classList.remove('panels-hidden');
    workspace.ensurePreview();
    if (showPanel) {
      document.body.classList.remove('dock-collapsed');
      workspace.panel('motion');
      workspace.syncLayout();
    }
    refresh(host.state(), $('action-list').value || actionId);
    const pose = bindings.atelierCharacterRig?.draftAction();
    if (pose) {
      playing = false;
      host.previewAction(actionId, seconds, true, pose);
      updateTime();
    } else if (playing) updateTime();
    else seek(seconds);
    requestAnimationFrame(() => host.fit());
  }
  function close() {
    const discard =
      !!draftAction || !!bindings.atelierCharacterRig?.draftAction();
    bindings.atelierCharacterRig?.resetPose(false);
    opened = false;
    draftAction = null;
    if (discard) {
      playing = false;
      host.previewAction(actionId, seconds, true);
    }
    host.setAnimationFeedback(null);
    $('animation-canvas-feedback').hidden = true;
    $('animation-timeline').hidden = true;
    $('animation-open').classList.remove('active');
    $('animation-open').setAttribute('aria-expanded', 'false');
    $('workspace-mode').value = 'compose';
    bindings.atelierPreviewPlayer?.sync();
    requestAnimationFrame(() => host.fit());
  }
  function seek(value: number) {
    const a = selectedAction();
    if (!a || state.busy || !Number.isFinite(value)) return;
    bindings.atelierCharacterRig?.resetPose(false);
    workspace.enableEffectsPreview();
    seconds = Math.max(0, Math.min(a.duration, value));
    valueDraft = false;
    draftAction = null;
    playing = false;
    if (!host.previewAction(actionId, seconds, true)) return;
    updateTime();
    status(a.name + ' · ' + seconds.toFixed(3) + ' s · 已暂停，可记录关键帧');
  }
  function pause() {
    if (!playing) return;
    playing = false;
    host.previewAction(actionId, seconds, true, draftAction);
    updateTime();
  }
  function play() {
    const a = selectedAction();
    if (!a || state.busy) return;
    if (playing) {
      pause();
      return;
    }
    bindings.atelierCharacterRig?.resetPose(false);
    bindings.atelierCharacterAdvanced?.stopTest();
    const start = seconds >= a.duration ? 0 : seconds;
    workspace.enableEffectsPreview();
    seconds = start;
    valueDraft = false;
    if (!host.previewAction(actionId, seconds, false, draftAction)) return;
    playing = true;
    updateTime();
    status('播放 ' + a.name + ' · ' + (a.loop ? '循环' : '一次'));
  }
  function mutate(
    label: string,
    fn: (doc: CardDocument, action: CharacterAction) => void,
  ) {
    try {
      const changed = host.mutate(label, (d) => {
        d.previewMode = 'authored';
        fn(d, required(d.actions?.find((a) => a.id === actionId)));
      });
      if (changed) {
        valueDraft = false;
        draftAction = null;
        renderKey = '';
        refresh(host.state(), actionId);
        seek(seconds);
      }
      return changed;
    } catch (e) {
      status(message(e), true);
      return false;
    }
  }
  $('animation-open').onclick = () => (opened ? close() : open());
  $('timeline-close').onclick = close;
  $('timeline-inspect').onclick = () => {
    bindings.atelierWorkspace.ensurePreview();
    bindings.atelierPreviewTools.open('inspection');
    $('inspection-start').focus();
  };
  $('motion-timeline-open').onclick = () => open();
  $('motion-mask-open').onclick = () => {
    $('mask-panel-open').click();
    host.chooseMask('motion');
  };
  $('timeline-action').onchange = () => {
    workspace.selectAction($('timeline-action').value);
    seek(0);
  };
  $('timeline-track').onchange = () => chooseTrack($('timeline-track').value);
  $('timeline-time').oninput = () => seek(Number($('timeline-time').value));
  $('timeline-seconds').oninput = $('timeline-seconds').onchange = () => {
    const el = $('timeline-seconds');
    if (el.value !== '' && el.validity.valid) seek(Number(el.value));
    else updateTime();
  };
  $('timeline-play').onclick = play;
  $('timeline-start').onclick = () => seek(0);
  $('timeline-prev').onclick = () =>
    seek(model.step(seconds, -1, currentAction().duration, fps));
  $('timeline-next').onclick = () =>
    seek(model.step(seconds, 1, currentAction().duration, fps));
  $('timeline-prev-key').onclick = () =>
    seek(model.adjacent(currentClip(), track, seconds, -1));
  $('timeline-next-key').onclick = () =>
    seek(model.adjacent(currentClip(), track, seconds, 1));
  $('timeline-fps').value = String(fps);
  $('timeline-fps').onchange = () => {
    fps = Number($('timeline-fps').value);
    localStorage.setItem('atelier-animation-fps', String(fps));
    updateTime();
  };
  $('timeline-group').onchange = () => {
    const value = $('timeline-group').value;
    trackGroup = value === 'whole' || value === 'all' ? value : 'effects';
    if (trackGroup !== 'all' && model.group(track) !== trackGroup)
      chooseTrack(model[trackGroup][0]);
    renderKey = '';
    renderTracks();
    updateTime();
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    '[data-time-preset]',
  ))
    b.onclick = () =>
      seek(Number(b.dataset.timePreset) * currentAction().duration);
  $('timeline-locate').onchange = feedback;
  $('timeline-value').onfocus = $('timeline-ease').onfocus = () => {
    if (playing) pause();
  };
  $('timeline-value').oninput = previewValue;
  $('timeline-ease').onchange = previewValue;
  const easeValue = (): Ease => {
    const value = $('timeline-ease').value;
    return value === 'smooth' || value === 'hold' ? value : 'linear';
  };
  function previewValue() {
    const el = $('timeline-value');
    if (!el.validity.valid || el.value === '') return;
    try {
      bindings.atelierCharacterRig?.resetPose(false);
      valueDraft = true;
      playing = false;
      draftAction = draftFor(currentAction(), Number(el.value), easeValue());
      host.previewAction(actionId, seconds, true, draftAction);
      updateTime();
    } catch (e) {
      status(message(e), true);
    }
  }
  function feedback() {
    if (!opened || !state?.document) return;
    const runtimeValue = boneId ? null : sampleRuntime(),
      target = boneId
        ? {
            name:
              targets(state.document)?.find((b) => b.id === boneId)?.name ||
              '人物控制',
            scope: 'bone' as const,
          }
        : model.target(state.document, state.layer, track),
      v = runtimeValue || sample(),
      spec = specs()[track],
      draft = !!draftAction || !!bindings.atelierCharacterRig?.draftAction();
    host.setAnimationFeedback(
      target.scope === 'bone'
        ? null
        : {
            ...target,
            track,
            sample: required(runtimeValue),
            draft,
            locate: $('timeline-locate').checked,
          },
    );
    const badge = $('animation-canvas-feedback');
    badge.hidden = false;
    badge.textContent =
      target.name +
      ' · ' +
      spec.name +
      ' ' +
      +numeric(v, track).toFixed(3) +
      spec.unit +
      (draft ? ' · 未记录' : '');
    badge.dataset.scope = target.scope;
    badge.title =
      '修改值即时预览；点击记录关键帧才写入动作。整卡轮廓或彩色区域对应当前轨道。';
  }

  $('timeline-record').onclick = () => {
    const el = $('timeline-value'),
      spec = specs()[track];
    if (!el.value || !el.validity.valid) return;
    try {
      const next = draftFor(currentAction(), Number(el.value), easeValue());
      if (
        mutate('记录 ' + spec.name + ' 关键帧', (d, a) =>
          Object.assign(a, next),
        )
      )
        status('已记录关键帧 · 可撤销');
    } catch (e) {
      status(message(e), true);
    }
  };
  function focusTrack() {
    required(
      $('timeline-tracks').querySelector<HTMLButtonElement>(
        '[data-track-label="' + track + '"]',
      ),
    ).focus({ preventScroll: true });
  }
  function deleteFrame() {
    if (state.busy || !frameAt()) return;
    const next = model.removeFrame(currentClip(), track, seconds);
    if (
      next &&
      mutate('删除 ' + specs()[track].name + ' 关键帧（可撤销）', (d, a) =>
        assignTracks(a, next),
      )
    ) {
      focusTrack();
      host.say('关键帧已删除 · ⌘/Ctrl Z 撤销');
    }
  }
  function clearTrack() {
    if (state.busy || !selectedAction()) return;
    const next = model.clearTrack(currentClip(), track);
    if (
      next &&
      mutate('清除 ' + specs()[track].name + ' 轨道（可撤销）', (d, a) =>
        assignTracks(a, next),
      )
    ) {
      focusTrack();
      host.say('已清除当前轨道关键帧，恢复动作预设 · 可撤销');
    }
  }
  $('timeline-delete').onclick = deleteFrame;
  $('timeline-clear').onclick = clearTrack;
  $('timeline-discard').onclick = () => {
    seek(seconds);
    $('timeline-value').focus();
  };
  $('timeline-action-delete').onclick = () => {
    $('action-delete').click();
    $('timeline-action').focus();
  };
  function preset(kind: 'cape' | 'glow') {
    if (!state?.document || (state.document?.actions?.length || 0) >= 24)
      return;
    const id = 'action-' + crypto.randomUUID(),
      cape = kind === 'cape';
    try {
      const changed = host.mutate(
        cape ? '制作披风循环动作' : '制作武器脉冲动作',
        (d) => {
          d.previewMode = 'authored';
          (d.actions ||= []).push({
            id,
            name: cape ? '披风循环' : '武器脉冲',
            event: cape ? 'idle' : 'trigger',
            duration: cape ? 4 : 1.8,
            loop: cape,
            motion: 1,
            emission: 1,
            bend: 0,
            tracks: cape
              ? {
                  motion: [
                    { at: 0, value: 0.6, ease: 'smooth' },
                    { at: 0.5, value: 1.6, ease: 'smooth' },
                    { at: 1, value: 0.6, ease: 'smooth' },
                  ],
                }
              : {
                  emission: [
                    { at: 0, value: 1, ease: 'smooth' },
                    { at: 0.35, value: 3, ease: 'smooth' },
                    { at: 0.7, value: 1, ease: 'smooth' },
                    { at: 1, value: 1, ease: 'smooth' },
                  ],
                },
          });
        },
      );
      if (!changed) return;
      workspace.selectAction(id);
      chooseTrack(cape ? 'motion' : 'emission');
      open();
      seek(0);
      status(
        '已创建 ' + currentAction().name + '，点击 ◆ 编辑对应时刻，可撤销',
      );
    } catch (e) {
      status(message(e), true);
    }
  }
  $('motion-cape-preset').onclick = () => preset('cape');
  $('motion-glow-preset').onclick = () => preset('glow');
  $('motion-entry-preset').onclick = () => {
    try {
      const id = 'action-' + crypto.randomUUID();
      if (
        host.mutate('创建整卡进场', (d) => {
          if ((d.actions?.length || 0) >= 24) throw Error('动作已达上限');
          d.previewMode = 'authored';
          (d.actions ||= []).push(
            runtime.entryPreset($('entry-direction').value, id),
          );
        })
      ) {
        workspace.selectAction(id);
        chooseTrack(
          ['left', 'right'].includes($('entry-direction').value) ? 'x' : 'y',
        );
        open();
        seek(0);
        status('整卡根节点进场 · 编辑位移、缩放和透明度轨道');
      }
    } catch (e) {
      status(message(e), true);
    }
  };
  window.addEventListener('atelier-preview-frame', (e) => {
    const detail = previewFrame(e instanceof CustomEvent ? e.detail : null);
    if (!detail) return;
    $('toggle-play').textContent = detail.paused ? '播放' : '暂停';
    const previewSeconds = detail.activeAction
      ? detail.seconds
      : (detail.effectSeconds ?? 0);
    $('effect-time').value = String(Math.min(30, previewSeconds));
    if (document.activeElement !== $('effect-seconds'))
      $('effect-seconds').value = String(
        Math.min(30, previewSeconds).toFixed(2),
      );
    $('time-value').textContent = detail.paused
      ? previewSeconds.toFixed(2) + 's'
      : '实时';
    if (!state?.document) return;
    if (!detail.activeAction) {
      playing = false;
      host.setAnimationFeedback(null);
      $('animation-canvas-feedback').hidden = true;
      return;
    }
    if (detail.id !== actionId) return;
    const wasPlaying = playing;
    seconds = detail.seconds;
    playing = !detail.paused;
    updateTime();
    if (wasPlaying && !playing && seconds >= detail.duration)
      status('动作结束 · 可重新播放或记录关键帧');
  });
  for (const [id, spec] of Object.entries(specs()))
    $('timeline-track').add(new Option(spec.name, id));
  document.addEventListener(
    'keydown',
    (e) => {
      if (!(e.target instanceof Element) || !selectedAction()) return;
      if (
        !opened ||
        importedCardShortcuts.editable(e.target) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        document.querySelector('dialog[open]:not(#ai-dialog)')
      )
        return;
      if (
        ![
          'editor-canvas',
          'author-model-canvas',
          'timeline-tracks',
          'animation-timeline',
        ].includes(e.target.id) &&
        !e.target.closest('#animation-timeline')
      )
        return;
      if (
        e.target.closest('#animation-timeline') &&
        ['Delete', 'Backspace'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const focusedKey = e.target.closest<HTMLElement>('[data-key-at]'),
          focusedTrack = e.target.closest<HTMLElement>(
            '[data-track],[data-track-label]',
          );
        if (focusedKey) {
          chooseTrack(required(focusedKey.dataset.track));
          seek(Number(focusedKey.dataset.keyAt) * currentAction().duration);
        } else if (focusedTrack) {
          const id =
            focusedTrack.dataset.track || focusedTrack.dataset.trackLabel;
          if (id && id !== track) chooseTrack(id);
        }
        if (e.shiftKey) clearTrack();
        else deleteFrame();
        return;
      }
      if (['Comma', 'Period', 'Space'].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === 'Space') play();
        else if (e.shiftKey)
          seek(
            model.adjacent(
              currentClip(),
              track,
              seconds,
              e.code === 'Comma' ? -1 : 1,
            ),
          );
        else
          seek(
            model.step(
              seconds,
              e.code === 'Comma' ? -1 : 1,
              currentAction().duration,
              fps,
            ),
          );
      }
    },
    true,
  );
  function selectBone(
    id: string,
    type: 'bone' | 'ik' | 'expression' = 'bone',
    showPanel = true,
    preservePose = false,
  ) {
    boneId = id;
    controlType = type;
    track = type === 'bone' ? 'rotation' : type === 'ik' ? 'x' : 'value';
    trackGroup = 'all';
    renderKey = '';
    draftAction = null;
    valueDraft = false;
    if (showPanel) open();
    refresh(host.state(), actionId);
    chooseTrack(track, preservePose);
  }
  $('timeline-target').onchange = () => {
    const id = $('timeline-target').value;
    if (id) {
      const type = id.startsWith('ik:')
        ? 'ik'
        : id.startsWith('expression:')
          ? 'expression'
          : 'bone';
      selectBone(type === 'bone' ? id : id.slice(id.indexOf(':') + 1), type);
    } else {
      boneId = '';
      track = 'motion';
      trackGroup = 'effects';
      renderKey = '';
      refresh(host.state(), actionId);
      chooseTrack('motion');
    }
  };
  const exposedatelierAnimation = {
    refresh,
    open,
    close,
    play,
    seek,
    selectBone,
    isOpen: () => opened,
    isPlaying: () => playing,
    context: () => ({ action: selectedAction(), seconds }),
    pauseContext() {
      pause();
      return { action: selectedAction(), seconds };
    },
  };
  exposedatelierAnimation satisfies WeightAnimationPort;
  exposedatelierAnimation satisfies CharacterAnimationPort;
  Object.assign(window, { atelierAnimation: exposedatelierAnimation });
  refresh(host.state(), $('action-list').value || 'idle');
  if (document.body.dataset.inspectorPanel === 'motion') open(false);
  return { atelierAnimation: exposedatelierAnimation };
})();
