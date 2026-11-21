import { element as $ } from '../core/dom.ts';
import type { CardDocument, LaserLayoutFields } from '../../shared/document';
import type {
  LaserFoilOverlay,
  LaserFoilSettings,
  Material,
} from '../../shared/visual-components';
import components from '../workshop/component-model.ts';
import laserFoil from '../workshop/laser-foil.ts';
import laserLayout from '../workshop/laser-layout.ts';
import cosmetics from './cosmetics-model.ts';
import catalog from '../workshop/finish-catalog.ts';

export const moduleApi = (() => {
  const host = window.cardEditorHost;
  const layoutDefaults = laserLayout.settings();
  const layoutKeys = Object.keys(layoutDefaults) as (keyof LaserLayoutFields)[];
  const layoutControl = (key: keyof LaserLayoutFields) =>
    $<HTMLInputElement | HTMLSelectElement>('laser-layout-' + key);
  layoutControl('style').replaceChildren(
    ...Object.entries(laserLayout.faces).map(
      ([key, face]) => new Option(face.name, key),
    ),
  );
  let lastLayout = '',
    applyingLayout = false;
  function refreshLayout(
    doc: CardDocument,
    state: ReturnType<typeof host.state>,
  ) {
    const key = JSON.stringify([
      state.documentToken,
      ...layoutKeys.map((k) => doc.laserLayout?.[k]),
    ]);
    if (key !== lastLayout) {
      lastLayout = key;
      for (const field of layoutKeys)
        layoutControl(field).value = String(
          doc.laserLayout?.[field] ?? layoutDefaults[field],
        );
    }
    const canApply =
      Boolean(laserLayout.artLayer(doc)) && doc.assetKind !== 'material';
    $<HTMLDetailsElement>('laser-layout').hidden =
      !canApply && !doc.laserLayout;
    $<HTMLButtonElement>('laser-layout-apply').disabled =
      state.busy || applyingLayout || !canApply;
    $<HTMLButtonElement>('laser-layout-remove').disabled =
      state.busy || applyingLayout || !doc.laserLayout;
  }
  const keys = [
    'enabled',
    'style',
    'target',
    'backgroundMode',
    'strength',
    'speed',
    'frequency',
    'color',
    'accent',
  ] as const;
  const laserKeys = [
    'pattern',
    'tone',
    'signature',
    'particles',
    'protectSubject',
    'rainbow',
    'foil',
    'glare',
    'sparkle',
  ] as const;
  const styleNames: Record<string, string> = {
    iridescent: '双色反射',
    holographic: '全息反射',
    symbiote: '共生蛛网',
    circuits: '反射电路',
    frosted: '磨砂漫反射',
    rays: '通用旋涡放射',
    rayspurple: '紫色旋涡放射',
    raysrainbow: '幻彩旋涡放射',
    [laserFoil.style]: '全息镭射',
  };
  $('material-style').replaceChildren(
    ...components.materialStyles.map(
      (id) =>
        new Option(
          styleNames[id] ||
            catalog.entries.find((e) => e.recipe.style === id)?.name ||
            id,
          id,
        ),
    ),
  );
  const selects: Record<
    string,
    ReadonlyArray<readonly [string, string, ...string[]]>
  > = {
    pattern: laserFoil.patterns,
    tone: laserFoil.tones,
    signature: laserFoil.signatures,
    particles: laserFoil.particleOptions,
  };
  for (const [key, choices] of Object.entries(selects))
    $('laser-' + key).replaceChildren(
      ...choices.map(([id, label]) => new Option(label, id)),
    );
  const overlayRows = Array.from(
    { length: laserFoil.maxOverlays },
    (_, index) => {
      const row = document.createElement('div');
      row.className = 'laser-overlay-row';
      const pattern = document.createElement('select');
      pattern.setAttribute('aria-label', '叠加纹样 ' + (index + 1));
      pattern.replaceChildren(
        ...laserFoil.patterns.map(([id, name]) => new Option(name, id)),
      );
      const strength = document.createElement('input');
      Object.assign(strength, {
        type: 'number',
        min: '0',
        max: '1',
        step: '0.05',
      });
      strength.setAttribute('aria-label', '叠加强度 ' + (index + 1));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '移除';
      remove.setAttribute('aria-label', '移除叠加纹样 ' + (index + 1));
      row.append(pattern, strength, remove);
      $('laser-overlay-list').append(row);
      const edit = (patch: Partial<LaserFoilOverlay>) =>
        update('编辑镭射叠加纹样', (m) => {
          const config = laserFoil.settings(m.laser);
          config.overlays = (config.overlays || []).map((v, i) =>
            i === index ? { ...v, ...patch } : v,
          );
          m.laser = config;
        });
      pattern.onchange = () => edit({ pattern: pattern.value });
      strength.onchange = () => {
        if (strength.validity.valid && strength.value !== '')
          edit({ strength: Number(strength.value) });
      };
      remove.onclick = () =>
        update('移除镭射叠加纹样', (m) => {
          const config = laserFoil.settings(m.laser);
          config.overlays = (config.overlays || []).filter(
            (_, i) => i !== index,
          );
          m.laser = config;
        });
      return { row, pattern, strength, remove };
    },
  );

  function controls(prefix: 'laser' | 'material', key: string) {
    return $<HTMLInputElement | HTMLSelectElement>(prefix + '-' + key);
  }
  function checkbox(
    el: HTMLInputElement | HTMLSelectElement,
  ): el is HTMLInputElement {
    return el.type === 'checkbox';
  }
  function controlValue(el: HTMLInputElement | HTMLSelectElement) {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox') return el.checked;
      if (el.type === 'number') return Number(el.value);
    }
    return el.value;
  }
  function sync(
    el: HTMLInputElement | HTMLSelectElement,
    value: string | number | boolean,
    disabled: boolean,
  ) {
    if (document.activeElement !== el) {
      if (checkbox(el)) el.checked = Boolean(value);
      else el.value = String(value);
    }
    el.disabled = disabled;
  }
  function refresh() {
    const state = host.state(),
      d = state.document;
    if (!d) return;
    const m = components.material(cosmetics.resolve(d).material);
    refreshLayout(d, state);
    for (const key of keys) sync(controls('material', key), m[key], state.busy);
    controls('material', 'backgroundMode').disabled =
      state.busy || m.style === 'ink';
    const isLaser = m.style === laserFoil.style;
    $('laser-settings').hidden = !isLaser;
    if (isLaser) {
      const laser = laserFoil.settings(m.laser);
      for (const key of laserKeys)
        sync(controls('laser', key), laser[key], state.busy);
      $('laser-subject-note').textContent = d.masks.subject
        ? '标注区域保留色相，透明扫光仍会经过。'
        : '单张合成图可用选区和画笔标注要保留原色的区域。';
      $<HTMLButtonElement>('laser-subject-open').disabled = state.busy;
      for (const [
        index,
        { row, pattern, strength, remove },
      ] of overlayRows.entries()) {
        const overlay = laser.overlays?.[index];
        row.hidden = !overlay;
        if (overlay) {
          sync(pattern, overlay.pattern, state.busy);
          sync(strength, overlay.strength, state.busy);
        }
        remove.disabled = state.busy;
      }
      $<HTMLButtonElement>('laser-overlay-add').disabled =
        state.busy || (laser.overlays?.length ?? 0) >= laserFoil.maxOverlays;
      $<HTMLButtonElement>('laser-suggest').disabled = state.busy;
    }
    $('material-hint').textContent =
      d.assetKind === 'material'
        ? '导入透明效果图可独立编辑，发布后可应用到多张卡片。'
        : m.backgroundMode === 'replace'
          ? '效果底替换原背景的显示，可随时切回叠加。'
          : m.target === 'background'
            ? '背景效果在人像后面合成。'
            : m.target === 'artwork'
              ? '效果叠加到背景、人物和字标。'
              : m.target === 'front'
                ? '效果叠加到整张正面，包含边框。'
                : m.target === 'back'
                  ? '效果用于当前卡背外观。'
                  : '效果用于正背面背景。';
    $<HTMLButtonElement>('material-component-new').disabled =
      state.busy || !state.workshop || !!d.assetKind;
  }
  function update(label: string, edit: (m: Material) => void, quiet = false) {
    try {
      host.mutate(label, (d: CardDocument) => {
        const m = components.material(cosmetics.resolve(d).material);
        edit(m);
        components.validateMaterial(m);
        d.material = m;
        d.cosmetics = { ...cosmetics.config(d.cosmetics), finish: 'original' };
        if (d.componentScenes?.material)
          d.componentScenes = {
            ...d.componentScenes,
            material: { ...d.componentScenes.material, ...m },
          };
      });
    } catch (error) {
      if (!quiet)
        host.say(error instanceof Error ? error.message : String(error));
    }
    refresh();
  }
  for (const key of keys) {
    const el = controls('material', key);
    const apply = (quiet = false) => {
      if (!el.validity.valid || el.value === '') return;
      const value = controlValue(el);
      update(
        '调整外观材质',
        (m) => {
          const previous = m.style;
          Object.assign(m, { [key]: value });
          if (key === 'style') {
            m.enabled = true;
            if (m.style === laserFoil.style) {
              Object.assign(m, laserFoil.presets[0]!.recipe);
              return;
            }
            const recipe = catalog.entries.find(
              (e) => e.kind === 'material' && e.recipe.style === m.style,
            )?.recipe;
            if (recipe) {
              m.color = recipe.color as string;
              m.accent = recipe.accent as string;
              m.frequency = recipe.frequency as number;
            }
            if (m.style === 'ink') {
              m.target = 'artwork';
              m.strength = 1;
              m.backgroundMode = 'overlay';
            } else if (previous === 'ink') {
              m.target = (recipe?.target as string) || 'background';
              m.strength = (recipe?.strength as number) ?? 0.5;
              m.backgroundMode = recipe?.backgroundMode || 'overlay';
            }
            if (m.style === 'gold') {
              m.target = 'background';
              m.color = '#ad7215';
              m.accent = '#ffe49c';
            }
          }
          if (
            m.style === laserFoil.style &&
            (key === 'color' || key === 'accent')
          )
            m.laser = laserFoil.settings({ ...m.laser, tone: 'custom' });
        },
        quiet,
      );
    };
    el.onchange = () => apply();
    if (el.type === 'number') el.oninput = () => apply(true);
  }
  for (const key of laserKeys) {
    const el = controls('laser', key);
    el.onchange = () => {
      if (!el.validity.valid || el.value === '') return;
      const value = controlValue(el);
      update('调整全息镭射', (m) => {
        m.laser = laserFoil.settings({
          ...m.laser,
          [key]: value,
        } as Partial<LaserFoilSettings>);
        if (key === 'tone' && value !== 'custom') {
          const tone = laserFoil.tones.find(([id]) => id === value);
          if (tone) [m.color, m.accent] = [tone[2], tone[3]];
        }
      });
    };
  }
  $('laser-subject-open').onclick = () => {
    host.chooseMask('subject');
    document.body.classList.remove('dock-collapsed', 'panels-hidden');
    window.atelierWorkspace.panel('masks');
    window.atelierWorkspace.syncLayout();
  };
  $('laser-overlay-add').onclick = () =>
    update('加入镭射叠加纹样', (m) => {
      const config = laserFoil.settings(m.laser);
      const overlays = config.overlays || [];
      if (overlays.length === laserFoil.maxOverlays) return;
      const used = new Set([
        config.pattern,
        ...overlays.map((layer) => layer.pattern),
      ]);
      const next =
        ['aurora', 'crystal', 'grating', 'silk'].find(
          (pattern) => !used.has(pattern),
        ) || 'plain';
      m.laser = {
        ...config,
        overlays: [...overlays, { pattern: next, strength: 0.45 }],
      };
    });
  $('laser-suggest').onclick = async () => {
    const state = host.state();
    const art =
      state.document &&
      (laserLayout.artLayer(state.document) ||
        state.document.layers.find(
          (l) => l.kind === 'image' && l.visible !== false && l.src,
        ));
    if (!art?.src) return host.say('请先导入卡面图片');
    try {
      const image = await host.loadImage(
        state.document?.laserLayout?.source || art.src,
      );
      const current = host.state();
      if (
        current.documentToken !== state.documentToken ||
        current.revision !== state.revision
      )
        return;
      const canvas = document.createElement('canvas');
      const scale = 100 / Math.max(image.naturalWidth, image.naturalHeight);
      canvas.width = Math.max(1, Math.round(scale * image.naturalWidth));
      canvas.height = Math.max(1, Math.round(scale * image.naturalHeight));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const selection = laserFoil.suggest(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (state.document?.laserLayout) {
        const displayed = await host.loadImage(art.src);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(displayed, 0, 0, canvas.width, canvas.height);
        selection.anchor = laserFoil.suggest(
          ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        ).anchor;
      }
      const latest = host.state();
      if (
        latest.documentToken !== state.documentToken ||
        latest.revision !== state.revision
      )
        return;
      update('自动匹配镭射纹样与箔色', (m) => {
        m.laser = laserFoil.settings({
          ...m.laser,
          pattern: selection.pattern,
          tone: selection.tone,
          signatureAnchor: selection.anchor,
        });
        m.color = selection.color;
        m.accent = selection.accent;
      });
    } catch (error) {
      host.say(error instanceof Error ? error.message : String(error));
    }
  };
  async function applyLayout(remove = false) {
    if (applyingLayout) return;
    const controls = layoutKeys.map(layoutControl);
    if (!remove && controls.some((control) => !control.reportValidity()))
      return;
    applyingLayout = true;
    refresh();
    const status = $('laser-layout-status');
    status.textContent = '正在生成卡面…';
    try {
      const fields = Object.fromEntries(
        controls.map((control, i) => [
          layoutKeys[i],
          control instanceof HTMLInputElement && control.type === 'number'
            ? control.valueAsNumber
            : control.value,
        ]),
      );
      await host.applyLaserLayout(remove ? null : laserLayout.settings(fields));
      status.textContent = remove
        ? '已恢复底图和装裱前的卡框。'
        : '已应用装裱。';
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      applyingLayout = false;
      refresh();
    }
  }
  $('laser-layout-apply').onclick = () => void applyLayout();
  $('laser-layout-remove').onclick = () => void applyLayout(true);
  $('material-component-new').onclick = () =>
    host.editComponent('material').catch((e: Error) => host.say(e.message));
  $('material-component-library').onclick = () =>
    window.atelierWorkshop?.open(true);
  const atelierMaterial = { refresh };
  window.atelierMaterial = atelierMaterial;
  refresh();
  return { atelierMaterial };
})();
