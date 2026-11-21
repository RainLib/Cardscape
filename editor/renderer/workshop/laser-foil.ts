import type {
  LaserFoilSettings,
  Material,
  ParticleInput,
} from '../../shared/visual-components';

const style = 'laser-foil';
const maxOverlays = 3;

// Pattern order is the shader's numeric contract. Presets can reuse any pattern.
const patterns = [
  ['plain', '基础虹膜', 'dots'],
  ['cosmos', '宇宙泡纹', 'dots'],
  ['sunburst', '日冕放射', 'dots'],
  ['silk', '丝绸波纹', 'bokeh'],
  ['crystal', '冰晶切面', 'sparks'],
  ['pastel', '淡彩光谱', 'bokeh'],
  ['kintsugi', '金缮裂纹', 'dots'],
  ['sakura', '樱花箔印', 'petals'],
  ['frost', '冰霜结晶', 'snow'],
  ['aurora', '极光帘', 'dots'],
  ['shatter', '碎玻璃', 'sparks'],
  ['neon', '霓虹故障', 'sparks'],
  ['inferno', '熔火薄膜', 'embers'],
  ['lightning', '电弧闪纹', 'sparks'],
  ['grating', '衍射光栅', 'sparks'],
  ['contours', '等高线箔', 'bokeh'],
  ['mercury', '水银波纹', 'bokeh'],
] as const;

const tones = [
  ['auto', '自动色温', '#b6d7ff', '#ffe6a9'],
  ['gold', '金箔', '#c88224', '#fff1b2'],
  ['silver', '冰银', '#839cb7', '#effaff'],
  ['prism', '紫金', '#b080e1', '#ffe6a6'],
  ['rose', '玫瑰金', '#cf777d', '#ffe0d7'],
  ['neon', '青洋红', '#60edff', '#ff86de'],
  ['copper', '余烬铜', '#de6e36', '#ffcc8b'],
  ['obsidian', '黑铬', '#464958', '#c4d3e9'],
  ['custom', '自定义', '#b6d7ff', '#ffe6a9'],
] as const;

const signatures = [
  ['off', '关闭'],
  ['auto', '亮部星光'],
  ['star', '脉冲星芒与光环'],
  ['streak', '横向光迹'],
] as const;
const particleOptions = [
  ['auto', '随纹样'],
  ['dots', '光点'],
  ['petals', '花瓣'],
  ['snow', '雪花'],
  ['embers', '余烬'],
  ['sparks', '火花'],
  ['bokeh', '散景'],
  ['off', '关闭'],
] as const;

const defaults: LaserFoilSettings = {
  pattern: 'cosmos',
  tone: 'auto',
  signature: 'auto',
  particles: 'auto',
  protectSubject: true,
  rainbow: 1,
  foil: 1,
  glare: 1,
  sparkle: 1,
};

function settings(value: Partial<LaserFoilSettings> = {}): LaserFoilSettings {
  return { ...defaults, ...value };
}

// Estimate the dominant and accent hues from a small, downsampled source.
function suggest(
  pixels: ArrayLike<number>,
  imageWidth: number,
  imageHeight: number,
) {
  const midtones = new Float64Array(36),
    accents = new Float64Array(36);
  let light = 0,
    count = 0,
    best = -0.1,
    anchor: [number, number] | undefined;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue;
    const [r, g, b] = [
      pixels[i]! / 255,
      pixels[i + 1]! / 255,
      pixels[i + 2]! / 255,
    ];
    const value = Math.max(r, g, b),
      chroma = value - Math.min(r, g, b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    light += luma;
    count++;
    const x = (((i / 4) % imageWidth) + 0.5) / imageWidth,
      y = (Math.floor(i / 4 / imageWidth) + 0.5) / imageHeight;
    if (x > 0.04 && x < 0.96 && y > 0.04 && y < 0.96 && luma > 0.57) {
      const separation =
        0.18 * chroma + 0.04 * (1 - Math.hypot(x - 0.52, y - 0.45));
      if (luma + separation > best) {
        best = luma + separation;
        anchor = [x, y];
      }
    }
    if (chroma < 0.035 || chroma < 0.34 * value) continue;
    const hue =
      value === r
        ? (g - b) / chroma
        : value === g
          ? 2 + (b - r) / chroma
          : 4 + (r - g) / chroma;
    const bin = Math.floor((hue + 6) * 6) % 36;
    if (value >= 0.15 && value < 0.75) midtones[bin]! += 1;
    if (value >= 0.5) accents[bin]! += chroma;
  }
  const peak = (bins: Float64Array, fallback: number, omit = -100) => {
    let result = fallback,
      strength = 0;
    for (let i = 0; i < bins.length; i++) {
      const hue = i * 10 + 5,
        distance = Math.abs(hue - omit) % 360;
      if (omit >= 0 && Math.min(distance, 360 - distance) <= 30) continue;
      const weight =
        bins[i]! + 0.46 * (bins[(i + 35) % 36]! + bins[(i + 1) % 36]!);
      if (weight > strength) [result, strength] = [hue, weight];
    }
    return result;
  };
  const dominant = peak(midtones, 230),
    accent = peak(accents, 45, dominant);
  const mean = light / Math.max(count, 1);
  const pattern =
    dominant >= 170 && dominant <= 290 && mean < 0.45
      ? 'cosmos'
      : (dominant <= 70 || dominant >= 330) && mean > 0.45
        ? 'sunburst'
        : mean > 0.6
          ? 'crystal'
          : 'silk';
  const tone =
    accent >= 20 && accent <= 80
      ? 'gold'
      : accent >= 170 && accent <= 260
        ? 'silver'
        : accent >= 280 || accent < 20
          ? 'rose'
          : 'prism';
  const palette = tones.find(([id]) => id === tone)!;
  return { pattern, tone, color: palette[2], accent: palette[3], anchor };
}

const profiles: [string, string, string, string, Partial<LaserFoilSettings>][] = [
  [
    'collector',
    '全息镭射 · 收藏箔',
    'cosmos',
    'gold',
    { rainbow: 1.1, sparkle: 1.1 },
  ],
  ['plain', '镭射 · 基础虹膜', 'plain', 'silver', { rainbow: 1.2 }],
  [
    'sunburst',
    '镭射 · 日冕放射',
    'sunburst',
    'gold',
    { rainbow: 0.9, foil: 1.35, glare: 1.1, sparkle: 0.9 },
  ],
  ['silk', '镭射 · 丝绸波纹', 'silk', 'silver', { glare: 0.9 }],
  ['crystal', '镭射 · 冰晶切面', 'crystal', 'silver', { sparkle: 1.3 }],
  [
    'rainbow',
    '镭射 · 淡彩光谱',
    'pastel',
    'silver',
    { rainbow: 1.1, sparkle: 1.6 },
  ],
  [
    'kintsugi',
    '镭射 · 金缮裂纹',
    'kintsugi',
    'gold',
    { rainbow: 1.1, foil: 1.2, glare: 1.1, sparkle: 0.9 },
  ],
  ['sakura', '镭射 · 樱花箔印', 'sakura', 'rose', { rainbow: 1.1, glare: 0.9 }],
  [
    'frost',
    '镭射 · 冰霜结晶',
    'frost',
    'silver',
    { rainbow: 1.1, glare: 1.1, sparkle: 1.4 },
  ],
  [
    'aurora',
    '镭射 · 极光帘',
    'aurora',
    'silver',
    { rainbow: 1.2, foil: 0.9, glare: 0.9 },
  ],
  [
    'shatter',
    '镭射 · 碎玻璃',
    'shatter',
    'silver',
    { rainbow: 1.2, glare: 1.15, sparkle: 1.1 },
  ],
  ['neon', '镭射 · 霓虹故障', 'neon', 'neon', { rainbow: 1.2, sparkle: 1.2 }],
  [
    'inferno',
    '镭射 · 熔火薄膜',
    'inferno',
    'copper',
    { rainbow: 1.2, foil: 1.1 },
  ],
  [
    'lightning',
    '镭射 · 电弧闪纹',
    'lightning',
    'silver',
    { rainbow: 1.1, glare: 1.1, sparkle: 1.1 },
  ],
  ['grating', '镭射 · 衍射光栅', 'grating', 'prism', { sparkle: 0.75 }],
  ['contours', '镭射 · 等高线箔', 'contours', 'obsidian', { glare: 0.85 }],
  ['mercury', '镭射 · 水银波纹', 'mercury', 'silver', { foil: 1.3 }],
  [
    'cosmic-kintsugi',
    '镭射叠加 · 星云金缮',
    'cosmos',
    'gold',
    {
      overlays: [
        { pattern: 'kintsugi', strength: 0.6 },
        { pattern: 'contours', strength: 0.35 },
      ],
    },
  ],
  [
    'aurora-crystal',
    '镭射叠加 · 极光冰晶',
    'aurora',
    'silver',
    {
      overlays: [
        { pattern: 'crystal', strength: 0.68 },
        { pattern: 'frost', strength: 0.4 },
      ],
    },
  ],
  [
    'neon-glass',
    '镭射叠加 · 霓虹碎镜',
    'neon',
    'neon',
    {
      overlays: [
        { pattern: 'shatter', strength: 0.64 },
        { pattern: 'grating', strength: 0.4 },
      ],
      signature: 'streak',
    },
  ],
];

const presets = profiles.map(([id, name, pattern, tone, overrides]) => {
  const palette = tones.find(([key]) => key === tone)!;
  return {
    id: 'material-laser-' + id,
    name,
    recipe: {
      enabled: true,
      style,
      target: 'artwork',
      backgroundMode: 'overlay',
      color: palette[2],
      accent: palette[3],
      strength: 1,
      speed: 0.26,
      frequency: 4,
      laser: settings({ pattern, tone, ...overrides }),
    } satisfies Partial<Material>,
  };
});

function validate(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('镭射材质参数无效');
  const v = settings(value as Partial<LaserFoilSettings>);
  if (
    !patterns.some(([id]) => id === v.pattern) ||
    !tones.some(([id]) => id === v.tone) ||
    !signatures.some(([id]) => id === v.signature) ||
    !particleOptions.some(([id]) => id === v.particles) ||
    typeof v.protectSubject !== 'boolean' ||
    ![v.rainbow, v.foil, v.glare, v.sparkle].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 2,
    )
  )
    throw Error('镭射材质参数无效');
  if (
    v.overlays !== undefined &&
    (!Array.isArray(v.overlays) ||
      v.overlays.length > maxOverlays ||
      v.overlays.some(
        (overlay) =>
          !overlay ||
          !patterns.some(([id]) => id === overlay.pattern) ||
          !Number.isFinite(overlay.strength) ||
          overlay.strength < 0 ||
          overlay.strength > 1,
      ))
  )
    throw Error('镭射叠加纹样参数无效');
  if (
    v.signatureAnchor !== undefined &&
    (!Array.isArray(v.signatureAnchor) ||
      v.signatureAnchor.length !== 2 ||
      !v.signatureAnchor.every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
  )
    throw Error('镭射亮点坐标无效');
}

function uniforms(material: Material) {
  const v = settings(material.laser);
  const id = (i: number) =>
    patterns.findIndex(([key]) => key === v.overlays?.[i]?.pattern);
  const gain = (i: number) => v.overlays?.[i]?.strength ?? 0;
  return {
    controls: [v.rainbow, v.foil, v.glare, v.sparkle] as const,
    mode: [
      patterns.findIndex(([id]) => id === v.pattern),
      v.tone === 'auto' ? 1 : 0,
      signatures.findIndex(([id]) => id === v.signature),
      +v.protectSubject,
    ] as const,
    overlays: [id(0), id(1), id(2)] as const,
    overlayGains: [gain(0), gain(1), gain(2)] as const,
    anchor: v.signatureAnchor || ([-1, -1] as const),
  };
}

const ambient: Record<string, ParticleInput> = {
  dots: { visual: 'dust', size: 0.016, count: 23, opacity: 0.48, spread: 0.46 },
  petals: {
    visual: 'flower',
    size: 0.06,
    count: 18,
    color: '#f49abd',
    palette: 'solid',
  },
  snow: {
    visual: 'snow',
    size: 0.05,
    count: 27,
    color: '#daedff',
    palette: 'solid',
  },
  embers: {
    visual: 'ember',
    size: 0.048,
    count: 24,
    color: '#ff9d52',
    palette: 'solid',
  },
  sparks: { visual: 'glimmer', size: 0.046, count: 22 },
  bokeh: { visual: 'orb', size: 0.07, count: 15, opacity: 0.45 },
};

function particles(material?: Partial<Material>): ParticleInput | undefined {
  if (
    !material?.enabled ||
    material.style !== style ||
    (material.strength ?? 0) <= 0
  )
    return undefined;
  const v = settings(material.laser);
  const id =
    v.particles === 'auto'
      ? patterns.find(([key]) => key === v.pattern)?.[2] || 'dots'
      : v.particles;
  const recipe = ambient[id];
  if (!recipe || id === 'off') return undefined;
  return {
    enabled: true,
    placement: 'behind',
    trajectory: 'halo',
    radius: 0.07,
    lifetime: 7,
    speed: 0.065,
    z: -0.08,
    spread: 0.32,
    opacity: 0.62,
    color: material.accent || '#ffe6a9',
    palette: 'solid',
    ...recipe,
  };
}

export default {
  style,
  maxOverlays,
  suggest,
  patterns,
  tones,
  signatures,
  particleOptions,
  presets,
  settings,
  validate,
  uniforms,
  particles,
};
