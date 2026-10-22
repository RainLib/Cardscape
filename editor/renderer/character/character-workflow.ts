import { element } from '../core/dom.ts';
import type { CharacterPanelElements } from '../../shared/character-elements';
import type { CharacterPanelBindings } from '../../shared/character-panels';
/* Contextual character workspace. Move existing controls instead of cloning
 * editors: validation, picking, undo and import/export keep their own handlers. */
export const moduleApi = (() => {
  'use strict';
  const bindings = window as unknown as CharacterPanelBindings;
  const $ = <K extends keyof CharacterPanelElements>(id: K) =>
      element<CharacterPanelElements[K]>(id),
    host = bindings.cardEditorHost,
    rig = bindings.atelierCharacterRig,
    motion = required(
      document.querySelector<HTMLElement>('[data-panel="motion"]'),
    ),
    toolbar = $('character-controls'),
    header = required(toolbar.querySelector('.character-tool-header')),
    manager = $('character-manager');
  function required<T>(value: T | null): T {
    if (value === null) throw Error('缺少人物工作区控件');
    return value;
  }
  let scope: 'character' | 'card' = 'character',
    updating = false,
    focused: boolean | null = null,
    previousObject: string | undefined = '',
    meshTool = '';
  const scopeBar = document.createElement('div');
  scopeBar.id = 'character-scope';
  scopeBar.setAttribute('role', 'group');
  scopeBar.setAttribute('aria-label', '动画编辑范围');
  scopeBar.innerHTML =
    '<button data-motion-scope="character">人物动画</button><button data-motion-scope="card">整卡动画</button><button id="character-layers-open" title="返回图层与属性">图层</button>';
  motion.prepend(scopeBar);
  const phases = document.createElement('div');
  phases.className = 'character-phases';
  phases.setAttribute('role', 'group');
  phases.setAttribute('aria-label', '人物制作阶段');
  phases.innerHTML =
    '<button data-character-phase="setup" title="编辑骨架结构和初始绑定">设置</button><button data-character-phase="animate" title="拖动试姿势，再记录到当前动作">动画</button>';
  header.prepend(phases);
  const selected = document.createElement('span');
  selected.id = 'character-toolbar-object';
  header.append(selected);
  const display = document.createElement('details');
  display.id = 'character-display';
  display.className = 'character-popover';
  display.innerHTML = '<summary>显示</summary><div></div>';
  header.append(display);
  const displayBody = required(display.querySelector('div'));
  displayBody.append($('character-bone-visibility'));
  for (const id of ['skin-outline', 'skin-show', 'skin-full-topology'] as const)
    displayBody.append(required($(id).closest('label')));
  // One compact tool row, with no second row of global settings.
  header.append(
    $('character-bone-tools'),
    $('character-mesh-tools'),
    $('character-weight-tools'),
  );
  header.append(
    selected,
    required(toolbar.querySelector('.character-pose-actions')),
    display,
  );
  const posePanel = document.createElement('section');
  posePanel.id = 'character-animation-tools';
  posePanel.innerHTML =
    '<div class="character-section-title">当前动作 <b id="character-animation-name"></b><button id="character-action-add" title="新建人物动作" aria-label="新建人物动作">＋</button></div><p class="panel-note">拖动骨骼试姿势，确认后点“记录姿势”。</p><div id="character-animation-transport" class="button-row"></div>';
  manager.after(posePanel);
  $('character-animation-transport').append(
    $('rig-pose-play'),
    $('rig-pose-timeline'),
  );
  const actionPicker = required($('preview-action').closest('label')),
    pickerAnchor = document.createComment('preview-action-picker');
  actionPicker.before(pickerAnchor);
  const actionName = $('character-animation-name'),
    previewActionName = document.createElement('span');
  previewActionName.id = 'character-preview-action';
  $('preview-player').prepend(previewActionName);
  function fold(parent: Element, title: string, id?: string, open = false) {
    const e = document.createElement('details');
    e.className = 'fold character-task-fold';
    if (id) e.id = id;
    e.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    e.append(summary);
    parent.append(e);
    return e;
  }
  function move(parent: Element, ids: (keyof CharacterPanelElements)[]) {
    for (const id of ids) {
      const e = $(id);
      if (!e) throw Error('缺少人物工具：' + id);
      parent.append(
        e.tagName === 'INPUT' || e.tagName === 'SELECT'
          ? e.closest('label') || e
          : e,
      );
    }
  }
  const animationOptions = fold(
    posePanel,
    '记录方式与检查',
    'character-animation-options',
  );
  move(animationOptions, [
    'rig-edit-stage',
    'rig-pose-ease',
    'rig-motion-check',
  ]);
  animationOptions.append($('rig-motion-check-status'));
  const stage = $('rig-edit-stage');
  stage.setAttribute('aria-label', '姿势记录方式');
  stage.options[0].textContent = '先试姿势，再确认';
  stage.options[1].textContent = '拖动后自动记录';
  stage.options[2].textContent = '编辑初始绑定';
  const boneTools: Record<string, string> = {
    select: '操纵骨骼',
    rest: '移动初始关节',
    tip: '调整骨段末端',
    translate: '移动骨骼',
    rotate: '旋转骨骼',
    ik: '移动 IK 目标',
    off: '关闭骨架操作',
  };
  for (const option of $('rig-canvas-tool').options)
    option.textContent = boneTools[option.value];
  const messages = required(toolbar.querySelector('.character-tool-messages'));
  manager.append(messages);
  $('character-page-guide').hidden = true;
  manager.append($('character-advanced-status'));
  const utilities = fold(motion, '导入 / 导出与帮助', 'character-utilities');
  move(utilities, ['rig-import', 'spine-import-open', 'rig-export']);
  const rigPanel = $('character-rig-panel');
  required(rigPanel.querySelector(':scope > summary')).textContent = '骨骼属性';
  const boneExtra = fold(rigPanel, '更多骨骼操作', 'character-bone-extra');
  move(boneExtra, [
    'rig-bone',
    'rig-add-root',
    'rig-remove',
    'rig-length',
    'rig-direction',
    'rig-apply-tip',
    'rig-binding',
    'rig-bind',
    'rig-unbind',
    'rig-animate',
  ]);
  // Structure fields remain immediately available in setup; rare management
  // operations live in the fold above. A new project still has a direct entry.
  const empty = document.createElement('div');
  empty.id = 'character-empty-rig';
  empty.innerHTML =
    '<p>先建立根骨骼，再添加子骨骼或导入已有工程。</p><button id="character-first-bone">创建根骨骼</button>';
  manager.after(empty);
  $('character-first-bone').onclick = () => {
    changePhase('setup');
    $('rig-add-root').click();
  };
  const meshPanel = $('skin-panel'),
    meshBasic = document.createElement('div');
  meshBasic.id = 'character-mesh-basic';
  meshBasic.className = 'character-task-card';
  meshBasic.innerHTML =
    '<div class="character-section-title">建立与编辑网格</div><div id="character-mesh-build" class="button-row"></div><div id="character-outline-actions" class="button-row"></div>';
  required(meshPanel.querySelector(':scope > summary')).after(meshBasic);
  move($('character-mesh-build'), [
    'skin-create',
    'skin-fill',
    'skin-outline-new',
  ]);
  move($('character-outline-actions'), [
    'skin-outline-close',
    'skin-outline-cancel',
  ]);
  meshBasic.append($('skin-topology-status'));
  $('skin-create').textContent = '自动建网';
  $('skin-fill').textContent = '自动补网';
  $('skin-outline-new').textContent = '手工轮廓';
  const topology = $('skin-topology-panel');
  topology.open = false;
  required(topology.querySelector(':scope > summary')).textContent =
    '建网参数与重建';
  const influence = required($('skin-bone').closest('label')),
    influenceAnchor = document.createComment('mesh-influence-picker');
  influence.before(influenceAnchor);
  const selection = fold(
    meshPanel,
    '选中顶点操作',
    'character-mesh-selection',
    true,
  );
  move(selection, [
    'skin-delete-points',
    'skin-pin',
    'skin-unpin',
    'skin-edge-add',
    'skin-edge-remove',
    'skin-flip-edge',
  ]);
  const refinement = fold(meshPanel, '局部加密', 'character-mesh-refinement');
  move(refinement, [
    'skin-detail-spacing',
    'skin-detail-radius',
    'skin-refine-selection',
  ]);
  const reduction = $('skin-reduction-panel');
  meshPanel.append(reduction);
  reduction.open = false;
  required(reduction.querySelector(':scope > summary')).textContent =
    '减面与动画检查';
  const weights = $('skin-weight-properties'),
    brush = document.createElement('div');
  brush.id = 'character-weight-brush';
  brush.className = 'character-task-card';
  brush.innerHTML = '<div class="character-section-title">笔刷设置</div>';
  brush.append($('character-brush-options'));
  move(brush, ['skin-brush-value']);
  weights.prepend(brush);
  const test = document.createElement('div');
  test.id = 'character-weight-test';
  test.className = 'button-row';
  move(test, ['skin-test', 'skin-test-reset']);
  brush.after(test);
  for (const e of weights.querySelectorAll<HTMLDetailsElement>(
    ':scope > details',
  ))
    if (e.querySelector('#skin-bones')) {
      e.open = false;
      required(e.querySelector('summary')).textContent = '绑定骨骼范围与锁定';
    }
  const used = document.createElement('label');
  used.id = 'character-influences-filter';
  used.innerHTML =
    '<input type="checkbox" id="character-all-influences">显示全部骨骼';
  $('skin-bones').before(used);
  $('character-all-influences').onchange = () =>
    $('skin-bones').classList.toggle(
      'show-all',
      $('character-all-influences').checked,
    );
  // General card actions have their own scope. In the character workspace only
  // animation metadata is shared; card-specific gain controls stay collapsed.
  const actionProperties = required($('action-list').closest('details')),
    actionAnchor = document.createComment('card-action-properties');
  actionProperties.before(actionAnchor);
  const actionSlot = document.createElement('div');
  actionSlot.id = 'character-action-settings';
  posePanel.append(actionSlot);
  actionProperties.open = false;
  $('character-action-add').onclick = () => {
    if ($('action-add').disabled) return;
    $('action-add').click();
    actionProperties.open = true;
    $('action-name').focus();
    $('action-name').select();
  };
  const gains = fold(actionProperties, '整卡动效增益');
  move(gains, ['action-motion', 'action-emission', 'action-bend']);
  const previewControls = required(
      document.querySelector<HTMLElement>('#preview-panel .preview-controls'),
    ),
    previewOptions = fold(
      previewControls,
      '视角与检查',
      'character-preview-options',
    );
  previewOptions.append(
    required(previewControls.querySelector('.preview-region')),
    required(previewControls.querySelector('.preview-buttons')),
  );
  new MutationObserver(() => {
    if ($('component-preview-tools').open) previewOptions.open = true;
  }).observe($('component-preview-tools'), {
    attributes: true,
    attributeFilter: ['open'],
  });
  for (const root of [rigPanel, topology, weights] as const)
    for (const row of root.querySelectorAll('.button-row'))
      if (!row.children.length && !row.textContent?.trim()) row.remove();
  const cardNodes = [...motion.children].filter(
    (e) =>
      ![
        scopeBar,
        manager,
        posePanel,
        empty,
        rigPanel,
        $('character-advanced-panel'),
        utilities,
      ].includes(e as HTMLElement),
  );
  for (const e of cardNodes)
    (e as HTMLElement).dataset.cardAnimationOnly = 'true';
  delete actionProperties.dataset.cardAnimationOnly;
  // Close display settings on Escape/outside click; never consume canvas keys.
  document.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Node) || !display.contains(e.target))
      display.open = false;
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && display.open) {
        display.open = false;
        e.preventDefault();
        e.stopPropagation();
        required(display.querySelector('summary')).focus();
      }
    },
    true,
  );
  function changePhase(next: string | undefined) {
    if (host.state().busy) return;
    const value = next === 'setup' ? 'setup' : 'preview';
    if (stage.value !== value) {
      stage.value = value;
      stage.dispatchEvent(new Event('change'));
    }
    if (next === 'animate') {
      bindings.atelierAnimation.open(false);
      if (
        ['mesh', 'weights'].includes(
          document.body.dataset.characterDomain || '',
        )
      )
        rig.activate('bones');
    } else bindings.atelierAnimation.close();
    refresh();
  }
  for (const b of phases.querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => changePhase(b.dataset.characterPhase);
  for (const b of scopeBar.querySelectorAll<HTMLButtonElement>(
    '[data-motion-scope]',
  ))
    b.onclick = () => {
      if (host.state().busy) return;
      scope = b.dataset.motionScope === 'card' ? 'card' : 'character';
      if (scope === 'card') {
        host.selectTool('move');
        bindings.atelierAnimation.open(false);
      } else
        bindings.atelierCharacterWorkspace?.open(
          document.body.dataset.characterPage || 'bones',
        );
      refresh();
    };
  $('character-layers-open').onclick = () => {
    if (host.state().busy) return;
    host.selectTool('move');
    bindings.atelierWorkspace.panel('properties', false);
    bindings.atelierWorkspace.syncLayout();
    host.fit();
  };
  function refresh() {
    if (updating) return;
    updating = true;
    try {
      const state = host.state(),
        doc = state.document;
      if (!doc) return;
      const domain = document.body.dataset.characterDomain,
        page = document.body.dataset.characterPage || domain || '',
        setup = stage.value === 'setup';
      if (domain === 'none') scope = 'card';
      const active =
        scope === 'character' &&
        document.body.dataset.inspectorPanel === 'motion' &&
        domain !== 'none';
      document.body.dataset.characterFocus = String(active);
      document.body.dataset.motionScope = scope;
      document.body.dataset.characterPhase = setup ? 'setup' : 'animate';
      if (focused !== active) {
        focused = active;
        requestAnimationFrame(() => {
          if (!host.state().busy) host.fit();
        });
      }
      for (const b of scopeBar.querySelectorAll<HTMLButtonElement>(
        '[data-motion-scope]',
      )) {
        b.setAttribute('aria-pressed', String(scope === b.dataset.motionScope));
        b.disabled = !!state.busy;
      }
      for (const b of phases.querySelectorAll<HTMLButtonElement>('button')) {
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.characterPhase === (setup ? 'setup' : 'animate')),
        );
        b.disabled = !!state.busy;
      }
      phases.hidden = ['mesh', 'weights'].includes(page);
      for (const option of $('rig-canvas-tool').options)
        option.hidden = setup
          ? !['rest', 'tip'].includes(option.value)
          : ['rest', 'tip'].includes(option.value);
      const bone = doc.characterRig?.bones.find((b) => b.id === rig.selected()),
        mesh = doc.characterRig?.meshes?.find(
          (m) => m.layerId === state.layer?.id,
        ),
        bones = doc.characterRig?.bones.length || 0;
      selected.textContent = ['bones', 'ik'].includes(page)
        ? bone?.name || '选择骨骼'
        : state.layer?.name || '选择图片';
      selected.title = selected.textContent || '';
      $('character-bone-visibility').hidden = domain === 'mesh';
      for (const id of [
        'skin-outline',
        'skin-show',
        'skin-full-topology',
      ] as const)
        required($(id).closest('label')).hidden = domain === 'bones';
      const object = ['bones', 'ik'].includes(page)
        ? bone?.id
        : state.layer?.id;
      if (object !== previousObject) {
        previousObject = object;
        requestAnimationFrame(() => {
          const list = $('character-object-list'),
            item = list.querySelector('[aria-pressed="true"]');
          if (!item) return;
          const a = item.getBoundingClientRect(),
            b = list.getBoundingClientRect();
          if (a.top < b.top) list.scrollTop += a.top - b.top;
          else if (a.bottom > b.bottom) list.scrollTop += a.bottom - b.bottom;
        });
      }
      posePanel.hidden = !active || setup || ['mesh', 'weights'].includes(page);
      empty.hidden = !active || bones > 0 || page !== 'bones';
      rigPanel.hidden = active && (!setup || page !== 'bones' || !bones);
      if (active && setup && page === 'bones' && bones) rigPanel.open = true;
      if (scope === 'character') {
        if (actionProperties.parentElement !== actionSlot)
          actionSlot.append(actionProperties);
      } else if (actionProperties.parentElement === actionSlot)
        actionAnchor.after(actionProperties);
      const action = bindings.atelierAnimation.context().action;
      actionName.textContent = previewActionName.textContent =
        action?.name || '未选择动作';
      $('rig-pose-play').textContent = bindings.atelierAnimation.isPlaying()
        ? '暂停'
        : '播放';
      required(posePanel.querySelector('.panel-note')).textContent =
        stage.value === 'record'
          ? '拖动结束后自动写入当前帧，可撤销。'
          : '拖动骨骼试姿势，确认后点“记录姿势”。';
      const pickHere = active && !posePanel.hidden;
      actionName.hidden = pickHere;
      previewActionName.hidden = !pickHere;
      if (pickHere) {
        if (actionPicker.parentElement !== posePanel.firstElementChild)
          required(posePanel.firstElementChild).insertBefore(
            actionPicker,
            $('character-action-add'),
          );
      } else if (actionPicker.parentNode !== pickerAnchor.parentNode)
        pickerAnchor.after(actionPicker);
      $('preview-action').setAttribute(
        'aria-label',
        pickHere ? '当前人物动作' : '3D 预览动作',
      );
      $('character-action-add').disabled =
        !!state.busy || (doc.actions?.length || 0) >= 24;
      $('rig-pose-record').hidden ||= !rig.draftAction();
      $('rig-pose-reset').hidden ||= !rig.draftAction();
      $('skin-create').hidden = !!mesh;
      $('skin-fill').hidden = !mesh;
      $('character-outline-actions').hidden =
        $('skin-tool').value !== 'mesh-outline';
      meshBasic.hidden = page !== 'mesh';
      refinement.hidden = page !== 'mesh';
      reduction.hidden = page !== 'mesh';
      if (page === 'mesh') {
        if (influence.parentElement !== topology)
          required(topology.querySelector(':scope > summary')).after(influence);
      } else if (influence.parentNode !== influenceAnchor.parentNode)
        influenceAnchor.after(influence);
      if (page === 'mesh' && meshTool !== $('skin-tool').value) {
        meshTool = $('skin-tool').value;
        const hints: Record<string, string> = {
          'mesh-select': '点击选点，Shift 追加；拖动框选。',
          'mesh-move': '拖动所选顶点，保留权重和已有动画。',
          'mesh-add': '点击图片表面加点，插值继承权重与 FFD。',
          'mesh-delete': '点击顶点删除，超过动画误差时自动取消。',
          'mesh-outline': '沿图片点击描边；Enter 闭合并填充，Esc 取消。',
          'mesh-refine': '点击局部加密，或先框选再加密选中区域。',
          'mesh-edge': '依次点击两个顶点连接约束边。',
        };
        $('skin-topology-status').textContent =
          hints[meshTool] || '先自动建网或手工描边，再选择网格工具。';
        if (meshTool === 'mesh-refine') refinement.open = true;
      }
      $('character-advanced-status').hidden = !['mesh', 'weights'].includes(
        page,
      );
      selection.hidden = page !== 'mesh' || $('skin-delete-points').disabled;
      brush.hidden =
        page !== 'weights' ||
        !['add', 'remove', 'replace', 'smooth'].includes($('skin-tool').value);
      required($('skin-brush-value').closest('label')).hidden =
        $('skin-tool').value !== 'replace';
      $('skin-test-reset').hidden = !Number($('skin-test-angle').value);
      $('character-manager-open').hidden = true;
      required(stage.closest('label')).hidden = setup;
      const guide = $('character-tool-hint');
      guide.title = guide.textContent || '';
    } finally {
      updating = false;
    }
  }
  const exposedatelierCharacterWorkflow = {
    refresh,
    activate() {
      scope = 'character';
      if (
        document.body.dataset.characterDomain === 'mesh' &&
        bindings.atelierAnimation.isOpen()
      )
        bindings.atelierAnimation.close();
      refresh();
    },
  };
  exposedatelierCharacterWorkflow satisfies NonNullable<
    CharacterPanelBindings['atelierCharacterWorkflow']
  >;
  Object.assign(window, {
    atelierCharacterWorkflow: exposedatelierCharacterWorkflow,
  });
  window.addEventListener('atelier-preview-frame', () => {
    if (scope === 'character') {
      $('rig-pose-play').textContent = bindings.atelierAnimation.isPlaying()
        ? '暂停'
        : '播放';
    }
  });
  refresh();
  return { atelierCharacterWorkflow: exposedatelierCharacterWorkflow };
})();
