import type {
  ContourPaths,
  ContourPath,
  Vec2,
} from '../../shared/render-models';
import P from './contour-path-model.ts';
interface CanvasOptions {
  get(): ContourPaths | null;
  disabled(): boolean;
  change(paths: ContourPaths, before?: ContourPaths): void;
  ring(index: number): void;
  say(message: string): void;
  undo(): void;
  redo(): void;
}
export function createContourCanvas(
  options: CanvasOptions,
  document: Document,
) {
  const namespace = 'http://www.w3.org/2000/svg',
    element = document.createElement('div');
  element.className = 'contour-canvas';
  const svg = document.createElementNS(namespace, 'svg');
  svg.id = 'frame-contour-canvas';
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', '轮廓绘图区');
  svg.setAttribute('tabindex', '0');
  const tools = document.createElement('div');
  tools.className = 'contour-canvas-tools';
  element.append(tools, svg);
  const selected = document.createElement('p');
  selected.id = 'frame-contour-selection';
  element.append(selected);
  let ring = 0,
    index = 0,
    view = { x: -24, y: -24, width: 1072, height: 1584 };
  let drag: {
    pointer: number;
    before: ContourPaths;
    ring: number;
    index: number;
    handle: 'point' | 'incoming' | 'outgoing';
    start: Vec2;
    pan?: typeof view;
  } | null = null;
  const pathOf = (paths: ContourPaths, r = ring): ContourPath =>
    P.rings(paths)[r] || [];
  function node<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string | number>,
  ) {
    const element = document.createElementNS(namespace, tag);
    for (const [key, value] of Object.entries(attributes))
      element.setAttribute(key, String(value));
    return element;
  }
  const controls: HTMLButtonElement[] = [];
  function button(text: string, id: string, fn: () => void) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.id = id;
    b.onclick = () => {
      if (!b.disabled)
        try {
          fn();
        } catch (e) {
          options.say(e instanceof Error ? e.message : String(e));
        }
    };
    tools.append(b);
    controls.push(b);
    return b;
  }
  function edit(fn: (path: ContourPath) => void) {
    const source = options.get();
    if (!source || options.disabled() || !P.rings(source).length) return;
    const next = structuredClone(source);
    fn(pathOf(next));
    options.change(next, source);
    refresh();
  }
  button('在线段中间加点', 'frame-contour-point-add', () =>
    edit((path) => {
      const paths = options.get()!;
      if (P.rings(paths).reduce((n, p) => n + p.length, 0) >= 4096)
        throw Error('最多保留 4096 个曲线锚点');
      P.split(path, index);
      index++;
    }),
  );
  button('删除选点', 'frame-contour-point-delete', () =>
    edit((path) => {
      if (path.length <= 3) throw Error('至少保留 3 个锚点');
      path.splice(index, 1);
      index = Math.min(index, path.length - 1);
    }),
  );
  button('平滑曲线', 'frame-contour-point-smooth', () =>
    edit((path) => P.smooth(path, index)),
  );
  button('尖角', 'frame-contour-point-corner', () =>
    edit((path) => {
      delete path[index].incoming;
      delete path[index].outgoing;
    }),
  );
  button('适合画幅', 'frame-contour-fit', () => {
    view = { x: -24, y: -24, width: 1072, height: 1584 };
    refresh();
  });
  const hint = document.createElement('p');
  hint.textContent =
    '拖动锚点和手柄；Shift 吸附 8 像素；滚轮缩放，空白处拖动平移；方向键微调，Delete 删除。';
  element.append(hint);
  function coordinates(event: MouseEvent): Vec2 {
    const matrix = svg.getScreenCTM();
    if (!matrix) throw Error('轮廓画布尚未就绪');
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [p.x, p.y];
  }
  function refresh() {
    const paths = options.get();
    svg.setAttribute(
      'viewBox',
      `${view.x} ${view.y} ${view.width} ${view.height}`,
    );
    for (const control of controls)
      control.disabled = options.disabled() || !paths || !P.rings(paths).length;
    svg.setAttribute('aria-disabled', String(options.disabled() || !paths));
    svg.replaceChildren();
    if (!paths) {
      selected.textContent = '未选择边框';
      return;
    }
    ring = Math.max(0, Math.min(ring, P.rings(paths).length - 1));
    const path = pathOf(paths);
    index = Math.max(0, Math.min(index, path.length - 1));
    svg.append(
      node('rect', {
        x: 0,
        y: 0,
        width: 1024,
        height: 1536,
        fill: '#20272e',
        stroke: '#626e7a',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    const rings = P.rings(paths);
    svg.append(
      node('path', {
        d: rings.map(P.pathData).join(' '),
        fill: '#b89d6166',
        'fill-rule': 'evenodd',
        stroke: 'none',
      }),
    );
    for (let i = 0; i < rings.length; i++)
      svg.append(
        node('path', {
          d: P.pathData(rings[i]),
          fill: 'none',
          stroke: i === ring ? '#80e4ee' : '#91a3b4',
          'stroke-width': i === ring ? 2 : 1,
          'vector-effect': 'non-scaling-stroke',
          'data-ring': i,
        }),
      );
    const width = svg.getBoundingClientRect?.().width || 300,
      radius = (6 * view.width) / Math.max(100, width);
    function marker(
      p: Vec2,
      knot: number,
      handle: 'point' | 'incoming' | 'outgoing',
      active: boolean,
    ) {
      const attributes = {
        'data-knot': knot,
        'data-handle': handle,
        'data-ring': ring,
      };
      svg.append(
        node('circle', {
          cx: p[0],
          cy: p[1],
          r: radius * 1.8,
          fill: 'transparent',
          ...attributes,
        }),
      );
      svg.append(
        node('circle', {
          cx: p[0],
          cy: p[1],
          r: radius * (handle === 'point' ? 1 : 0.75),
          fill: active ? '#ffcb79' : handle === 'point' ? '#e7f4ff' : '#80e4ee',
          stroke: '#20272e',
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke',
          ...attributes,
        }),
      );
    }
    const knot = path[index];
    if (!knot) {
      selected.textContent = '空轮廓：可导入路径或选择预设重新开始';
      return;
    }
    for (const key of ['incoming', 'outgoing'] as const)
      if (knot[key]) {
        const p = knot[key];
        svg.append(
          node('line', {
            x1: knot.point[0],
            y1: knot.point[1],
            x2: p[0],
            y2: p[1],
            stroke: '#80e4ee',
            'stroke-width': 1,
            'vector-effect': 'non-scaling-stroke',
          }),
        );
        marker(p, index, key, false);
      }
    path.forEach((n, i) => marker(n.point, i, 'point', i === index));
    selected.textContent = `${ring ? '窗口 ' + ring : '外轮廓'} · 锚点 ${index + 1}/${path.length} · ${knot.point.map((v) => v.toFixed(1)).join(', ')}`;
    svg.dataset.selectedRing = String(ring);
    svg.dataset.selectedKnot = String(index);
  }
  svg.onpointerdown = (event) => {
    if (event.button !== 0 || options.disabled() || !options.get()) return;
    const target = (event.target as Element).closest?.('[data-ring]'),
      r = target?.getAttribute('data-ring');
    if (r !== null && r !== undefined) {
      ring = Number(r);
      options.ring(ring);
    }
    const k = target?.getAttribute('data-knot'),
      handle = target?.getAttribute('data-handle');
    if (k !== null && k !== undefined) index = Number(k);
    svg.focus();
    svg.setPointerCapture(event.pointerId);
    drag = {
      pointer: event.pointerId,
      before: structuredClone(options.get()!),
      ring,
      index,
      handle: handle === 'incoming' || handle === 'outgoing' ? handle : 'point',
      start: coordinates(event),
      ...(k === null || k === undefined ? { pan: { ...view } } : {}),
    };
    event.preventDefault();
    event.stopPropagation();
    refresh();
  };
  svg.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.pointer || options.disabled()) return;
    const p = coordinates(event);
    if (drag.pan) {
      // Convert current screen displacement with the original scale, avoiding
      // feedback from the changing viewBox while dragging a stationary pointer.
      const delta: Vec2 = [p[0] - drag.start[0], p[1] - drag.start[1]];
      view = { ...view, x: view.x - delta[0], y: view.y - delta[1] };
      refresh();
      return;
    }
    const next = structuredClone(drag.before),
      path = pathOf(next, drag.ring),
      step = event.shiftKey ? 8 : 0.1;
    const position: Vec2 = [
      Math.round(p[0] / step) * step,
      Math.round(p[1] / step) * step,
    ];
    if (drag.handle === 'point') {
      position[0] = Math.max(0, Math.min(1024, position[0]));
      position[1] = Math.max(0, Math.min(1536, position[1]));
      P.move(path, drag.index, position);
    } else
      path[drag.index][drag.handle] = [
        Math.max(-8192, Math.min(8192, position[0])),
        Math.max(-8192, Math.min(8192, position[1])),
      ];
    options.change(next);
    refresh();
    event.preventDefault();
    event.stopPropagation();
  };
  svg.onpointerup = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const before = drag.before,
      pan = drag.pan;
    drag = null;
    if (svg.hasPointerCapture(event.pointerId))
      svg.releasePointerCapture(event.pointerId);
    if (
      !pan &&
      options.get() &&
      JSON.stringify(before) !== JSON.stringify(options.get())
    )
      options.change(options.get()!, before);
    event.preventDefault();
    event.stopPropagation();
    refresh();
  };
  svg.onpointercancel = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const before = drag.before,
      pan = drag.pan;
    drag = null;
    if (!pan) options.change(before);
    refresh();
  };
  svg.onlostpointercapture = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const before = drag.before,
      pan = drag.pan;
    drag = null;
    if (!pan) options.change(before);
    refresh();
  };
  svg.onwheel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const point = coordinates(event),
      scale = Math.max(
        0.125,
        Math.min(4, (view.width / 1072) * Math.exp(event.deltaY * 0.0015)),
      ),
      ratio = (scale * 1072) / view.width;
    view = {
      x: point[0] + (view.x - point[0]) * ratio,
      y: point[1] + (view.y - point[1]) * ratio,
      width: 1072 * scale,
      height: 1584 * scale,
    };
    refresh();
  };
  svg.onkeydown = (event) => {
    if (options.disabled()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) options.redo();
      else options.undo();
      return;
    }
    if (event.key === 'Escape' && drag) {
      const before = drag.before;
      drag = null;
      options.change(before);
      refresh();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      try {
        edit((path) => {
          if (path.length <= 3) throw Error('至少保留 3 个锚点');
          path.splice(index, 1);
        });
      } catch (e) {
        options.say(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const deltas: Record<string, Vec2> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      },
      delta = deltas[event.key];
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      edit((path) => {
        const p = path[index].point,
          s = event.shiftKey ? 10 : 1;
        P.move(path, index, [
          Math.max(0, Math.min(1024, p[0] + delta[0] * s)),
          Math.max(0, Math.min(1536, p[1] + delta[1] * s)),
        ]);
      });
    }
  };
  return {
    element,
    refresh,
    selectRing(value: number) {
      ring = value;
      index = 0;
      refresh();
    },
    reset() {
      drag = null;
      ring = index = 0;
      view = { x: -24, y: -24, width: 1072, height: 1584 };
      refresh();
    },
  };
}
