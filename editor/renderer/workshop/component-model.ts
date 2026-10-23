import type { CardLayer } from '../../shared/document';
import type { CharacterPlacement } from '../../shared/character';
import type {
  Material,
  Particles,
  ParticleInput,
  Reveal,
  Emitter,
  EmissionGeometry,
  Adjustments,
  ComponentSource,
  ResolvedEmitter,
  EmitterResult,
  ParticlePlacement,
  NumericOutput,
  VisualOutput,
  HaloPath,
} from '../../shared/visual-components';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
/* Shared visual components. All distances are card-local units (width = 1). */
import importedCardRuntime from '../rendering/runtime-core.ts';
import importedCardSpatial from '../rendering/spatial-model.ts';

const api = (() => {
  'use strict';
  const materialStyles = [
    'iridescent',
    'holographic',
    'foil',
    'prism',
    'gold',
    'ink',
    'copper',
    'steel',
    'goldprism',
    'blackprism',
    'cosmic',
    'glass',
    'fire',
    'water',
    'rays',
    'refraction',
    'psychedelic',
    'foilmetallic',
    'goldmetallic',
    'gildedprism',
    'glasscircuits',
    'wakandanglass',
    'galacticstorm',
    'bananas',
    'symbiote',
    'circuits',
    'frosted',
    'raysrainbow',
    'caustics',
    'rayspurple',
  ];
  const particleVisuals = [
    'dust',
    'glimmer',
    'krackle',
    'streak',
    'ember',
    'snow',
    'confetti',
    'diamond',
    'bubble',
    'sprite',
    'orb',
    'mixed',
    'tech',
    'banana',
    'pixel',
    'heart',
    'leaf',
    'tone',
    'shard',
    'cosmic',
    'wakanda',
    'flower',
    'paw',
    'pizza',
    'starcore',
    'adamantium',
  ];
  const materialDefaults: Material = {
    schema: 'card-material/1',
    enabled: false,
    style: 'iridescent',
    target: 'both',
    strength: 0.3,
    speed: 0.25,
    frequency: 4,
    color: '#78cfff',
    accent: '#fa8dde',
    backgroundMode: 'overlay',
  };
  const particleDefaults: import('../../shared/visual-components').ParticleSettings =
    {
      schema: 'card-particles/1',
      enabled: false,
      count: 64,
      lifetime: 3,
      speed: 0.25,
      spread: 0.5,
      size: 0.012,
      color: '#ffcb79',
      seed: 1,
      z: -0.08,
      visual: 'dust',
      palette: 'solid',
      stretch: 1,
      blend: 'add',
      sprite: '',
      spriteTint: false,
      trajectory: 'outward',
      radius: 0.06,
      opacity: 1,
      placement: 'behind',
    };
  const revealDefaults: Reveal = {
    enabled: false,
    duration: 0.24,
    count: 44,
    size: 0.025,
    travel: 0.18,
    stretch: 8,
    visual: 'streak',
    only: false,
    profile: 'burst',
    stagger: 0,
  };
  function reveal(v: Partial<Reveal> = {}): Reveal {
    return { ...revealDefaults, ...v };
  }
  const imageStyles = [
    'environment',
    'texture',
    'foil',
    'pattern',
    'illustration',
  ];
  const range = (n: unknown, a: number, b: number): n is number =>
      typeof n === 'number' && Number.isFinite(n) && n >= a && n <= b,
    color = (x: unknown) =>
      typeof x === 'string' && /^#[a-fA-F0-9]{6}$/.test(x);
  function material(v: Partial<Material> = {}): Material {
    return { ...materialDefaults, ...v };
  }
  // The active scene is already described by the editor context. A bound material
  // may also carry a complete source document and decoded rasters for rendering.
  // Forward its editable configuration and identity, without duplicating pixels.
  function materialContext(v: Partial<Material> | null | undefined) {
    if (!v) return v;
    const result: Record<string, unknown> = Object.fromEntries(
      Object.keys(materialDefaults).map((k) => [
        k,
        v[k] ?? materialDefaults[k],
      ]),
    );
    if (v.document)
      result.sourceScene = {
        id: v.document.id,
        name: v.document.name,
        layerIds: (v.document.layers || []).map((l) => l.id),
        hasImages: hasMaterialImages(v),
      };
    return result;
  }
  function hasMaterialImages(value: Partial<Material> | null | undefined) {
    return !!value?.document?.layers?.some(
      (l) =>
        l.visible !== false &&
        !l.previewReference &&
        l.kind !== 'frame' &&
        (l.src ||
          value.layerRasters?.[l.id] ||
          l.titleArt?.variants?.some((v) => v.src)),
    );
  }
  function materialDepth(layer: Pick<CardLayer, 'spatial'> | null | undefined) {
    return (
      -0.08 + Math.max(-0.12, Math.min(0.05, Number(layer?.spatial?.z) || 0))
    );
  }
  const regionDefaults: EmissionGeometry = {
    shape: 'point',
    u: 0.5,
    v: 0.5,
    width: 0.25,
    height: 0.25,
    direction: 'outward',
    angle: 0,
    layerId: '',
  };
  const emitterDefaults: Emitter = {
    ...regionDefaults,
    shape: 'perimeter',
    width: 1,
    height: 1,
    target: 'card',
    regionId: '',
    side: 'both',
  };
  function emitter(v: Partial<Emitter> = {}): Emitter {
    return { ...emitterDefaults, ...v };
  }
  function particles(v: ParticleInput = {}): Particles {
    // Keep input key order: resource identity and saved JSON depend on it.
    return {
      ...particleDefaults,
      ...v,
      reveal: reveal(v.reveal),
      ...(v.palette === 'gold' ? { color: '#ffcb79' } : {}),
      ...(v.emitter ? { emitter: emitter(v.emitter) } : {}),
    } as Particles;
  }
  function softHalo(v: ParticleInput = {}) {
    const p = particles(v);
    return particles({
      ...p,
      enabled: true,
      trajectory: 'halo',
      radius: 0.055,
      opacity: Math.min(p.opacity, 0.65),
      count: Math.min(p.count, 32),
      size: Math.min(
        p.size,
        ['bubble', 'krackle', 'orb'].includes(p.visual) ? 0.042 : 0.016,
      ),
      speed: Math.min(p.speed, 0.055),
      spread: 0.5,
      lifetime: Math.max(p.lifetime, 6),
      stretch: Math.min(p.stretch, 3),
      emitter: emitter(p.emitter || { target: 'frame' }),
    });
  }
  function validateRegion(value: unknown): void {
    if (!record(value)) throw Error('发射区域参数无效');
    const v = value;
    if (
      !v ||
      !(
        typeof v.shape === 'string' &&
        ['point', 'rect', 'ellipse', 'perimeter'].includes(v.shape)
      ) ||
      !range(v.u, 0, 1) ||
      !range(v.v, 0, 1) ||
      !range(v.width, 0.001, 1) ||
      !range(v.height, 0.001, 1) ||
      !(
        typeof v.direction === 'string' &&
        ['outward', 'up', 'angle'].includes(v.direction)
      ) ||
      !range(v.angle, -180, 180) ||
      typeof v.layerId !== 'string' ||
      String(v.layerId).length > 100
    )
      throw Error('发射区域参数无效');
  }
  function validateEmitter(value: unknown): void {
    if (!record(value)) throw Error('粒子发射绑定无效');
    const v = value;
    validateRegion(v);
    if (
      !(
        typeof v.target === 'string' &&
        ['card', 'frame', 'back', 'layer'].includes(v.target)
      ) ||
      typeof v.regionId !== 'string' ||
      String(v.regionId).length > 100 ||
      !(
        typeof v.side === 'string' && ['both', 'front', 'back'].includes(v.side)
      )
    )
      throw Error('粒子发射绑定无效');
    if (v.target === 'layer' && !v.layerId) throw Error('请选择发射源图层');
  }
  function validateMaterial(value: unknown): void {
    if (!record(value)) throw Error('外观材质组件参数无效');
    const v = value;
    if (
      !v ||
      v.schema !== 'card-material/1' ||
      typeof v.enabled !== 'boolean' ||
      !(typeof v.style === 'string' && materialStyles.includes(v.style)) ||
      !(
        typeof v.target === 'string' &&
        ['background', 'artwork', 'front', 'back', 'both'].includes(v.target)
      ) ||
      (v.backgroundMode !== undefined &&
        !(
          typeof v.backgroundMode === 'string' &&
          ['overlay', 'replace'].includes(v.backgroundMode)
        )) ||
      !range(v.strength, 0, 1) ||
      !range(v.speed, 0, 3) ||
      !range(v.frequency, 1, 20) ||
      !color(v.color) ||
      !color(v.accent)
    )
      throw Error('外观材质组件参数无效');
  }
  function validateSprite(src: unknown) {
    if (typeof src !== 'string' || src.length > 1500000)
      throw Error('粒子 PNG 过大');
    if (/^[\w/-]+\.png$/.test(src) && !src.split('/').includes('..')) return;
    if (!src.startsWith('data:image/png;base64,'))
      throw Error('粒子贴图必须为 PNG');
    let b;
    try {
      b = atob(src.slice(22, 66));
    } catch {
      throw Error('粒子 PNG 无效');
    }
    if (b.length < 24 || b.charCodeAt(0) !== 137 || b.slice(1, 4) !== 'PNG')
      throw Error('粒子 PNG 无效');
    const n = (i: number) =>
      b.charCodeAt(i) * 16777216 +
      (b.charCodeAt(i + 1) << 16) +
      (b.charCodeAt(i + 2) << 8) +
      b.charCodeAt(i + 3);
    if (n(16) < 1 || n(20) < 1 || n(16) > 512 || n(20) > 512)
      throw Error('粒子贴图最长边为 512px');
  }
  function validateParticles(value: unknown): void {
    if (!record(value)) throw Error('粒子组件参数无效');
    const v = value;
    if (
      !v ||
      v.schema !== 'card-particles/1' ||
      typeof v.enabled !== 'boolean' ||
      !Number.isInteger(v.count) ||
      !range(v.count, 1, 256) ||
      !range(v.lifetime, 0.3, 12) ||
      !range(v.speed, 0, 2) ||
      !range(v.spread, 0, 2) ||
      !range(v.size, 0.002, 0.08) ||
      !color(v.color) ||
      !Number.isInteger(v.seed) ||
      !range(v.seed, 1, 65535) ||
      !range(v.z, -0.5, 0.5)
    )
      throw Error('粒子组件参数无效');
    if (v.reveal !== undefined && !record(v.reveal))
      throw Error('揭示闪光参数无效');
    if (v.emitter !== undefined && !record(v.emitter))
      throw Error('粒子发射绑定无效');
    const p = particles(v as ParticleInput);
    if (
      !particleVisuals.includes(p.visual) ||
      !['solid', 'gold', 'rainbow'].includes(p.palette) ||
      !range(p.stretch, 1, 8)
    )
      throw Error('粒子外观参数无效');
    if (
      !['behind', 'front', 'surface'].includes(p.placement) ||
      !['add', 'normal'].includes(p.blend) ||
      typeof p.spriteTint !== 'boolean'
    )
      throw Error('粒子混合方式无效');
    if (
      !['outward', 'halo', 'float', 'field'].includes(p.trajectory) ||
      !range(p.radius, 0, 0.2) ||
      !range(p.opacity, 0, 1)
    )
      throw Error('粒子轨迹或强度无效');
    const r = p.reveal;
    if (
      typeof r.enabled !== 'boolean' ||
      typeof r.only !== 'boolean' ||
      !['streak', 'source'].includes(r.visual) ||
      !['burst', 'trails'].includes(r.profile) ||
      !range(r.stagger, 0, 0.8) ||
      !range(r.duration, 0.08, 2) ||
      !Number.isInteger(r.count) ||
      !range(r.count, 1, 128) ||
      !range(r.size, 0.002, 0.08) ||
      !range(r.travel, 0, 3) ||
      !range(r.stretch, 1, 12)
    )
      throw Error('揭示闪光参数无效');
    if (p.sprite) validateSprite(p.sprite);
    if (p.visual === 'sprite' && !p.sprite) throw Error('请先导入粒子 PNG');
    if (v.emitter) validateEmitter(emitter(v.emitter as Partial<Emitter>));
  }
  function adjustments(a: Adjustments = {}, b: Adjustments = {}) {
    return {
      brightness: Math.max(
        -100,
        Math.min(100, (a.brightness || 0) + (b.brightness || 0)),
      ),
      contrast: Math.max(
        -100,
        Math.min(
          100,
          ((1 + (a.contrast || 0) / 100) * (1 + (b.contrast || 0) / 100) - 1) *
            100,
        ),
      ),
      saturation: Math.min(
        200,
        ((a.saturation ?? 100) * (b.saturation ?? 100)) / 100,
      ),
      gamma: Math.max(0.2, Math.min(3, (a.gamma ?? 1) * (b.gamma ?? 1))),
    };
  }
  function validate(doc: ComponentSource): void {
    if (doc.material) validateMaterial(doc.material);
    if (doc.particles) validateParticles(doc.particles);
    if (doc.emissionRegions) {
      if (
        !Array.isArray(doc.emissionRegions) ||
        doc.emissionRegions.length > 32
      )
        throw Error('最多保存32个发射区域');
      const ids = new Set<string>();
      for (const raw of doc.emissionRegions as unknown[]) {
        validateRegion(raw);
        if (
          !record(raw) ||
          typeof raw.id !== 'string' ||
          !raw.id ||
          raw.id.length > 100 ||
          ids.has(raw.id) ||
          typeof raw.name !== 'string' ||
          !raw.name.trim() ||
          raw.name.length > 100 ||
          (raw.layerId && !(doc.layers || []).some((l) => l.id === raw.layerId))
        )
          throw Error('发射区域名称或图层无效');
        ids.add(raw.id);
      }
    }
  }
  function source(
    doc: ComponentSource = {},
    target = 'card',
  ): ComponentSource | null {
    if (target === 'back')
      return doc.assetKind === 'back'
        ? doc
        : doc.backScene?.document || doc.backScene || null;
    if (target === 'frame')
      return doc.assetKind === 'frame'
        ? doc
        : doc.componentScenes?.frame?.document || doc;
    return doc;
  }
  function resolveEmitter(
    value: ParticleInput | null | undefined,
    doc: ComponentSource = {},
  ): EmitterResult {
    const e = emitter(value?.emitter),
      d = source(doc, e.target);
    if (!d) return { ok: false, reason: '未选择卡背，请先组合卡背' };
    const region = e.regionId
      ? d.emissionRegions?.find((r) => r.id === e.regionId)
      : null;
    if (e.regionId && !region)
      return { ok: false, reason: '绑定的发射区域不存在，请重新选择' };
    const geometry = { ...e, ...region },
      layer = geometry.layerId
        ? (d.layers || []).find((l) => l.id === geometry.layerId)
        : null;
    if (geometry.layerId && !layer)
      return { ok: false, reason: '发射源图层不存在，请重新选择' };
    if (e.target === 'layer' && !geometry.layerId)
      return { ok: false, reason: '请选择发射源图层' };
    if (layer && layer.visible === false)
      return { ok: false, reason: '发射源图层已隐藏' };
    return {
      ok: true,
      geometry,
      document: d,
      layer,
      reverse: e.target === 'back' && doc.assetKind !== 'back',
      target: e.target,
      frameDepth: doc.frameStyle?.depth ?? 26,
    };
  }
  function placementFor(resolved: ResolvedEmitter): ParticlePlacement {
    const { document: d, layer: l } = resolved;
    let p: CharacterPlacement = { x: 0, y: 0, scale: 1, rotation: 0 },
      z = ['frame', 'back'].includes(resolved.target) ? 0.045 : 0,
      registration = 1;
    if (l) {
      const R = importedCardRuntime,
        S = importedCardSpatial;
      p = R.placement(d, l);
      if (l.kind !== 'frame') {
        const s = S.resolve(d, l);
        z = s.z + (p.z ?? 0);
        registration = S.enabled(d)
          ? (S.camera(d) - z) / (S.camera(d) - 0.045)
          : 1;
      }
    }
    return { ...p, rotation: p.rotation ?? 0, z, registration };
  }
  function mapEmitterPoint(
    resolved: ResolvedEmitter,
    x: number,
    y: number,
    offset = 0,
  ) {
    const p = resolved.placement || placementFor(resolved),
      c = Math.cos(p.rotation),
      s = Math.sin(p.rotation),
      scale = p.scale * p.registration;
    let qx = (p.x / 1024 + (x * c + y * s) * p.scale) * p.registration,
      qy = (-p.y / 1024 + (-x * s + y * c) * p.scale) * p.registration,
      z = p.z + offset;
    if (resolved.reverse) {
      const depth = (resolved.frameDepth ?? 26) / 1024;
      qx = -qx;
      z = 0.045 - depth - p.z - Math.abs(offset);
    }
    return { x: qx, y: qy, z, scale };
  }
  function emissionOffset(p: Pick<Particles, 'placement' | 'z'>) {
    return ['front', 'surface'].includes(p.placement) ? Math.abs(p.z) : p.z;
  }
  function hash(i: number, seed: number) {
    const x = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  // Arc-length sampling keeps the same speed across long sides and clipped corners.
  function haloPath(e: EmissionGeometry, cut = 0, radius = 0.06): HaloPath {
    const hx = e.shape === 'point' ? 0 : e.width * 0.5,
      hy = e.shape === 'point' ? 0 : e.height * 0.75;
    if (['ellipse', 'point'].includes(e.shape))
      return {
        ellipse: true,
        hx,
        hy,
        length:
          e.shape === 'point'
            ? Math.max(0.001, Math.PI * 2 * radius)
            : Math.PI *
              (3 * (hx + hy) - Math.sqrt((3 * hx + hy) * (hx + 3 * hy))),
      };
    cut = Math.max(0, Math.min(cut, hx, hy));
    const points = cut
        ? [
            -hx + cut,
            hy,
            hx - cut,
            hy,
            hx,
            hy - cut,
            hx,
            -hy + cut,
            hx - cut,
            -hy,
            -hx + cut,
            -hy,
            -hx,
            -hy + cut,
            -hx,
            hy - cut,
          ]
        : [-hx, hy, hx, hy, hx, -hy, -hx, -hy],
      segments = [];
    let length = 0;
    for (let i = 0; i < points.length; i += 2) {
      const next = (i + 2) % points.length,
        dx = points[next] - points[i],
        dy = points[next + 1] - points[i + 1],
        size = Math.hypot(dx, dy);
      if (size) {
        segments.push({
          x: points[i],
          y: points[i + 1],
          dx,
          dy,
          size,
          start: length,
        });
        length += size;
      }
    }
    return { segments, length };
  }
  function haloPoint(path: HaloPath, at: number, out: NumericOutput) {
    const position = ((at % 1) + 1) % 1;
    if (path.ellipse === true) {
      const a = position * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      out[0] = c * path.hx;
      out[1] = s * path.hy;
      const nx = path.hx ? c / path.hx : c,
        ny = path.hy ? s / path.hy : s,
        n = Math.hypot(nx, ny) || 1;
      out[2] = nx / n;
      out[3] = ny / n;
      return;
    }
    const distance = position * path.length;
    let seg = path.segments.at(-1);
    if (!seg) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return;
    }
    for (const part of path.segments)
      if (distance < part.start + part.size) {
        seg = part;
        break;
      }
    const t = (distance - seg.start) / seg.size;
    out[0] = seg.x + seg.dx * t;
    out[1] = seg.y + seg.dy * t;
    out[2] = -seg.dy / seg.size;
    out[3] = seg.dx / seg.size;
  }
  function smoothFade(t: number) {
    const a = Math.max(0, Math.min(1, t));
    return a * a * (3 - 2 * a);
  }
  // A bounded field includes the artwork and a narrow fringe. Fade at wrapped
  // edges so the position reset stays invisible; speed is in card-width units.
  function fieldPoint(
    e: EmissionGeometry,
    p: Particles,
    time: number,
    i: number,
    out: NumericOutput,
  ) {
    const hx = (e.shape === 'point' ? 0 : e.width * 0.5) + p.radius,
      hy = (e.shape === 'point' ? 0 : e.height * 0.75) + p.radius;
    const angle =
      ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180 +
      (hash(i + 13, p.seed) - 0.5) * Math.min(1, p.spread) * Math.PI;
    const speed = p.speed * (0.5 + 0.5 * hash(i + 97, p.seed)),
      wrap = (v: number) => ((v % 1) + 1) % 1;
    const u = wrap(
        hash(i + 17, p.seed) +
          (time * speed * Math.sin(angle)) / Math.max(0.001, 2 * hx),
      ),
      v = wrap(
        hash(i + 29, p.seed) +
          (time * speed * Math.cos(angle)) / Math.max(0.001, 2 * hy),
      );
    if (['ellipse', 'point'].includes(e.shape)) {
      const theta = u * Math.PI * 2,
        rad = Math.sqrt(v);
      out[0] = Math.cos(theta) * rad * hx;
      out[1] = Math.sin(theta) * rad * hy;
      out[2] = smoothFade(v / 0.08) * (1 - smoothFade((v - 0.88) / 0.12));
    } else {
      out[0] = (u - 0.5) * 2 * hx;
      out[1] = (v - 0.5) * 2 * hy;
      out[2] =
        smoothFade(u / 0.06) *
        (1 - smoothFade((u - 0.94) / 0.06)) *
        smoothFade(v / 0.06) *
        (1 - smoothFade((v - 0.94) / 0.06));
    }
    out[0] += e.u - 0.5;
    out[1] += (0.5 - e.v) * 1.5;
  }
  function sampleInto(
    value: ParticleInput,
    time: number,
    doc: ComponentSource = {},
    facing = 0,
    output: NumericOutput,
    limit = 256,
  ) {
    const p = particles(value);
    if (!p.enabled) return 0;
    const resolved = resolveEmitter(p, doc);
    if (!resolved.ok) return 0;
    resolved.placement = placementFor(resolved);
    const e = resolved.geometry;
    if (
      (e.side === 'front' && Math.cos(facing) < 0) ||
      (e.side === 'back' && Math.cos(facing) >= 0)
    )
      return 0;
    const cut =
        ['card', 'frame'].includes(e.target) &&
        e.shape === 'perimeter' &&
        e.width === 1 &&
        e.height === 1 &&
        e.u === 0.5 &&
        e.v === 0.5
          ? (resolved.document.frameStyle?.corner ?? 48) / 1024
          : 0,
      path = p.trajectory === 'halo' ? haloPath(e, cut, p.radius) : null,
      point = new Float64Array(4);
    const count = Math.min(p.count, limit, Math.floor(output.length / 7));
    for (let i = 0; i < count; i++) {
      const r = hash(i, p.seed),
        life =
          p.visual === 'adamantium' && path
            ? p.lifetime * (0.8 + 0.4 * hash(i + 467, p.seed))
            : p.lifetime,
        phase = (Math.max(0, time) / life + r) % 1,
        edge = hash(i + 379, p.seed) * 4;
      let x, y, dx, dy;
      if (edge < 1) {
        x = edge - 0.5;
        y = 0.75;
        dx = x * 0.8;
        dy = 1;
      } else if (edge < 2) {
        x = 0.5;
        y = 0.75 - (edge - 1) * 1.5;
        dx = 1;
        dy = y * 0.5;
      } else if (edge < 3) {
        x = 0.5 - (edge - 2);
        y = -0.75;
        dx = x * 0.8;
        dy = -1;
      } else {
        x = -0.5;
        y = -0.75 + (edge - 3) * 1.5;
        dx = -1;
        dy = y * 0.5;
      }
      if (e.shape === 'point') {
        x = 0;
        y = 0;
        const a = hash(i + 61, p.seed) * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a);
      } else if (e.shape === 'rect') {
        x = hash(i + 17, p.seed) - 0.5;
        y = (hash(i + 29, p.seed) - 0.5) * 1.5;
        dx = x;
        dy = y;
      } else if (e.shape === 'ellipse') {
        const a = hash(i + 61, p.seed) * Math.PI * 2,
          rad = Math.sqrt(hash(i + 29, p.seed));
        x = Math.cos(a) * rad * 0.5;
        y = Math.sin(a) * rad * 0.75;
        dx = Math.cos(a);
        dy = Math.sin(a);
      }
      x = x * e.width + e.u - 0.5;
      y = y * e.height + (0.5 - e.v) * 1.5;
      // Snap corner contour constrains only the full frame perimeter; legacy cards retain their original rectangle.
      if (
        e.target === 'frame' &&
        e.shape === 'perimeter' &&
        e.width === 1 &&
        e.height === 1
      ) {
        const cut = (resolved.document.frameStyle?.corner ?? 48) / 1024,
          excess = Math.max(0, Math.abs(x) + Math.abs(y) - (1.25 - cut));
        x -= Math.sign(x) * excess * 0.5;
        y -= Math.sign(y) * excess * 0.5;
      }
      if (e.direction !== 'outward') {
        const a =
          ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180 +
          (p.emitter ? (hash(i + 13, p.seed) - 0.5) * p.spread * Math.PI : 0);
        dx = Math.sin(a);
        dy = Math.cos(a);
      }
      const length = Math.hypot(dx, dy) || 1,
        distance = phase * (p.spread + p.speed * p.lifetime);
      let px = x + (dx / length) * distance,
        py = y + (dy / length) * distance,
        size = (0.5 + 0.5 * r) * (1 - 0.55 * phase),
        alpha = Math.sin(Math.PI * phase) ** 2;
      if (path && p.visual !== 'krackle') {
        const travel =
          (Math.max(0, time) *
            p.speed *
            (0.35 + 0.65 * hash(i + 97, p.seed)) *
            (hash(i + 113, p.seed) > 0.5 ? 1 : -1)) /
          path.length;
        const cluster = hash(i + 379, p.seed);
        haloPoint(path, cluster + travel, point);
        const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (phase + r)),
          offset =
            p.radius *
            (0.2 +
              0.8 *
                ((1 - Math.min(1, p.spread)) * 0.5 +
                  Math.min(1, p.spread) * wave));
        px = point[0] + e.u - 0.5 + point[2] * offset;
        py = point[1] + (0.5 - e.v) * 1.5 + point[3] * offset;
        dx = point[3];
        dy = -point[2];
        size = (0.6 + 0.4 * r) * (0.96 + 0.04 * Math.sin(Math.PI * 2 * phase));
        if (p.visual === 'mixed' && r > 0.82) size *= 2.5;
        if (p.visual === 'orb') size *= 0.45 + 0.55 * r;
        alpha =
          smoothFade(phase / 0.18) * (1 - smoothFade((phase - 0.65) / 0.35));
      }
      if (p.trajectory === 'float') {
        const seconds = Math.max(0, time),
          a = ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180,
          wrap = (v: number) => ((v % 1) + 1) % 1,
          u = wrap(
            hash(i + 17, p.seed) +
              seconds * p.speed * Math.sin(a) +
              p.spread * 0.06 * Math.sin(seconds * 0.7 + r * 6.283),
          ),
          v = wrap(hash(i + 29, p.seed) + seconds * p.speed * Math.cos(a));
        px = (u - 0.5) * e.width + e.u - 0.5;
        py = (v - 0.5) * e.height * 1.5 + (0.5 - e.v) * 1.5;
        if (e.shape === 'ellipse') {
          const a = u * Math.PI * 2,
            rad = Math.sqrt(v);
          px = Math.cos(a) * rad * e.width * 0.5 + e.u - 0.5;
          py = Math.sin(a) * rad * e.height * 0.75 + (0.5 - e.v) * 1.5;
        }
        if (e.shape === 'point') {
          px = e.u - 0.5 + Math.sin(seconds * 0.7 + r * 6.283) * p.radius;
          py =
            (0.5 - e.v) * 1.5 + Math.cos(seconds * 0.5 + r * 6.283) * p.radius;
        }
        size = 0.45 + 0.55 * r;
        alpha =
          smoothFade(phase / 0.15) *
          (1 - smoothFade((phase - 0.7) / 0.3)) *
          smoothFade(v / 0.08) *
          (1 - smoothFade((v - 0.92) / 0.08));
      }
      if (p.trajectory === 'field') {
        fieldPoint(e, p, Math.max(0, time), i, point);
        px = point[0];
        py = point[1];
        size = 0.45 + 0.55 * r;
        alpha =
          smoothFade(phase / 0.15) *
          (1 - smoothFade((phase - 0.7) / 0.3)) *
          point[2];
      }
      if (p.visual === 'bubble' && path) {
        // Visible official bubbles rise from the contour instead of walking around it.
        const seconds = Math.max(0, time),
          cycle = Math.floor(seconds / life + r),
          age = phase * life;
        haloPoint(path, hash(i + 379 + cycle * 137, p.seed), point);
        const offset = p.radius * (0.1 + 0.25 * hash(i + 53, p.seed)),
          a = ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180;
        dx = e.direction === 'outward' ? point[2] : Math.sin(a);
        dy = e.direction === 'outward' ? point[3] : Math.cos(a);
        const travel = age * p.speed * (0.8 + 0.4 * hash(i + 97, p.seed));
        const sideways =
          travel * point[2] * 0.35 * Math.min(1, p.spread) +
          Math.sin(age * 2.4 + r * 6.283) *
            p.radius *
            0.1 *
            Math.min(1, p.speed * 8);
        px =
          point[0] +
          e.u -
          0.5 +
          point[2] * offset +
          dx * travel +
          dy * sideways;
        py =
          point[1] +
          (0.5 - e.v) * 1.5 +
          point[3] * offset +
          dy * travel -
          dx * sideways;
        size = 0.55 + 0.9 * hash(i + 443, p.seed);
        const fringe = Math.max(
          0,
          Math.abs(px - e.u + 0.5) - e.width * 0.5,
          Math.abs(py - (0.5 - e.v) * 1.5) - e.height * 0.75,
        );
        alpha =
          smoothFade(phase / 0.1) *
          (1 - smoothFade((phase - 0.65) / 0.35)) *
          (1 -
            smoothFade(
              (fringe - p.radius * 3.5) / Math.max(0.001, p.radius * 2),
            ));
      }
      if (p.visual === 'banana' && path) {
        // Illustrated bananas grow at a contour site, spin both ways and drift locally outward.
        const seconds = Math.max(0, time),
          cycle = Math.floor(seconds / life + r),
          age = phase * life;
        haloPoint(path, hash(i + 379 + cycle * 137, p.seed), point);
        const a = ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180;
        dx = e.direction === 'outward' ? point[2] : Math.sin(a);
        dy = e.direction === 'outward' ? point[3] : Math.cos(a);
        const offset = p.radius * (0.12 + 0.2 * hash(i + 53, p.seed)),
          travel = age * p.speed * (0.65 + 0.75 * hash(i + 97, p.seed));
        const sideways =
          Math.sin(age * 2 + r * 6.283) *
          p.radius *
          0.14 *
          Math.min(1, p.spread) *
          Math.min(1, p.speed * 8);
        px =
          point[0] +
          e.u -
          0.5 +
          point[2] * offset +
          dx * travel +
          dy * sideways;
        py =
          point[1] +
          (0.5 - e.v) * 1.5 +
          point[3] * offset +
          dy * travel -
          dx * sideways;
        size =
          (0.75 + 1.5 * hash(i + 443, p.seed)) *
          (0.3 + 0.7 * smoothFade(phase / 0.2));
        const fringe = Math.max(
          0,
          Math.abs(px - e.u + 0.5) - e.width * 0.5,
          Math.abs(py - (0.5 - e.v) * 1.5) - e.height * 0.75,
        );
        alpha =
          smoothFade(phase / 0.1) *
          (1 - smoothFade((phase - 0.55) / 0.45)) *
          (1 -
            smoothFade(
              (fringe - p.radius * 3.5) / Math.max(0.001, p.radius * 2),
            ));
      }
      if (p.visual === 'diamond' && path) {
        const seconds = Math.max(0, time),
          cycle = Math.floor(seconds / life + r),
          age = phase * life;
        haloPoint(path, hash(i + 379 + cycle * 137, p.seed), point);
        const a = ((e.direction === 'up' ? 0 : e.angle) * Math.PI) / 180;
        dx = e.direction === 'outward' ? point[2] : Math.sin(a);
        dy = e.direction === 'outward' ? point[3] : Math.cos(a);
        const travel = age * p.speed * (0.65 + 0.75 * hash(i + 97, p.seed)),
          offset = p.radius * (0.08 + 0.2 * hash(i + 53, p.seed));
        px = point[0] + e.u - 0.5 + point[2] * offset + dx * travel;
        py = point[1] + (0.5 - e.v) * 1.5 + point[3] * offset + dy * travel;
        size =
          (i % 4 === 0
            ? 0.18 + 0.25 * hash(i + 443, p.seed)
            : 0.45 + 1.1 * hash(i + 443, p.seed)) *
          (0.45 + 0.55 * smoothFade(phase / 0.18));
        const fringe = Math.max(
          0,
          Math.abs(px - e.u + 0.5) - e.width * 0.5,
          Math.abs(py - (0.5 - e.v) * 1.5) - e.height * 0.75,
        );
        alpha =
          smoothFade(phase / 0.08) *
          (1 - smoothFade((phase - 0.55) / 0.45)) *
          (1 -
            smoothFade(
              (fringe - p.radius * 2) / Math.max(0.001, p.radius * 1.5),
            ));
      }
      if (p.visual === 'krackle' && path) {
        const seconds = Math.max(0, time),
          group = Math.floor(i / 3),
          birth = seconds / p.lifetime + hash(group + 201, p.seed),
          cycle = Math.floor(birth),
          age = birth - cycle,
          delay = (i % 3) * 0.1;
        const local = Math.max(0, (age - delay) / (1 - delay));
        haloPoint(path, hash(group + 379 + cycle * 137, p.seed), point);
        dx = point[3];
        dy = -point[2];
        const offset = p.radius * (0.15 + 0.72 * hash(i + 53, p.seed)),
          spacing = ((i % 3) - 1) * Math.min(0.022, p.radius * 0.32);
        const drift =
          (local - 0.5) * Math.min(p.radius * 0.2, p.speed * p.lifetime * 0.2);
        px =
          point[0] +
          e.u -
          0.5 +
          point[2] * offset +
          point[3] * (spacing + drift);
        py =
          point[1] +
          (0.5 - e.v) * 1.5 +
          point[3] * offset -
          point[2] * (spacing + drift);
        size =
          (0.2 + 1.05 * Math.pow(r, 1.4)) *
          (0.2 + 0.8 * smoothFade(local / 0.35)) *
          (1 - 0.55 * smoothFade((local - 0.45) / 0.55));
        alpha = smoothFade(local / 0.1) * (1 - smoothFade((local - 0.6) / 0.4));
      }
      if (p.visual === 'starcore' && path) {
        // Two overlapping cores and two satellites share an origin. Travel stays local.
        const seconds = Math.max(0, time),
          group = Math.floor(i / 4),
          slot = i % 4;
        const birth = seconds / p.lifetime + hash(group + 201, p.seed),
          cycle = Math.floor(birth),
          age = birth - cycle;
        const local = Math.max(0, (age - slot * 0.07) / (1 - slot * 0.07));
        haloPoint(path, hash(group + 379 + cycle * 137, p.seed), point);
        const offset = p.radius * (0.25 + 0.45 * hash(group + 53, p.seed)),
          orbit = local * 1.1 + slot * 1.9;
        const sideways = Math.cos(orbit) * p.radius * 0.28,
          normal = Math.sin(orbit) * p.radius * 0.2;
        px =
          point[0] +
          e.u -
          0.5 +
          point[2] * (offset + normal) +
          point[3] * sideways;
        py =
          point[1] +
          (0.5 - e.v) * 1.5 +
          point[3] * (offset + normal) -
          point[2] * sideways;
        dx = point[3];
        dy = -point[2];
        size =
          (r < 0.65 ? 0.55 + 0.4 * r : 0.09 + 0.15 * r) *
          (0.65 + 0.35 * smoothFade(local / 0.3));
        alpha =
          smoothFade(local / 0.14) * (1 - smoothFade((local - 0.54) / 0.46));
      }
      if (p.visual === 'cosmic' && path) {
        if (r > 0.78) {
          haloPoint(path, hash(i + 379, p.seed), point);
          const angle =
            e.direction === 'outward'
              ? -0.55 + (hash(i + 53, p.seed) - 0.5) * 0.45
              : e.direction === 'up'
                ? Math.PI / 2
                : Math.PI / 2 - (e.angle * Math.PI) / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          const travel =
            (phase - 0.5) * Math.min(p.radius * 1.2, p.speed * p.lifetime);
          px = point[0] + e.u - 0.5 + point[2] * p.radius * 0.35 + dx * travel;
          py =
            point[1] +
            (0.5 - e.v) * 1.5 +
            point[3] * p.radius * 0.35 +
            dy * travel;
          size = 0.09 + 0.05 * r;
          alpha =
            smoothFade(phase / 0.12) * (1 - smoothFade((phase - 0.65) / 0.35));
        } else {
          size = 0.75 + 0.5 * r;
          alpha =
            (0.45 +
              0.55 *
                smoothFade(phase / 0.15) *
                (1 - smoothFade((phase - 0.8) / 0.2))) *
            (0.75 + 0.25 * Math.sin(Math.max(0, time) * 0.4 + r * 6.283));
        }
      }
      if (p.visual === 'cosmic')
        size = r > 0.78 ? 0.09 + 0.05 * r : 0.75 + 0.5 * r;
      if (p.visual === 'wakanda') {
        if (path) {
          haloPoint(path, hash(i + 379, p.seed), point);
          const drift =
            (phase - 0.5) * Math.min(p.radius * 0.9, p.speed * p.lifetime);
          px =
            point[0] +
            e.u -
            0.5 +
            point[2] * p.radius * (0.2 + 0.65 * hash(i + 53, p.seed));
          py =
            point[1] +
            (0.5 - e.v) * 1.5 +
            point[3] * p.radius * (0.2 + 0.65 * hash(i + 53, p.seed)) +
            drift;
        }
        size =
          r < 0.58
            ? 0.55 + 0.55 * r
            : r < 0.82
              ? 0.18 + 0.1 * r
              : 0.3 + 0.1 * r;
        alpha =
          (r < 0.58 ? 0.8 : r < 0.82 ? 0.6 : 1) *
          smoothFade(phase / 0.12) *
          (1 - smoothFade((phase - 0.65) / 0.35));
      }
      if (['flower', 'paw', 'pizza', 'adamantium'].includes(p.visual) && path) {
        const seconds = Math.max(0, time),
          cycle = Math.floor(seconds / life + r);
        // Each birth chooses another bounded site. The phase fade hides the reset.
        haloPoint(path, hash(i + 379 + cycle * 137, p.seed), point);
        const offset =
          p.radius * (0.25 + 0.75 * hash(i + 53, p.seed)) -
          Math.min(e.width, e.height) *
            0.18 *
            Math.min(1, p.spread) *
            hash(i + 71, p.seed);
        const drift =
          (phase - 0.5) * Math.min(p.radius * 0.6, p.speed * p.lifetime);
        px = point[0] + e.u - 0.5 + point[2] * offset + point[3] * drift;
        py =
          point[1] + (0.5 - e.v) * 1.5 + point[3] * offset - point[2] * drift;
        size =
          (0.25 + 1.0 * Math.pow(r, 1.5)) *
          (0.35 + 0.65 * Math.sin(Math.PI * phase));
        alpha =
          smoothFade(phase / 0.12) * (1 - smoothFade((phase - 0.65) / 0.35));
        if (p.visual === 'adamantium') {
          // The observed emblems expand radially from inside the frame, not along it.
          const inset =
              (0.15 + 0.4 * hash(i + 71, p.seed)) * Math.min(1, p.spread),
            distance = Math.max(0.000001, Math.hypot(point[0], point[1]));
          // Observed speed quantiles favor slow emblems with a small faster tail.
          const speedSeed = hash(i + 53, p.seed),
            travel = Math.min(
              distance * inset + p.radius * 0.9,
              phase * p.speed * life * (0.47 + 0.95 * speedSeed * speedSeed),
            );
          const scale = 1 - inset + travel / distance;
          px = point[0] * scale + e.u - 0.5;
          py = point[1] * scale + (0.5 - e.v) * 1.5;
          // Keep the size seed independent of birth phase to avoid a shared breathing pulse.
          const sizeSeed = hash(i + 443, p.seed),
            large = i % 5 < 2;
          // Similar birth sizes, independent peaks, and progressively slower growth.
          const growthPhase = Math.min(
              1,
              (phase * life) /
                (p.lifetime * 0.8) /
                (large ? 1.03 - 0.27 * sizeSeed : 0.85),
            ),
            growthEase = growthPhase * (2 - growthPhase);
          size = large
            ? 1.02 *
              (0.38 + (0.2 + 0.77 * Math.pow(sizeSeed, 1.58)) * growthEase)
            : (0.045 + 0.07 * sizeSeed) * (0.36 + 0.46 * growthEase);
          // A longer fade continues radial travel instead of cutting the emblem abruptly.
          alpha =
            smoothFade(phase / 0.08) * (1 - smoothFade((phase - 0.5) / 0.5));
        }
      }
      if (p.visual === 'shard') {
        size = r > 0.84 ? 1.1 + (0.25 * (r - 0.84)) / 0.16 : 0.38 + 0.62 * r;
      }
      const q = mapEmitterPoint(resolved, px, py, emissionOffset(p)),
        k = i * 7;
      output[k] = q.x;
      output[k + 1] = q.y;
      output[k + 2] = q.z;
      output[k + 3] = p.size * q.scale * size;
      output[k + 4] = alpha * p.opacity;
      output[k + 5] =
        p.visual === 'bubble'
          ? 0
          : p.visual === 'adamantium'
            ? Math.sin(Math.max(0, time) * 0.45 + r * 6.283) * 0.22
            : p.visual === 'flower'
              ? r * 6.283 + Math.max(0, time) * 0.1
              : p.visual === 'paw'
                ? Math.sin(Math.max(0, time) * 0.7 + r * 6.283) * 0.25
                : p.visual === 'pizza'
                  ? r * 6.283 +
                    Math.max(0, time) * (0.16 + 0.1 * hash(i + 53, p.seed))
                  : p.visual === 'wakanda'
                    ? r >= 0.58 && r < 0.82
                      ? hash(i + 71, p.seed) > 0.5
                        ? Math.PI / 3
                        : -Math.PI / 3
                      : 0
                    : p.visual === 'shard'
                      ? ((r * 6.283 +
                          Math.max(0, time) *
                            (0.25 + 0.35 * hash(i + 53, p.seed)) +
                          Math.PI) %
                          (Math.PI * 2)) -
                        Math.PI
                      : p.visual === 'tone'
                        ? Math.PI / 2 + 0.12
                        : p.visual === 'pixel'
                          ? 0
                          : p.visual === 'heart'
                            ? Math.sin(Math.max(0, time) * 0.6 + r * 6.283) *
                              0.35
                            : p.visual === 'leaf'
                              ? r * 6.283 +
                                Math.max(0, time) * 0.35 +
                                Math.sin(Math.max(0, time) * 1.2 + r * 6.283) *
                                  0.4
                              : p.visual === 'banana'
                                ? r * Math.PI * 2 +
                                  phase *
                                    life *
                                    (0.25 + 3 * hash(i + 71, p.seed)) *
                                    (hash(i + 113, p.seed) > 0.5 ? 1 : -1) *
                                    Math.min(1, p.speed * 8)
                                : p.visual === 'tech'
                                  ? r * Math.PI * 2 +
                                    Math.sin(
                                      Math.max(0, time) * 0.3 + r * Math.PI * 2,
                                    ) *
                                      0.12
                                  : Math.atan2(dy, dx);
      if (['flower', 'pizza', 'banana'].includes(p.visual))
        output[k + 5] =
          ((((output[k + 5] + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
            (Math.PI * 2)) -
          Math.PI;
      output[k + 6] = r;
    }
    return count;
  }
  function sample(
    value: ParticleInput,
    time: number,
    doc: ComponentSource = {},
    facing = 0,
  ) {
    const output = new Float64Array(256 * 7),
      count = sampleInto(value, time, doc, facing, output);
    return Array.from({ length: count }, (_, i) => {
      const k = i * 7;
      return {
        x: output[k],
        y: output[k + 1],
        z: output[k + 2],
        size: output[k + 3],
        alpha: output[k + 4],
      };
    });
  }
  // The legacy seven-value layout stays intact. Shape overrides share one batch.
  function sampleCompositionInto(
    value: ParticleInput,
    time: number,
    doc: ComponentSource,
    facing: number,
    output: NumericOutput,
    visuals: VisualOutput,
    limit = 256,
    revealTime = time,
  ) {
    const p = particles(value),
      r = p.reveal,
      active = r.enabled && revealTime >= 0 && revealTime < r.duration;
    const budget = Math.max(
      0,
      Math.min(
        256,
        Math.floor(limit),
        Math.floor(output.length / 7),
        visuals.length,
      ),
    );
    const only = r.enabled && r.only,
      idleLimit = only
        ? 0
        : active
          ? Math.floor((budget * p.count) / (p.count + r.count))
          : budget;
    const idle = sampleInto(p, time, doc, facing, output, idleLimit);
    visuals.fill(-1, 0, idle);
    if (!active || !p.enabled) return idle;
    const resolved = resolveEmitter(p, doc);
    if (!resolved.ok) return idle;
    const e = resolved.geometry;
    if (
      (e.side === 'front' && Math.cos(facing) < 0) ||
      (e.side === 'back' && Math.cos(facing) >= 0)
    )
      return idle;
    resolved.placement = placementFor(resolved);
    const count = Math.min(r.count, budget - idle),
      phase = revealTime / r.duration;
    for (let i = 0; i < count; i++) {
      const seed = hash(i + 701, p.seed),
        angle = ((i + hash(i + 719, p.seed) * 0.6) / count) * Math.PI * 2;
      // Delayed short rays and fast early rays share the same seven-value layout.
      // Global duration keeps the late cohort slower despite its shorter lifetime.
      const trails = r.profile === 'trails',
        late = trails && i % 5 === 0;
      const delay = trails
        ? r.duration *
          Math.min(
            0.8,
            r.stagger *
              (late
                ? 0.8 + 0.4 * hash(i + 751, p.seed)
                : 0.12 * hash(i + 751, p.seed)),
          )
        : 0;
      const age = revealTime - delay,
        local = trails ? Math.max(0, age) / (r.duration - delay) : phase;
      const velocity = trails
        ? late
          ? 0.38 + 0.1 * hash(i + 769, p.seed)
          : 0.84 + 0.26 * hash(i + 769, p.seed)
        : 1;
      const radial =
          (late ? 0.75 : 0.15) + (late ? 0.2 : 0.75) * hash(i + 733, p.seed),
        travel =
          r.travel *
          (trails ? Math.max(0, age) / r.duration : phase) *
          velocity;
      let rx = e.width * 0.5 * radial,
        ry = e.height * 0.75 * radial;
      if (late) {
        const cx = Math.cos(angle),
          cy = Math.sin(angle),
          hx = e.width * 0.5,
          hy = e.height * 0.75;
        const distance =
          e.shape === 'point'
            ? 0
            : e.shape === 'ellipse'
              ? 1 / Math.hypot(cx / hx, cy / hy)
              : Math.min(
                  hx / Math.max(0.001, Math.abs(cx)),
                  hy / Math.max(0.001, Math.abs(cy)),
                );
        rx = ry = distance * radial;
      }
      const x = e.u - 0.5 + Math.cos(angle) * (rx + travel),
        y = (0.5 - e.v) * 1.5 + Math.sin(angle) * (ry + travel);
      const q = mapEmitterPoint(resolved, x, y, emissionOffset(p)),
        k = (idle + i) * 7;
      output[k] = q.x;
      output[k + 1] = q.y;
      output[k + 2] = q.z;
      output[k + 3] =
        r.size *
        q.scale *
        (0.65 + 0.35 * seed) *
        (1 - 0.65 * local) *
        (late ? 0.38 + 0.16 * seed : 1);
      output[k + 4] =
        age < 0 ? 0 : (0.7 + 0.3 * seed) * (1 - smoothFade(local)) * p.opacity;
      output[k + 5] = angle;
      output[k + 6] = seed;
      visuals[idle + i] =
        r.visual === 'source' ? particleVisuals.indexOf(p.visual) : 3;
    }
    return idle + count;
  }
  return {
    materialStyles,
    particleVisuals,
    validateSprite,
    materialDefaults,
    particleDefaults,
    revealDefaults,
    reveal,
    regionDefaults,
    emitterDefaults,
    imageStyles,
    material,
    materialContext,
    softHalo,
    hasMaterialImages,
    materialDepth,
    particles,
    emitter,
    source,
    resolveEmitter,
    mapEmitterPoint,
    validateRegion,
    validateEmitter,
    validateMaterial,
    validateParticles,
    validate,
    adjustments,
    haloPath,
    haloPoint,
    fieldPoint,
    sample,
    sampleInto,
    sampleCompositionInto,
  };
})();

export default api;
