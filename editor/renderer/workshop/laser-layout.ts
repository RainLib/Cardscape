import type { CardDocument, LaserLayoutFields } from '../../shared/document';
import type { FrameStyle, Vec2 } from '../../shared/render-models';

const width = 1024,
  height = 1536;
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const faces = {
  original: {
    name: '原图卡面',
    art: [0, 0, width, height],
    trim: 5,
    color: '#252431',
    accent: '#b7ab99',
    paper: '#181822',
  },
  foil: {
    name: '金属箔框',
    art: [48, 48, 928, 1440],
    trim: 32,
    color: '#59515e',
    accent: '#d4c9df',
    paper: '#27212e',
  },
  fullart: {
    name: '全图签名',
    art: [0, 0, width, height],
    trim: 9,
    color: '#303444',
    accent: '#a9b6d0',
    paper: '#111521',
  },
  gallery: {
    name: '画廊装裱',
    art: [60, 68, 904, 1248],
    trim: 13,
    color: '#8e887c',
    accent: '#ebe3d3',
    paper: '#e8dfce',
  },
  graded: {
    name: '评级收藏',
    art: [64, 242, 896, 1230],
    trim: 23,
    color: '#626c7b',
    accent: '#d6ebf0',
    paper: '#1a202b',
  },
} as const;

const defaults: LaserLayoutFields = {
  style: 'original',
  zoom: 1,
  x: 0,
  y: 0,
  title: '',
  caption: '',
  gradeLabel: '',
  grade: '',
  serial: '',
  rarity: '',
};

function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d')!;
}

function area(style: LaserLayoutFields['style']): Rect {
  const [x, y, w, h] = faces[style].art;
  return { x, y, w, h };
}

function placement(
  fields: LaserLayoutFields,
  sourceWidth: number,
  sourceHeight: number,
): Rect {
  const art = area(fields.style);
  const scale =
    Math.max(art.w / sourceWidth, art.h / sourceHeight) * fields.zoom;
  const w = sourceWidth * scale,
    h = sourceHeight * scale;
  return {
    x: art.x - ((w - art.w) * (1 - fields.x)) / 2,
    y: art.y - ((h - art.h) * (1 - fields.y)) / 2,
    w,
    h,
  };
}

function rounded(inset: number, radius: number): Vec2[] {
  const right = width - inset - radius,
    bottom = height - inset - radius,
    near = inset + radius;
  return [
    [right, near, -90],
    [right, bottom, 0],
    [near, bottom, 90],
    [near, near, 180],
  ].flatMap(([x, y, start]) =>
    Array.from({ length: 5 }, (_, i): Vec2 => {
      const radians = ((start + 22.5 * i) * Math.PI) / 180;
      return [x + radius * Math.cos(radians), y + radius * Math.sin(radians)];
    }),
  );
}

function frame(style: LaserLayoutFields['style']): Partial<FrameStyle> {
  const face = faces[style];
  return {
    name: face.name,
    shape: 'rect',
    width: face.trim,
    corner: 0,
    depth: style === 'graded' ? 32 : 8,
    bevel: style === 'graded' ? 8 : 2,
    color: face.color,
    accent: face.accent,
    finish: 'metal',
    animation: 'none',
    contour: {
      outline: rounded(0, 46),
      windows: [rounded(face.trim, 46 - face.trim).reverse()],
    },
  };
}

function compose(
  image: HTMLImageElement,
  fields: LaserLayoutFields,
  rect: Rect,
) {
  const ctx = surface(),
    face = faces[fields.style],
    art = area(fields.style);
  ctx.fillStyle = face.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(art.x, art.y, art.w, art.h);
  ctx.clip();
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  const hasLabel = [
    fields.title,
    fields.caption,
    fields.gradeLabel,
    fields.grade,
    fields.serial,
    fields.rarity,
  ].some(Boolean);
  if (!hasLabel && fields.style !== 'graded') return ctx.canvas.toDataURL();

  const gallery = fields.style === 'gallery';
  const graded = fields.style === 'graded';
  const x = gallery || graded ? 78 : 85;
  const firstLine = graded ? 124 : gallery ? 1419 : 1384;
  if (graded) {
    ctx.fillStyle = '#30394a';
    ctx.beginPath();
    ctx.roundRect(53, 58, 918, 156, 14);
    ctx.fill();
  } else if (!gallery) {
    const shade = ctx.createLinearGradient(0, 1200, 0, height);
    shade.addColorStop(0, '#10131900');
    shade.addColorStop(0.79, '#101319d6');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 1200, width, 336);
  }
  const text = (
    value: string,
    size: number,
    weight: number,
    left: number,
    y: number,
    max: number,
    align: CanvasTextAlign = 'left',
  ) => {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(value, left, y, max);
  };
  ctx.fillStyle = gallery ? '#302c27' : '#fcf6e9';
  text(fields.title, graded ? 43 : 59, 660, x, firstLine, 655);
  if (graded) text(fields.grade, 79, 720, 925, 154, 196, 'right');
  ctx.fillStyle = gallery ? '#615443' : '#d5caba';
  text(fields.caption, 26, 450, x, firstLine + 45, graded ? 630 : 855);
  const notes = graded
    ? [fields.gradeLabel, fields.rarity, fields.serial]
    : [
        fields.rarity,
        fields.serial,
        [fields.gradeLabel, fields.grade].filter(Boolean).join(' '),
      ];
  text(notes.filter(Boolean).join('  ·  '), 21, 560, x, firstLine + 77, 855);
  return ctx.canvas.toDataURL();
}

// Merge edits from the currently visible crop into the full source mask.
function sourceMask(
  live: CanvasImageSource,
  prior: HTMLImageElement | undefined,
  displayed: Rect,
  clip: Rect,
) {
  const ctx = surface();
  ctx.fillRect(0, 0, width, height);
  if (prior) ctx.drawImage(prior, 0, 0);
  const sx = width / displayed.w,
    sy = height / displayed.h;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(-displayed.x, -displayed.y);
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.drawImage(live, 0, 0);
  ctx.restore();
  return ctx.canvas;
}

function cropMask(source: CanvasImageSource, displayed: Rect, clip: Rect) {
  const ctx = surface();
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.drawImage(source, displayed.x, displayed.y, displayed.w, displayed.h);
  return ctx.canvas.toDataURL();
}

function artLayer(doc: CardDocument) {
  return doc.laserLayout
    ? doc.layers.find(
        (layer) => layer.id === doc.laserLayout!.layerId && layer.src,
      )
    : doc.layers.find(
        (layer) =>
          layer.kind === 'background' && layer.visible !== false && layer.src,
      );
}

async function build(
  doc: CardDocument,
  fields: LaserLayoutFields | null,
  load: (url: string) => Promise<HTMLImageElement>,
  liveMask?: HTMLCanvasElement,
) {
  const layer = artLayer(doc),
    current = doc.laserLayout;
  if (!layer?.src) throw Error('请先导入卡面底图');
  if (
    !current &&
    (layer.sourceWindow ||
      layer.x ||
      layer.y ||
      layer.scale !== 1 ||
      layer.rotation)
  )
    throw Error('请使用位于母版原点、缩放为 100% 的卡面底图');
  const source = current?.source || layer.src;
  const image = await load(source);
  const prior =
    current?.sourceMask && liveMask
      ? await load(current.sourceMask)
      : undefined;
  const original = { x: 0, y: 0, w: width, h: height };
  const previousFields = current ? settings(current) : null;
  const previous = previousFields
    ? placement(previousFields, image.naturalWidth, image.naturalHeight)
    : original;
  const next =
    fields && placement(fields, image.naturalWidth, image.naturalHeight);
  const mask =
    liveMask &&
    sourceMask(
      liveMask,
      prior,
      previous,
      previousFields ? area(previousFields.style) : original,
    );
  const res = {
    ...doc,
    layers: doc.layers.map((l) =>
      l.id !== layer.id
        ? l
        : {
            ...l,
            src: fields && next ? compose(image, fields, next) : source,
          },
    ),
    masks: { ...doc.masks },
    cosmetics: { ...doc.cosmetics },
  };
  if (mask)
    res.masks.subject =
      next && fields
        ? cropMask(mask, next, area(fields.style))
        : mask.toDataURL();
  if (fields) {
    res.laserLayout = {
      ...fields,
      layerId: layer.id,
      source,
      sourceMask: mask?.toDataURL(),
      previousFrame: current ? current.previousFrame : doc.frameStyle,
      previousBorder: current ? current.previousBorder : doc.cosmetics?.border,
    };
    res.frameStyle = frame(fields.style);
    res.cosmetics.border = 'custom';
  } else {
    delete res.laserLayout;
    res.frameStyle = current?.previousFrame;
    res.cosmetics.border = current?.previousBorder;
  }
  return res;
}

// Keep untrusted imported workspaces and inspector controls on the same bounds.
function settings(input: Partial<LaserLayoutFields> = {}): LaserLayoutFields {
  return {
    style:
      input.style && Object.hasOwn(faces, input.style)
        ? input.style
        : defaults.style,
    zoom: Number.isFinite(input.zoom)
      ? Math.min(2.5, Math.max(1, input.zoom!))
      : 1,
    x: Number.isFinite(input.x) ? Math.min(1, Math.max(-1, input.x!)) : 0,
    y: Number.isFinite(input.y) ? Math.min(1, Math.max(-1, input.y!)) : 0,
    title: String(input.title || '').slice(0, 64),
    caption: String(input.caption || '').slice(0, 84),
    gradeLabel: String(input.gradeLabel || '').slice(0, 32),
    grade: String(input.grade || '').slice(0, 12),
    serial: String(input.serial || '').slice(0, 32),
    rarity: String(input.rarity || '').slice(0, 24),
  };
}

export default { faces, artLayer, build, frame, settings };
