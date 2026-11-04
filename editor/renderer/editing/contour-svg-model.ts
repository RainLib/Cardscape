import type { ContourPath, Vec2 } from '../../shared/render-models';
import P from './contour-path-model.ts';
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const numeric = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/;
const equal = (a: Vec2, b: Vec2) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.000001;
/** SVG endpoint-to-center arc conversion follows SVG 2 Appendix B. */
function arc(
  start: Vec2,
  end: Vec2,
  rx: number,
  ry: number,
  degrees: number,
  large: number,
  sweep: number,
) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (equal(start, end)) return [];
  if (!rx || !ry) return [{ end }];
  const phi = (degrees * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi),
    dx = (start[0] - end[0]) / 2,
    dy = (start[1] - end[1]) / 2,
    x = c * dx + s * dy,
    y = -s * dx + c * dy;
  const scale = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
  if (scale > 1) {
    rx *= scale;
    ry *= scale;
  }
  const numerator = rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x,
    denominator = rx * rx * y * y + ry * ry * x * x;
  const factor =
      (large === sweep ? -1 : 1) *
      Math.sqrt(Math.max(0, numerator / denominator)),
    cx = (factor * rx * y) / ry,
    cy = (-factor * ry * x) / rx;
  const center: Vec2 = [
    c * cx - s * cy + (start[0] + end[0]) / 2,
    s * cx + c * cy + (start[1] + end[1]) / 2,
  ];
  const theta = Math.atan2((y - cy) / ry, (x - cx) / rx),
    endAngle = Math.atan2((-y - cy) / ry, (-x - cx) / rx);
  let delta = endAngle - theta;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  const segments = Math.ceil(Math.abs(delta) / (Math.PI / 4)),
    step = delta / segments;
  const point = (t: number): Vec2 => [
    center[0] + rx * c * Math.cos(t) - ry * s * Math.sin(t),
    center[1] + rx * s * Math.cos(t) + ry * c * Math.sin(t),
  ];
  const tangent = (t: number): Vec2 => [
    -rx * c * Math.sin(t) - ry * s * Math.cos(t),
    -rx * s * Math.sin(t) + ry * c * Math.cos(t),
  ];
  return Array.from({ length: segments }, (_, i) => {
    const a = theta + i * step,
      b = a + step,
      k = (4 / 3) * Math.tan(step / 4),
      p = point(a),
      q = i === segments - 1 ? end : point(b),
      u = tangent(a),
      v = tangent(b);
    return {
      end: q,
      c1: [p[0] + k * u[0], p[1] + k * u[1]] as Vec2,
      c2: [q[0] - k * v[0], q[1] - k * v[1]] as Vec2,
    };
  });
}
function parsePath(source: string): ContourPath[] {
  if (source.length > 256 * 1024) throw Error('SVG 路径超过 256 KB');
  let cursor = 0,
    command = '',
    previous = '',
    current: Vec2 = [0, 0],
    path: ContourPath | null = null,
    cubic: Vec2 | null = null,
    quadratic: Vec2 | null = null;
  const paths: ContourPath[] = [];
  const skip = () => {
    while (/[\s,]/.test(source[cursor] || '\0')) cursor++;
  };
  const number = () => {
    skip();
    const token = numeric.exec(source.slice(cursor));
    if (!token) throw Error('SVG 路径缺少数值');
    cursor += token[0].length;
    const value = Number(token[0]);
    if (!Number.isFinite(value) || Math.abs(value) > 1e7)
      throw Error('SVG 路径坐标过大');
    return value;
  };
  const flag = () => {
    skip();
    const c = source[cursor++];
    if (c !== '0' && c !== '1') throw Error('SVG 圆弧标志只能是 0 或 1');
    return Number(c);
  };
  function append(end: Vec2, c1?: Vec2, c2?: Vec2) {
    if (!path) throw Error('SVG 路径必须以 M 开始');
    if (
      equal(current, end) &&
      (!c1 || equal(current, c1)) &&
      (!c2 || equal(current, c2))
    )
      return;
    if (c1) path[path.length - 1].outgoing = c1;
    path.push({ point: end, ...(c2 ? { incoming: c2 } : {}) });
    current = end;
    if (path.length > 4096) throw Error('SVG 路径过于复杂');
  }
  function close() {
    if (!path) throw Error('SVG 闭合路径无起点');
    if (path.length > 1 && equal(path[0].point, path[path.length - 1].point)) {
      const last = path.pop()!;
      if (last.incoming) path[0].incoming = last.incoming;
    }
    if (path.some((n) => n.incoming || n.outgoing))
      while (path.length < 3) P.split(path, 0);
    if (path.length < 3) throw Error('SVG 轮廓至少需要 3 个锚点');
    current = [...path[0].point];
    paths.push(path);
    path = null;
    cubic = quadratic = null;
  }
  while (true) {
    skip();
    if (cursor >= source.length) break;
    if (/[a-zA-Z]/.test(source[cursor])) command = source[cursor++];
    else if (!command) throw Error('SVG 路径命令无效');
    const kind = command.toUpperCase(),
      relative = command !== kind,
      origin: Vec2 = [...current];
    const pair = (): Vec2 => {
      const x = number(),
        y = number();
      return [x + (relative ? origin[0] : 0), y + (relative ? origin[1] : 0)];
    };
    if (!path && paths.length && kind !== 'M' && kind !== 'Z')
      path = [{ point: [...current] }];
    if (kind === 'M') {
      if (path) throw Error('SVG 子路径需要 Z 闭合');
      current = pair();
      path = [{ point: current }];
      command = relative ? 'l' : 'L';
    } else if (kind === 'L') append(pair());
    else if (kind === 'H')
      append([number() + (relative ? origin[0] : 0), origin[1]]);
    else if (kind === 'V')
      append([origin[0], number() + (relative ? origin[1] : 0)]);
    else if (kind === 'C') {
      const a = pair(),
        b = pair(),
        end = pair();
      append(end, a, b);
      cubic = b;
    } else if (kind === 'S') {
      const a: Vec2 =
          cubic && ['C', 'S'].includes(previous)
            ? [2 * origin[0] - cubic[0], 2 * origin[1] - cubic[1]]
            : origin,
        b = pair(),
        end = pair();
      append(end, a, b);
      cubic = b;
    } else if (kind === 'Q' || kind === 'T') {
      const control: Vec2 =
          kind === 'Q'
            ? pair()
            : quadratic && ['Q', 'T'].includes(previous)
              ? [2 * origin[0] - quadratic[0], 2 * origin[1] - quadratic[1]]
              : origin,
        end = pair();
      append(end, P.mix(origin, control, 2 / 3), P.mix(end, control, 2 / 3));
      quadratic = control;
    } else if (kind === 'A') {
      const rx = number(),
        ry = number(),
        angle = number(),
        large = flag(),
        sweep = flag(),
        end = pair();
      for (const segment of arc(origin, end, rx, ry, angle, large, sweep))
        append(
          segment.end,
          'c1' in segment ? segment.c1 : undefined,
          'c2' in segment ? segment.c2 : undefined,
        );
    } else if (kind === 'Z') {
      close();
      command = '';
    } else throw Error('不支持的 SVG 路径命令：' + kind);
    if (!['C', 'S'].includes(kind)) cubic = null;
    if (!['Q', 'T'].includes(kind)) quadratic = null;
    previous = kind;
    if (paths.length > 128) throw Error('SVG 闭合路径过多');
  }
  if (path) throw Error('SVG 路径需要 Z 闭合');
  if (!paths.length) throw Error('没有可导入的闭合路径');
  return paths;
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function transform(source: string): Matrix {
  let result: Matrix = [...identity],
    end = 0;
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(pattern)) {
    if (source.slice(end, match.index).trim().replaceAll(',', ''))
      throw Error('SVG 变换无效');
    end = match.index + match[0].length;
    const values = match[2]
        .trim()
        .split(/[\s,]+/)
        .map(Number),
      kind = match[1];
    if (
      !values.length ||
      values.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e7)
    )
      throw Error('SVG 变换数值无效');
    let matrix: Matrix;
    if (kind === 'matrix' && values.length === 6) matrix = values as Matrix;
    else if (kind === 'translate' && [1, 2].includes(values.length))
      matrix = [1, 0, 0, 1, values[0], values[1] || 0];
    else if (kind === 'scale' && [1, 2].includes(values.length))
      matrix = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
    else if (kind === 'rotate' && [1, 3].includes(values.length)) {
      const angle = (values[0] * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
      matrix = [c, s, -s, c, 0, 0];
      if (values.length === 3)
        matrix = multiply(
          multiply([1, 0, 0, 1, values[1], values[2]], matrix),
          [1, 0, 0, 1, -values[1], -values[2]],
        );
    } else if ((kind === 'skewX' || kind === 'skewY') && values.length === 1) {
      const t = Math.tan((values[0] * Math.PI) / 180);
      matrix = kind === 'skewX' ? [1, 0, t, 1, 0, 0] : [1, t, 0, 1, 0, 0];
    } else throw Error('SVG 变换参数无效：' + kind);
    result = multiply(result, matrix);
  }
  if (source.slice(end).trim()) throw Error('SVG 变换无效');
  return result;
}
function mapPath(path: ContourPath, m: Matrix): ContourPath {
  const point = (p: Vec2): Vec2 => [
    m[0] * p[0] + m[2] * p[1] + m[4],
    m[1] * p[0] + m[3] * p[1] + m[5],
  ];
  return path.map((n) => ({
    point: point(n.point),
    ...(n.incoming ? { incoming: point(n.incoming) } : {}),
    ...(n.outgoing ? { outgoing: point(n.outgoing) } : {}),
  }));
}
/** Keep CSS inert before the browser creates SVG nodes. Rename only actual XML
 * attribute names, never text, comments or quoted path data. XML still goes
 * through DOMParser afterwards for well-formedness and entity decoding. */
function inertXML(source: string) {
  const changes: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) break;
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end < 0) throw Error('SVG 注释未闭合');
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      if (end < 0) throw Error('SVG CDATA 未闭合');
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<?', open)) {
      if (!/^<\?xml(?:\s|\?)/.test(source.slice(open)))
        throw Error('不支持 SVG 外部样式或处理指令');
      const end = source.indexOf('?>', open + 2);
      if (end < 0) throw Error('SVG 声明未闭合');
      cursor = end + 2;
      continue;
    }
    if (source.startsWith('<!', open))
      throw Error('请移除 SVG 的 DOCTYPE 或实体声明');
    let i = open + 1;
    const closing = source[i] === '/';
    if (closing) i++;
    const tag = /^[\w:.-]+/.exec(source.slice(i));
    if (!tag) throw Error('SVG 标签无效');
    i += tag[0].length;
    const local = tag[0].split(':').at(-1)!.toLowerCase();
    if (
      !closing &&
      [
        'script',
        'style',
        'image',
        'feimage',
        'foreignobject',
        'use',
        'text',
        'audio',
        'video',
        'iframe',
        'link',
      ].includes(local)
    )
      throw Error('请先将 SVG ' + local + ' 转换为闭合路径');
    while (i < source.length) {
      while (/\s/.test(source[i] || '\0')) i++;
      if (source[i] === '>') {
        i++;
        break;
      }
      if (source[i] === '/' && source[i + 1] === '>') {
        i += 2;
        break;
      }
      const name = /^[\w:.-]+/.exec(source.slice(i));
      if (!name) throw Error('SVG 属性无效');
      const start = i;
      i += name[0].length;
      const end = i;
      if (name[0].toLowerCase().startsWith('on'))
        throw Error('SVG 轮廓不能包含事件处理属性');
      if (name[0].toLowerCase() === 'data-contour-source-style')
        throw Error('SVG 包含保留的导入属性');
      while (/\s/.test(source[i] || '\0')) i++;
      if (source[i++] !== '=') throw Error('SVG 属性缺少等号');
      while (/\s/.test(source[i] || '\0')) i++;
      const quote = source[i++];
      if (quote !== '"' && quote !== "'") throw Error('SVG 属性需要引号');
      const endValue = source.indexOf(quote, i);
      if (endValue < 0) throw Error('SVG 属性未闭合');
      if (name[0].toLowerCase() === 'style') changes.push({ start, end });
      i = endValue + 1;
    }
    cursor = i;
  }
  let result = '',
    start = 0;
  for (const change of changes) {
    result += source.slice(start, change.start) + 'data-contour-source-style';
    start = change.end;
  }
  return result + source.slice(start);
}
/** Parse inert XML only: never insert imported SVG markup into the live page. */
function parseSVG(source: string, parser: DOMParser): ContourPath[] {
  if (source.length > 1024 * 1024) throw Error('SVG 文件超过 1 MB');
  if (!source.trimStart().startsWith('<')) return parsePath(source);
  const doc = parser.parseFromString(inertXML(source), 'image/svg+xml'),
    root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror'))
    throw Error('SVG 文档无效');
  const value = (node: Element, key: string, fallback = 0) => {
    const text = node.getAttribute(key);
    if (text === null) return fallback;
    if (
      !/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(text.trim())
    )
      throw Error('SVG ' + key + ' 需要数值或 px');
    const result = Number(text.trim().replace(/px$/i, ''));
    if (!Number.isFinite(result) || Math.abs(result) > 1e7)
      throw Error('SVG ' + key + ' 数值过大');
    return result;
  };
  const box = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number) || [
    0,
    0,
    value(root, 'width', 1024),
    value(root, 'height', 1536),
  ];
  if (
    box.length !== 4 ||
    box.some((n) => !Number.isFinite(n)) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw Error('SVG viewBox 无效');
  const preserve = root.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
  let sx = 1024 / box[2],
    sy = 1536 / box[3],
    ox = 0,
    oy = 0;
  if (preserve !== 'none') {
    if (
      !/^(?:xMin|xMid|xMax)(?:YMin|YMid|YMax)(?:\s+(?:meet|slice))?$/.test(
        preserve,
      )
    )
      throw Error('SVG preserveAspectRatio 无效');
    const scale = preserve.includes('slice')
      ? Math.max(sx, sy)
      : Math.min(sx, sy);
    sx = sy = scale;
    ox =
      (1024 - box[2] * scale) *
      (preserve.includes('xMax') ? 1 : preserve.includes('xMid') ? 0.5 : 0);
    oy =
      (1536 - box[3] * scale) *
      (preserve.includes('YMax') ? 1 : preserve.includes('YMid') ? 0.5 : 0);
  }
  const matrix: Matrix = [sx, 0, 0, sy, ox - box[0] * sx, oy - box[1] * sy],
    paths: ContourPath[] = [];
  function visit(node: Element, parent: Matrix) {
    const kind = node.localName;
    if (['defs', 'title', 'desc', 'metadata'].includes(kind)) return;
    if (kind === 'svg' && node !== root)
      throw Error('请先将嵌套 SVG 展开为路径');
    const styles = new Map(
      (node.getAttribute('data-contour-source-style') || '')
        .split(';')
        .filter(Boolean)
        .map((declaration) => {
          const colon = declaration.indexOf(':');
          return [
            declaration.slice(0, colon).trim().toLowerCase(),
            declaration
              .slice(colon + 1)
              .trim()
              .toLowerCase(),
          ];
        }),
    );
    if (
      styles.get('display') === 'none' ||
      styles.get('visibility') === 'hidden' ||
      ['0', '0%'].includes(styles.get('opacity') || '')
    )
      return;
    if (
      [
        'transform',
        'transform-origin',
        'clip-path',
        'mask',
        'd',
        'x',
        'y',
        'width',
        'height',
        'cx',
        'cy',
        'r',
        'rx',
        'ry',
      ].some((key) => styles.has(key))
    )
      throw Error('请先将 SVG 的几何样式转换为路径属性');
    if (
      node.getAttribute('display') === 'none' ||
      node.getAttribute('visibility') === 'hidden'
    )
      return;
    if (node.hasAttribute('clip-path') || node.hasAttribute('mask'))
      throw Error('请先把 SVG 裁剪和蒙版转换为路径');
    const next = multiply(
      parent,
      transform(node.getAttribute('transform') || ''),
    );
    let data = '';
    if (kind === 'path') data = node.getAttribute('d') || '';
    else if (kind === 'polygon')
      data = 'M' + (node.getAttribute('points') || '') + 'Z';
    else if (kind === 'rect') {
      const x = value(node, 'x'),
        y = value(node, 'y'),
        w = value(node, 'width'),
        h = value(node, 'height'),
        rawRx = value(node, 'rx', value(node, 'ry')),
        rawRy = value(node, 'ry', rawRx),
        rx = Math.min(w / 2, rawRx),
        ry = Math.min(h / 2, rawRy);
      if (w <= 0 || h <= 0 || rx < 0 || ry < 0) throw Error('SVG 矩形尺寸无效');
      data =
        rx && ry
          ? `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`
          : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
    } else if (kind === 'circle' || kind === 'ellipse') {
      const x = value(node, 'cx'),
        y = value(node, 'cy'),
        rx = value(node, kind === 'circle' ? 'r' : 'rx'),
        ry = kind === 'circle' ? rx : value(node, 'ry');
      if (rx <= 0 || ry <= 0) throw Error('SVG 椭圆尺寸无效');
      data = `M${x + rx},${y}A${rx},${ry} 0 1 1 ${x - rx},${y}A${rx},${ry} 0 1 1 ${x + rx},${y}Z`;
    } else if (kind !== 'svg' && kind !== 'g')
      throw Error('请先将 SVG ' + kind + ' 转换为闭合路径');
    if (data)
      for (const path of parsePath(data)) paths.push(mapPath(path, next));
    if (kind === 'g' || kind === 'svg')
      for (const child of Array.from(node.children)) visit(child, next);
    if (paths.length > 128) throw Error('SVG 闭合路径过多');
  }
  visit(root, matrix);
  if (!paths.length) throw Error('SVG 中没有闭合轮廓');
  return paths;
}
export default { parsePath, parseSVG, transform, multiply, mapPath };
