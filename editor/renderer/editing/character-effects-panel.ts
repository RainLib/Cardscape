import characterEffects from '../rendering/character-effects.ts';
import type { MotionType } from '../rendering/character-effects.ts';
import type { CardLayer, CharacterEffects } from '../../shared/document';

export const moduleApi = (() => {
  const host = window.cardEditorHost;
  const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById('character-fx-' + id) as T;
  const input = (id: string) => byId<HTMLInputElement>(id);
  const select = (id: string) => byId<HTMLSelectElement>(id);
  const button = (id: string) => byId<HTMLButtonElement>(id);
  const panel = byId<HTMLDetailsElement>('panel');
  const motionKeys = [...characterEffects.motionTypes, 'glow'] as const;
  const splitParts: Record<MotionType, ['front' | 'rear', string]> = {
    sash: ['front', 'skirt'],
    hair: ['front', 'hair'],
    cape: ['rear', 'cape'],
  };
  const sides = [
    ['top', true],
    ['right', true],
    ['bottom', false],
    ['left', true],
  ] as const;

  function edit(label: string, update: (effects: CharacterEffects) => void) {
    try {
      if (!host.state().document?.characterEffects) return;
      host.mutate(label, (doc) => update(doc.characterEffects!));
    } catch (error) {
      host.say((error as Error).message);
    }
  }

  for (const key of ['breakout', 'wordmark', ...motionKeys] as const)
    input(key).onchange = () =>
      edit('切换人物动效', (effects) => {
        effects[key].enabled = input(key).checked;
      });

  for (const key of motionKeys)
    for (const property of ['strength', 'speed'] as const) {
      const control = input(key + '-' + property);
      control.onchange = () => {
        if (control.value && control.validity.valid)
          edit('调整人物动效', (effects) => {
            effects[key][property] = control.valueAsNumber;
          });
      };
    }

  input('glow-color').onchange = () =>
    edit('调整装饰发光颜色', (effects) => {
      effects.glow.color = input('glow-color').value;
    });
  select('body-motion').onchange = () =>
    edit('设置连续人物层的运动', (effects) => {
      const type = characterEffects.motionTypes.find(
        (value) => value === select('body-motion').value,
      );
      if (type) effects.bodyMotion = type;
    });
  for (const [side] of sides)
    input(side).onchange = () =>
      host.mutate('调整允许破框的边缘', (doc) => {
        doc.composition = { ...doc.composition, [side]: input(side).checked };
      });
  for (const id of ['layerId', 'occluderId'] as const)
    select(id).onchange = () =>
      edit('设置字标遮挡', (effects) => {
        const value = select(id).value;
        if (value) effects.wordmark[id] = value;
        else delete effects.wordmark[id];
      });

  function mask(id: string, tool = 'brush') {
    host.chooseMask(id, tool);
    if (tool === 'brush') window.atelierWorkspace.panel('masks');
  }
  button('import').onclick = () => {
    (document.getElementById('import-role') as HTMLSelectElement).value =
      'foreground';
    void host.command('import');
  };
  button('select').onclick = () => mask('motion', 'lasso');
  button('inset').onclick = () => {
    mask('inset');
    host.setMaskBrush(0);
  };
  button('use-selection').onclick = () =>
    void host.markBreakoutSelection().catch((error) => host.say(error.message));
  for (const id of ['motion', 'rigid', 'emission', 'phase'] as const)
    button(id + '-mask').onclick = () => {
      mask(id);
      host.setMaskBrush(255);
    };
  for (const type of characterEffects.motionTypes)
    button(type + '-split').onclick = () => {
      const [role, part] = splitParts[type];
      void host
        .splitSelection(role, part, 'center', true)
        .catch((error) => host.say(error.message));
    };

  function choices(
    control: HTMLSelectElement,
    layers: CardLayer[],
    value?: string,
  ) {
    const options = layers.map((l) => [l.id, l.name]);
    const rows = [['', '自动'], ...options];
    if (value && !options.some(([id]) => id === value))
      rows.push([value, '图层不可用']);
    if (
      JSON.stringify(rows) !==
      JSON.stringify(Array.from(control.options, (o) => [o.value, o.dataset.sourceLabel ?? o.text]))
    )
      control.replaceChildren(...rows.map(([id, name]) => {
        const option = new Option(name, id);
        option.dataset.sourceLabel = name;
        if (layers.some((layer) => layer.id === id)) option.dataset.uiContent = '';
        return option;
      }));
    control.value = value || '';
  }

  function refresh() {
    const state = host.state();
    const doc = state.document;
    const effects = doc?.characterEffects;
    panel.hidden = !effects || !!doc?.assetKind;
    if (!doc || !effects || panel.hidden) return;
    for (const control of panel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >('input, select, button'))
      control.disabled = Boolean(state.busy);
    for (const key of ['breakout', 'wordmark', ...motionKeys] as const)
      input(key).checked = effects[key].enabled;
    for (const [side, fallback] of sides)
      input(side).checked = Boolean(doc.composition?.[side] ?? fallback);
    for (const key of motionKeys)
      for (const property of ['strength', 'speed'] as const) {
        const control = input(key + '-' + property);
        if (document.activeElement !== control)
          control.value = String(effects[key][property]);
      }
    input('glow-color').value = effects.glow.color;
    select('body-motion').value = effects.bodyMotion || 'sash';
    choices(
      select('layerId'),
      characterEffects.wordmarks(doc.layers),
      effects.wordmark.layerId,
    );
    choices(
      select('occluderId'),
      characterEffects.occluders(doc.layers),
      effects.wordmark.occluderId,
    );
    const canSelect =
      !state.busy &&
      doc.layers.some(
        (l) =>
          l.kind === 'foreground' && l.src && l.visible !== false && !l.locked,
      );
    const hasSelection =
      canSelect && state.layer?.kind === 'foreground' && state.selection;
    for (const id of [
      'select',
      'inset',
      'motion-mask',
      'rigid-mask',
      'emission-mask',
      'phase-mask',
    ])
      button(id).disabled = !canSelect;
    button('use-selection').disabled = !hasSelection;
    for (const key of characterEffects.motionTypes)
      button(key + '-split').disabled = !hasSelection;
  }

  function open() {
    document.body.classList.remove('dock-collapsed', 'panels-hidden');
    window.atelierWorkspace.panel('appearance');
    panel.open = true;
    refresh();
  }
  const atelierCharacterEffects = { open, refresh };
  window.atelierCharacterEffects = atelierCharacterEffects;
  refresh();
  return { atelierCharacterEffects };
})();
