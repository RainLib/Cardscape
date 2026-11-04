import type { CardDocument } from '../../shared/document';
import type {
  CardContour,
  ContourPaths,
  FrameStyle,
  Vec2,
} from '../../shared/render-models';
import model from './frame-model.ts';
import P from './contour-path-model.ts';
import SVG from './contour-svg-model.ts';
import B from './contour-boolean-model.ts';
import { createContourCanvas } from './contour-canvas.ts';
interface ContourEditorOptions {
  edit(label: string, change: (document: CardDocument) => void): void;
  say(message: string): void;
  status(message: string): void;
  refresh(): void;
  setContour(document: CardDocument, contour: CardContour | undefined): void;
}
/** Draft edits never mutate the card. Applying is one undoable transaction. */
export function createFrameContourEditor(
  options: ContourEditorOptions,
  document: Document,
) {
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
  const element = document.createElement('details');
  element.id = 'frame-contour-editor';
  const summary = document.createElement('summary');
  summary.textContent = '异形卡体与窗口';
  element.append(summary);
  const option = (text: string, value: string) => {
    const el = document.createElement('option');
    el.textContent = text;
    el.value = value;
    return el;
  };
  const select = (id: string, label: string, items: [string, string][]) => {
    const el = document.createElement('select');
    el.id = id;
    el.setAttribute('aria-label', label);
    for (const [name, value] of items) el.add(option(name, value));
    return el;
  };
  const button = (id: string, text: string) => {
    const el = document.createElement('button');
    el.id = id;
    el.type = 'button';
    el.textContent = text;
    return el;
  };
  const preset = select('frame-contour-preset', '轮廓预设', [
    ['选择轮廓预设…', ''],
    ['椭圆窗口', 'oval'],
    ['盾形卡体', 'shield'],
    ['双窗口卡体', 'double'],
  ]);
  const target = select('frame-contour-target', '画布编辑轮廓', []),
    windowIndex = select('frame-contour-window-index', '当前窗口', []);
  const outerPoints = document.createElement('textarea'),
    windowPoints = document.createElement('textarea');
  outerPoints.id = 'frame-contour-outline';
  windowPoints.id = 'frame-contour-window';
  outerPoints.rows = windowPoints.rows = 5;
  outerPoints.setAttribute('aria-label', '卡体外轮廓坐标');
  windowPoints.setAttribute('aria-label', '窗口轮廓坐标');
  const tolerance = document.createElement('input');
  tolerance.id = 'frame-contour-tolerance';
  tolerance.type = 'number';
  tolerance.min = '.25';
  tolerance.max = '32';
  tolerance.step = '.25';
  tolerance.setAttribute('aria-label', '曲线采样误差像素');
  const precision = document.createElement('label');
  precision.textContent = '曲线采样误差（像素）';
  precision.append(tolerance);
  const note = document.createElement('p');
  note.id = 'frame-contour-note';
  note.setAttribute('role', 'status');
  const undo = button('frame-contour-draft-undo', '撤销草稿'),
    redo = button('frame-contour-draft-redo', '重做草稿'),
    apply = button('frame-contour-apply', '应用轮廓'),
    reset = button('frame-contour-reset', '恢复默认卡体'),
    windowAdd = button('frame-contour-window-add', '增加窗口'),
    windowRemove = button('frame-contour-window-remove', '删除窗口'),
    regionRemove = button('frame-contour-region-remove', '删除当前实体');
  let paths: ContourPaths | null = null,
    sourceKey = '',
    original = '',
    disabled = true,
    currentWindow = 0,
    currentRegion = 0;
  const active = (value: ContourPaths) =>
    currentRegion ? value.islands?.[currentRegion - 1] || value : value;
  const offset = () =>
    paths
      ? P.regions(paths)
          .slice(0, currentRegion)
          .reduce((n, r) => n + 1 + r.windows.length, 0)
      : 0;
  function selectGlobal(index: number) {
    if (!paths) return;
    let start = 0;
    for (const [i, r] of P.regions(paths).entries()) {
      if (index < start + 1 + r.windows.length) {
        currentRegion = i;
        if (index > start) currentWindow = index - start - 1;
        return;
      }
      start += 1 + r.windows.length;
    }
  }
  const past: ContourPaths[] = [],
    future: ContourPaths[] = [];
  function remember(before: ContourPaths | null, next: ContourPaths) {
    if (before && JSON.stringify(before) !== JSON.stringify(next)) {
      past.push(structuredClone(before));
      if (past.length > 80) past.shift();
      future.length = 0;
    }
  }
  function change(next: ContourPaths, before: ContourPaths | null = paths) {
    remember(before, next);
    paths = next;
    show();
  }
  function undoDraft() {
    if (paths && past.length) {
      future.push(structuredClone(paths));
      paths = past.pop()!;
      show();
    }
  }
  function redoDraft() {
    if (paths && future.length) {
      past.push(structuredClone(paths));
      paths = future.pop()!;
      show();
    }
  }
  const canvas = createContourCanvas(
    {
      get: () => paths,
      disabled: () => disabled,
      change: (next, before) => {
        if (before) remember(before, next);
        paths = next;
        show();
      },
      ring(index) {
        target.value = String(index);
        selectGlobal(index);
        show();
      },
      say: options.say,
      undo: undoDraft,
      redo: redoDraft,
    },
    document,
  );
  const coordinates = document.createElement('details'),
    coordinateTitle = document.createElement('summary');
  coordinateTitle.textContent = '锚点坐标';
  coordinates.append(coordinateTitle);
  const coordinateNote = document.createElement('p');
  coordinateNote.textContent =
    '每行 X,Y，画幅 1024×1536。手动修改坐标会将该条轮廓改为折线；曲线请在画布拖动手柄。';
  coordinates.append(
    coordinateNote,
    document.createTextNode('卡体外轮廓'),
    outerPoints,
    windowIndex,
    windowPoints,
  );
  const importGroup = document.createElement('details'),
    importTitle = document.createElement('summary');
  importTitle.textContent = '导入 SVG／路径与布尔';
  importGroup.append(importTitle);
  const importText = document.createElement('textarea');
  importText.id = 'frame-contour-svg';
  importText.rows = 5;
  importText.setAttribute('aria-label', '导入 SVG 或路径');
  const importTarget = select('frame-contour-import-target', '路径导入目标', [
    ['所有实体、窗口与岛屿', 'all'],
    ['并集：添加实体', 'union'],
    ['相减：挖空实体', 'difference'],
    ['交集：保留重叠', 'intersection'],
    ['异或：切换重叠', 'xor'],
    ['仅外轮廓', 'outline'],
    ['当前窗口', 'window'],
  ]);
  const importButton = button('frame-contour-import', '导入到草稿');
  const file = document.createElement('input');
  file.id = 'frame-contour-file';
  file.type = 'file';
  file.accept = '.svg,image/svg+xml';
  file.setAttribute('aria-label', '选择 SVG 轮廓文件');
  const importNote = document.createElement('p');
  importNote.textContent =
    '支持闭合 SVG 路径、矩形、椭圆和多边形，保留曲线手柄。按嵌套奇偶规则识别实体和窗口；布尔结果会采样成折线，可撤销。默认按 SVG viewBox 居中适合画幅；先检查草稿，再应用。';
  importGroup.append(importNote, file, importText, importTarget, importButton);
  element.append(
    preset,
    target,
    canvas.element,
    undo,
    redo,
    precision,
    note,
    windowAdd,
    windowRemove,
    regionRemove,
    coordinates,
    importGroup,
    apply,
    reset,
  );
  const controls = [
    preset,
    target,
    windowIndex,
    outerPoints,
    windowPoints,
    tolerance,
    windowAdd,
    windowRemove,
    regionRemove,
    importText,
    importTarget,
    importButton,
    file,
    apply,
    reset,
  ];
  const pointText = (points: Vec2[]) =>
      points.map((p) => p.join(',')).join('\n'),
    knotText = (path: ContourPaths['outline'] = []) =>
      pointText(path.map((n) => n.point));
  function readPoints(text: string): Vec2[] {
    return text
      .trim()
      .split(/\n+/)
      .map((line) => {
        const values = line
          .trim()
          .split(/[,，\s]+/)
          .map(Number);
        if (values.length !== 2 || values.some((n) => !Number.isFinite(n)))
          throw Error('每行需要两个坐标：X,Y');
        return [values[0], values[1]];
      });
  }
  function stash() {
    if (!paths) return;
    const next = structuredClone(paths);
    if (outerPoints.value !== knotText(active(paths).outline))
      active(next).outline = P.linear(readPoints(outerPoints.value));
    if (
      active(paths).windows[currentWindow] &&
      windowPoints.value !== knotText(active(paths).windows[currentWindow])
    )
      active(next).windows[currentWindow] = P.linear(
        readPoints(windowPoints.value),
      );
    if (JSON.stringify(next) !== JSON.stringify(paths)) {
      remember(paths, next);
      paths = next;
    }
  }
  function show() {
    for (const control of controls) control.disabled = disabled || !paths;
    undo.disabled = disabled || !past.length;
    redo.disabled = disabled || !future.length;
    if (!paths) {
      canvas.refresh();
      note.textContent = '';
      return;
    }
    currentRegion = Math.max(
      0,
      Math.min(currentRegion, P.regions(paths).length - 1),
    );
    currentWindow = Math.max(
      0,
      Math.min(currentWindow, active(paths).windows.length - 1),
    );
    const selected = Number(target.value) || 0;
    const targets: HTMLOptionElement[] = [];
    let ringIndex = 0;
    for (const [i, r] of P.regions(paths).entries()) {
      targets.push(
        option(i ? `实体 ${i + 1} 外轮廓` : '卡体外轮廓', String(ringIndex++)),
      );
      r.windows.forEach((_, j) =>
        targets.push(
          option(`实体 ${i + 1} 窗口 ${j + 1}`, String(ringIndex++)),
        ),
      );
    }
    target.replaceChildren(...targets);
    target.value = String(Math.max(0, Math.min(selected, ringIndex - 1)));
    windowIndex.replaceChildren(
      ...active(paths).windows.map((_, i) =>
        option('窗口 ' + (i + 1), String(i)),
      ),
    );
    windowIndex.value = String(currentWindow);
    outerPoints.value = knotText(active(paths).outline);
    windowPoints.value = knotText(active(paths).windows[currentWindow]);
    windowPoints.disabled = windowIndex.disabled =
      disabled || !active(paths).windows.length;
    windowAdd.disabled =
      disabled || !active(paths).outline.length || P.rings(paths).length >= 128;
    windowRemove.disabled = disabled || !active(paths).windows.length;
    regionRemove.disabled = disabled || !P.regions(paths).length;
    tolerance.value = String(paths.tolerance);
    element.dataset.draftDirty = String(JSON.stringify(paths) !== original);
    try {
      const value = model.validateContour(P.compile(paths)),
        count = P.rings(value).reduce((sum, p) => sum + p.length, 0);
      note.textContent = `${count}/4096 个渲染点 · ${P.regions(paths).length} 个实体 · ${P.rings(paths).length}/128 环 · 应用后更新卡片`;
      note.setAttribute('data-invalid', 'false');
    } catch (e) {
      note.textContent = '草稿未应用：' + message(e);
      note.setAttribute('data-invalid', 'true');
    }
    canvas.refresh();
  }
  function attempt(fn: () => void) {
    try {
      fn();
    } catch (e) {
      options.say(message(e));
      options.status(message(e));
    }
  }
  undo.onclick = undoDraft;
  redo.onclick = redoDraft;
  outerPoints.onchange = windowPoints.onchange = () =>
    attempt(() => {
      stash();
      show();
    });
  windowIndex.onchange = () =>
    attempt(() => {
      const next = Number(windowIndex.value);
      stash();
      currentWindow = next;
      target.value = String(offset() + next + 1);
      canvas.selectRing(offset() + next + 1);
      show();
    });
  target.onchange = () =>
    attempt(() => {
      stash();
      const ring = Number(target.value);
      selectGlobal(ring);
      canvas.selectRing(ring);
      show();
    });
  tolerance.onchange = () => {
    if (paths && tolerance.validity.valid)
      change({ ...structuredClone(paths), tolerance: Number(tolerance.value) });
  };
  windowAdd.onclick = () =>
    attempt(() => {
      stash();
      if (
        !paths ||
        !active(paths).outline.length ||
        P.rings(paths).length >= 128
      )
        return;
      const next = structuredClone(paths);
      active(next).windows.push(
        P.linear([
          [300, 500],
          [700, 500],
          [700, 1000],
          [300, 1000],
        ]),
      );
      currentWindow = active(next).windows.length - 1;
      change(next);
      target.value = String(offset() + currentWindow + 1);
      canvas.selectRing(offset() + currentWindow + 1);
    });
  windowRemove.onclick = () =>
    attempt(() => {
      stash();
      if (!paths || !active(paths).windows.length) return;
      const next = structuredClone(paths);
      active(next).windows.splice(currentWindow, 1);
      currentWindow = 0;
      change(next);
      target.value = String(offset());
      canvas.selectRing(offset());
    });
  preset.onchange = () =>
    attempt(() => {
      const kind = preset.value;
      if (!kind) return;
      const outline: Vec2[] =
        kind === 'shield'
          ? [
              [512, 0],
              [1024, 180],
              [1000, 1100],
              [512, 1536],
              [24, 1100],
              [0, 180],
            ]
          : [
              [48, 0],
              [976, 0],
              [1024, 48],
              [1024, 1488],
              [976, 1536],
              [48, 1536],
              [0, 1488],
              [0, 48],
            ];
      const windows: Vec2[][] =
        kind === 'double'
          ? [
              [
                [100, 120],
                [924, 120],
                [924, 680],
                [100, 680],
              ],
              [
                [100, 800],
                [924, 800],
                [924, 1400],
                [100, 1400],
              ],
            ]
          : kind === 'shield'
            ? [
                [
                  [512, 120],
                  [900, 260],
                  [876, 1020],
                  [512, 1340],
                  [148, 1020],
                  [124, 260],
                ],
              ]
            : [
                [
                  [100, 120],
                  [924, 120],
                  [924, 1400],
                  [100, 1400],
                ],
              ];
      const next = P.fromContour({ outline, windows });
      if (kind === 'oval')
        next.windows = [
          SVG.parsePath(
            'M912 720 A400 570 0 1 1 112 720 A400 570 0 1 1 912 720Z',
          )[0],
        ];
      currentWindow = currentRegion = 0;
      change(next);
      target.value = '0';
      canvas.selectRing(0);
      preset.value = '';
    });
  regionRemove.onclick = () =>
    attempt(() => {
      stash();
      if (!paths) return;
      const next = structuredClone(paths),
        remaining = P.regions(next).filter((_, i) => i !== currentRegion);
      next.outline = remaining[0]?.outline || [];
      next.windows = remaining[0]?.windows || [];
      if (remaining.length > 1) next.islands = remaining.slice(1);
      else delete next.islands;
      currentRegion = currentWindow = 0;
      change(next);
      target.value = '0';
      canvas.selectRing(0);
    });
  function importPaths(text: string) {
    if (!paths) return;
    stash();
    const imported = SVG.parseSVG(text, new DOMParser()),
      next = structuredClone(paths);
    if (importTarget.value === 'all') {
      const classified = B.classify(imported, next.tolerance);
      delete next.islands;
      Object.assign(next, classified);
      currentRegion = 0;
    } else if (
      ['union', 'difference', 'intersection', 'xor'].includes(
        importTarget.value,
      )
    ) {
      const operand = B.classify(imported, next.tolerance);
      const result = P.fromContour(
        B.operate(
          P.compile(next),
          P.compile(operand),
          importTarget.value as 'union' | 'difference' | 'intersection' | 'xor',
        ),
      );
      delete next.islands;
      Object.assign(next, result);
      currentRegion = 0;
    } else {
      if (imported.length !== 1) throw Error('当前导入目标只接受一条闭合路径');
      if (importTarget.value === 'outline') active(next).outline = imported[0];
      else {
        if (!active(next).windows[currentWindow]) throw Error('请先增加窗口');
        active(next).windows[currentWindow] = imported[0];
      }
    }
    model.validateContour(P.compile(next));
    currentWindow = 0;
    change(next);
    canvas.selectRing(Number(target.value) || 0);
  }
  importButton.onclick = () => attempt(() => importPaths(importText.value));
  file.onchange = async () => {
    const picked = file.files?.[0],
      token = sourceKey;
    file.value = '';
    if (!picked) return;
    if (picked.size > 1024 * 1024) {
      options.say('SVG 文件超过 1 MB');
      return;
    }
    try {
      const text = await picked.text();
      if (token !== sourceKey) {
        options.say('工程已切换，请重新选择 SVG');
        return;
      }
      importText.value = text;
      importPaths(text);
    } catch (e) {
      options.say(message(e));
    }
  };
  apply.onclick = () =>
    attempt(() => {
      stash();
      if (!paths) return;
      const value = structuredClone(model.validateContour(P.compile(paths)));
      options.edit('修改异形卡体', (doc) => options.setContour(doc, value));
      options.refresh();
    });
  reset.onclick = () => {
    options.edit('恢复默认卡体', (doc) => options.setContour(doc, undefined));
    sourceKey = '';
    options.refresh();
  };
  function refresh(style: FrameStyle | null, token: string, locked: boolean) {
    disabled = locked || !style;
    if (!style) {
      paths = null;
      sourceKey = '';
      past.length = future.length = 0;
      canvas.reset();
      show();
      return;
    }
    const key = JSON.stringify([
      token,
      style.contour ?? [style.width, style.corner, style.shape],
    ]);
    if (key !== sourceKey) {
      sourceKey = key;
      paths = P.fromContour(
        style.contour || {
          outline: model.contour(style),
          windows: [model.contour(style, style.width)],
        },
      );
      original = JSON.stringify(paths);
      past.length = future.length = 0;
      currentWindow = currentRegion = 0;
      target.value = '0';
      canvas.reset();
    }
    show();
  }
  return { element, refresh };
}
