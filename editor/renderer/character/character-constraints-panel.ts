import C from './character-animation-model.ts';
import { element } from '../core/dom.ts';
import type { IKConstraint, IKLimit } from '../../shared/character';
import type { CardDocument } from '../../shared/document';
import type {
  IKPanelBindings,
  IKPanelAPI,
  IKEdit,
  CharacterPanelState,
} from '../../shared/character-editor';

interface IKElements {
  'character-ik-panel': HTMLDetailsElement;
  'ik-list': HTMLSelectElement;
  'ik-root': HTMLSelectElement;
  'ik-tip': HTMLSelectElement;
  'ik-target-bone': HTMLSelectElement;
  'ik-solver': HTMLSelectElement;
  'ik-enabled': HTMLInputElement;
  'ik-order': HTMLInputElement;
  'ik-iterations': HTMLInputElement;
  'ik-tolerance': HTMLInputElement;
  'ik-chain-info': HTMLElement;
  'ik-joint-limits': HTMLElement;
  'ik-live-status': HTMLElement;
  'ik-constraints': HTMLElement;
  'ik-up': HTMLButtonElement;
  'ik-down': HTMLButtonElement;
}
/* The entry and advanced panel check these ports with `satisfies`. Projecting
 * just the used API keeps strict panels independent of the legacy app module. */
export const moduleApi = (() => {
  const bindings = window as unknown as IKPanelBindings,
    host = bindings.cardEditorHost,
    K = C.advanced.ik;
  const $ = <I extends keyof IKElements>(id: I): IKElements[I] =>
    element<IKElements[I]>(id);
  const panel = $('character-ik-panel');
  panel.querySelector('summary')!.textContent = '自有 IK · 链与约束管理';
  const manager = document.createElement('div');
  manager.id = 'ik-manager';
  manager.innerHTML =
    '<div id="ik-constraints" aria-label="约束列表"></div><div class="button-row"><button id="ik-up">上移求解顺序</button><button id="ik-down">下移求解顺序</button></div><p id="ik-live-status" class="panel-note" role="status"></p>';
  $('ik-list').closest('label')!.before(manager);
  const options = document.createElement('div');
  options.innerHTML = `<label><input id="ik-enabled" type="checkbox" checked>启用约束</label><label>求解器 <select id="ik-solver" aria-label="IK 求解器"><option value="analytic">两节解析 · 保持旧动作</option><option value="ccd">多节 CCD · 关节限制</option></select></label><label>顺序 <input id="ik-order" type="number" min="0" max="255" value="0" aria-label="IK 求解顺序"></label><label>目标空间 <select id="ik-target-bone" aria-label="IK 目标骨骼"><option value="">卡片坐标</option></select></label><p id="ik-chain-info" class="panel-note"></p><details class="fold"><summary>求解精度与关节角度限制</summary><label>迭代上限 <input id="ik-iterations" type="number" min="1" max="128" value="48" aria-label="IK 迭代上限"></label><label>误差 px <input id="ik-tolerance" type="number" min=".001" max="10" value=".05" step="any" aria-label="IK 求解误差"></label><div id="ik-joint-limits"></div><p class="panel-note">角度限制相对初始绑定姿势，0° 固定该关节；仅 CCD 使用。重叠链按顺序求解，靠后的约束优先，目标依赖必须先求解。</p></details>`;
  $('ik-root').closest('label')!.before(options);
  let selected = '',
    key = '';
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  function input(row: Element, selector: string): HTMLInputElement {
    const value = row.querySelector<HTMLInputElement>(selector);
    if (!value) throw Error('缺少 IK 限制控件');
    return value;
  }
  function readLimits(): IKLimit[] {
    return [
      ...$('ik-joint-limits').querySelectorAll<HTMLLabelElement>(
        '.ik-limit-row',
      ),
    ]
      .filter((row) => input(row, '[type=checkbox]').checked)
      .map((row) => {
        const boneId = row.dataset.limitBone;
        if (!boneId) throw Error('IK 限制缺少骨骼');
        return {
          boneId,
          min: Number(input(row, '[data-limit=min]').value),
          max: Number(input(row, '[data-limit=max]').value),
        };
      });
  }
  function chainFields(limits: IKLimit[] | null = null) {
    const rig = host.state().document?.characterRig;
    if (!rig) return;
    let chain: string[] = [];
    try {
      chain = K.chain(rig.bones, {
        rootId: $('ik-root').value,
        tipId: $('ik-tip').value,
      });
      $('ik-chain-info').textContent =
        chain
          .map((id) => rig.bones.find((b) => b.id === id)!.name)
          .join(' → ') + ` · ${chain.length} 节`;
    } catch (error) {
      $('ik-chain-info').textContent = message(error);
    }
    const previous = limits || readLimits();
    $('ik-joint-limits').replaceChildren();
    for (const id of chain) {
      const bone = rig.bones.find((b) => b.id === id)!,
        limit = previous.find((l) => l.boneId === id),
        row = document.createElement('label');
      row.className = 'ik-limit-row';
      row.dataset.limitBone = id;
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = !!limit;
      enabled.setAttribute('aria-label', '限制 ' + bone.name);
      const title = document.createElement('span');
      title.textContent = bone.name;
      row.append(enabled, title);
      for (const part of ['min', 'max'] as const) {
        const field = document.createElement('input');
        field.type = 'number';
        field.min = '-720';
        field.max = '720';
        field.step = 'any';
        field.value = String(limit?.[part] ?? (part === 'min' ? -180 : 180));
        field.dataset.limit = part;
        field.setAttribute(
          'aria-label',
          bone.name + (part === 'min' ? ' 最小角度' : ' 最大角度'),
        );
        row.append(field);
      }
      $('ik-joint-limits').append(row);
    }
  }
  function mutate(label: string, edit: (document: CardDocument) => void) {
    try {
      host.mutate(label, (d) => {
        edit(d);
        C.validate(d);
      });
      host.refreshPreview();
      bindings.atelierCharacterAdvanced.refresh();
    } catch (error) {
      $('ik-live-status').textContent = message(error);
    }
  }
  function refresh(
    c: IKConstraint | null = null,
    s: CharacterPanelState = host.state(),
  ) {
    const doc = s.document;
    if (!doc) return;
    selected = c?.id || '';
    const constraints = K.ordered(doc.characterRig?.constraints || []),
      bones = doc.characterRig?.bones || [],
      signature = JSON.stringify([
        s.documentToken,
        s.revision,
        selected,
        s.busy,
      ]);
    if (signature !== key) {
      key = signature;
      const target = $('ik-target-bone');
      target.replaceChildren(
        new Option('卡片坐标', ''),
        ...bones.map((b) => new Option(b.name + ' · 局部偏移', b.id)),
      );
      target.value = c?.targetBoneId || '';
      $('ik-enabled').checked = c?.enabled !== false;
      for (const [id, value] of [
        ['ik-solver', c?.solver || 'analytic'],
        ['ik-order', c?.order ?? (c ? constraints.indexOf(c) : -1)],
        ['ik-iterations', c?.iterations ?? 48],
        ['ik-tolerance', c?.tolerance ?? 0.05],
      ] as const)
        $(id).value =
          typeof value === 'number' ? String(Math.max(0, value)) : value;
      chainFields(c?.limits || []);
      $('ik-constraints').replaceChildren();
      for (const item of constraints) {
        const row = document.createElement('div');
        row.className = 'ik-constraint-row';
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = item.enabled !== false;
        enabled.disabled = !!s.busy;
        enabled.setAttribute('aria-label', '启用 ' + item.name);
        enabled.onchange = () =>
          mutate('切换 IK 约束', (d) => {
            const constraint = d.characterRig?.constraints?.find(
              (v) => v.id === item.id,
            );
            if (!constraint) throw Error('IK 约束已变化，请重新选择');
            constraint.enabled = enabled.checked;
          });
        const pick = document.createElement('button');
        pick.textContent = `${item.order ?? constraints.indexOf(item)} · ${item.name} · ${K.chain(bones, item).length} 节`;
        pick.setAttribute('aria-pressed', String(item.id === selected));
        pick.onclick = () => {
          const list = $('ik-list');
          list.value = item.id;
          list.onchange?.call(list, new Event('change'));
        };
        row.append(enabled, pick);
        $('ik-constraints').append(row);
      }
    }
    $('ik-up').disabled =
      !!s.busy || !selected || constraints[0]?.id === selected;
    $('ik-down').disabled =
      !!s.busy || !selected || constraints.at(-1)?.id === selected;
    live();
  }
  function move(direction: number) {
    mutate('调整 IK 求解顺序', (d) => {
      const list = K.ordered(d.characterRig?.constraints || []),
        i = list.findIndex((c) => c.id === selected),
        j = i + direction;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((c, i) => (c.order = i));
    });
  }
  $('ik-up').onclick = () => move(-1);
  $('ik-down').onclick = () => move(1);
  $('ik-root').onchange = $('ik-tip').onchange = () => chainFields();
  function live() {
    const pose = bindings.atelierCharacterAdvanced?.pose(),
      d = pose?.ik.get(selected);
    $('ik-live-status').textContent = d
      ? `${d.enabled === false ? '已停用' : d.mix < 0.0001 ? 'FK · 约束权重 0' : d.converged ? '目标已到达' : '目标未完全到达'} · 误差 ${d.error.toFixed(3)} px · ${d.iterations || 0} 次迭代${d.limited ? ' · 已触及角度限制' : ''}`
      : '选择约束并播放或拖动粉色目标查看结果';
  }
  const exposedatelierIKPanel: IKPanelAPI = {
    refresh,
    invalidate() {
      key = '';
    },
    read(): IKEdit {
      for (const field of options.querySelectorAll<HTMLInputElement>(
        'input[type=number]',
      ))
        if (field.value === '' || !field.validity.valid)
          throw Error('请输入有效的 IK 限制与精度');
      const solver = $('ik-solver').value;
      if (solver !== 'analytic' && solver !== 'ccd')
        throw Error('IK 求解器无效');
      return {
        solver,
        enabled: $('ik-enabled').checked,
        order: Number($('ik-order').value),
        iterations: Number($('ik-iterations').value),
        tolerance: Number($('ik-tolerance').value),
        limits: solver === 'ccd' ? readLimits() : [],
        ...($('ik-target-bone').value
          ? { targetBoneId: $('ik-target-bone').value }
          : {}),
      };
    },
  };
  bindings.atelierIKPanel = exposedatelierIKPanel;
  window.addEventListener('atelier-preview-frame', live);
  bindings.atelierCharacterAdvanced.refresh();
  return { atelierIKPanel: exposedatelierIKPanel };
})();
