import AudioModel from '../animation/action-audio-model.ts';
import type { CardLayer } from '../../shared/document';
import type {
  CharacterPlacement,
  CharacterAction,
  CharacterPose,
  ActionParticleEvent,
  BonePose,
  ParticleWorldPose,
  ParticleVector,
} from '../../shared/character';
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
import particleWorld from '../rendering/particle-world-model.ts';
import particlePhysics from '../rendering/particle-physics-model.ts';

const api = (() => {
  'use strict';
  let defaultPhysicsCache: ReturnType<typeof particlePhysics.cache> | undefined;
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
    for (const action of doc.actions || []) {
      AudioModel.validate(action);
      if (action.particleEvents === undefined) continue;
      if (
        !Array.isArray(action.particleEvents) ||
        action.particleEvents.length > 16
      )
        throw Error('每个动作最多保存 16 组粒子事件');
      const ids = new Set<string>();
      for (const event of action.particleEvents) {
        if (
          !record(event) ||
          typeof event.id !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id) ||
          ids.has(event.id) ||
          typeof event.name !== 'string' ||
          !event.name.trim() ||
          event.name.length > 100 ||
          !range(event.at, 0, 1) ||
          !range(event.duration, 0.08, 12)
        )
          throw Error('动作粒子事件无效');
        ids.add(event.id);
        if (
          event.at * action.duration + event.duration >
          action.duration + 0.000001
        )
          throw Error('粒子事件须在动作结束前完成');
        validateParticles(event.particles);
        if (event.physics !== undefined) {
          particlePhysics.validate(event.physics);
          if (
            event.trail ||
            !['card', 'world'].includes(event.simulationSpace || 'bone')
          )
            throw Error('粒子物理需要卡牌或世界空间的普通粒子事件');
        }
        if (
          event.emissionDuration !== undefined &&
          !range(event.emissionDuration, 0, event.duration)
        )
          throw Error('粒子发射时长须在事件持续时间内');
        if (
          event.trail !== undefined &&
          (!record(event.trail) ||
            !range(event.trail.duration, 0.04, 2) ||
            !Number.isInteger(event.trail.segments) ||
            !range(event.trail.segments, 4, 64) ||
            !event.boneId)
        )
          throw Error('连续剑痕需要有效骨骼、0.04–2 秒留痕与 4–64 段网格');
        if (
          event.simulationSpace !== undefined &&
          !['bone', 'card', 'world'].includes(event.simulationSpace)
        )
          throw Error('动作粒子模拟空间无效');
        if (
          event.boneId !== undefined &&
          (typeof event.boneId !== 'string' ||
            !doc.characterRig?.bones.some((b) => b.id === event.boneId) ||
            !['card', 'layer'].includes(
              emitter(event.particles.emitter).target,
            ))
        )
          throw Error('动作粒子骨骼绑定无效');
      }
    }
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
    ignoreSide = false,
  ) {
    const p = particles(value);
    if (!p.enabled) return 0;
    const resolved = resolveEmitter(p, doc);
    if (!resolved.ok) return 0;
    resolved.placement = placementFor(resolved);
    const e = resolved.geometry;
    if (
      !ignoreSide &&
      ((e.side === 'front' && Math.cos(facing) < 0) ||
        (e.side === 'back' && Math.cos(facing) >= 0))
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
    ignoreSide = false,
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
    const idle = sampleInto(
      p,
      time,
      doc,
      facing,
      output,
      idleLimit,
      ignoreSide,
    );
    visuals.fill(-1, 0, idle);
    if (!active || !p.enabled) return idle;
    const resolved = resolveEmitter(p, doc);
    if (!resolved.ok) return idle;
    const e = resolved.geometry;
    if (
      !ignoreSide &&
      ((e.side === 'front' && Math.cos(facing) < 0) ||
        (e.side === 'back' && Math.cos(facing) >= 0))
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
  function actionParticleEvents(
    action: CharacterAction | null | undefined,
    progress: number,
  ) {
    const seconds =
      Math.max(0, Math.min(1, progress)) * (action?.duration || 1);
    return (action?.particleEvents || []).flatMap((event) => {
      const age = seconds - event.at * action!.duration;
      return event.particles.enabled && age >= 0 && age < event.duration
        ? [{ event, age }]
        : [];
    });
  }
  function sampleEventInto(
    event: ActionParticleEvent,
    age: number,
    doc: ComponentSource,
    facing: number,
    pose: CharacterPose | null | undefined,
    output: NumericOutput,
    visuals: VisualOutput,
    limit = 256,
    sampleBirth?: (
      seconds: number,
      boneId: string,
    ) => Pick<BonePose, 'matrix' | 'opacity'> | undefined,
    sampleWorld?: (seconds: number) => ParticleWorldPose,
    worldOffset = 0,
    worldCamera = doc.spatial?.cameraDistance ?? 2.7,
    worldFrames?: NumericOutput,
    physicsCache?: ReturnType<typeof particlePhysics.cache>,
  ) {
    if (!Number.isFinite(age) || age < 0 || age >= event.duration) return 0;
    const world = event.simulationSpace === 'world';
    if (world && !sampleWorld)
      throw Error('世界空间粒子需要整卡历史变换采样器');
    if (event.trail)
      return sampleTrailInto(
        event,
        age,
        doc,
        facing,
        pose,
        output,
        visuals,
        limit,
        sampleBirth,
        sampleWorld,
        worldCamera,
        worldFrames,
      );
    const count = sampleCompositionInto(
      event.particles,
      age,
      doc,
      facing,
      output,
      visuals,
      limit,
      age,
      world,
    );
    const fade = Math.min(0.12, event.duration * 0.2),
      edge = Math.max(
        0,
        Math.min(1, age / fade, (event.duration - age) / fade),
      ),
      opacity = edge * edge * (3 - 2 * edge);
    let birthIndex = 0;
    const drain =
      event.emissionDuration !== undefined &&
      ['float', 'field'].includes(event.particles.trajectory)
        ? 1 -
          Math.max(
            0,
            Math.min(
              1,
              (age - event.emissionDuration) / event.particles.lifetime,
            ),
          )
        : 1;
    for (let i = 0; i < count; i++) {
      const birth = particleBirth(
        event.particles,
        i,
        age,
        visuals[i] >= 0 ? birthIndex++ : undefined,
      );
      output[i * 7 + 4] *=
        birth < (event.emissionDuration ?? event.duration)
          ? opacity * drain
          : 0;
    }
    const applyWorld = () => {
      if (world) {
        const resolved = resolveEmitter(event.particles, doc);
        if (!resolved.ok) return 0;
        let reveal = 0;
        for (let i = 0; i < count; i++) {
          const birth = particleBirth(
            event.particles,
            i,
            age,
            visuals[i] >= 0 ? reveal++ : undefined,
          );
          const root = sampleWorld!(birth);
          if (!particleWorld.visible(root, resolved.geometry.side, worldCamera))
            output[i * 7 + 4] = 0;
          output[i * 7 + 2] += worldOffset;
          particleWorld.transform(output, i * 7, root);
        }
      }
      if (event.physics) {
        const resolved = resolveEmitter(event.particles, doc);
        if (!resolved.ok) return 0;
        const config = event.physics;
        const engine =
          physicsCache || (defaultPhysicsCache ||= particlePhysics.cache());
        const samplePhysics = engine.prepare(config);
        const temporary = new Float64Array(14);
        let reveal = 0;
        for (let i = 0; i < count; i++) {
          const revealed = visuals[i] >= 0;
          const revealIndex = revealed ? reveal++ : undefined;
          const birth = particleBirth(event.particles, i, age, revealIndex);
          const e = resolved.geometry;
          const cut =
            resolved.target === 'frame' &&
            e.shape === 'perimeter' &&
            e.width === 1 &&
            e.height === 1
              ? (resolved.document.frameStyle?.corner ?? 48) / 1024
              : 0;
          const launch = particlePhysics.launch(
            event.particles.seed,
            revealed ? 1024 + revealIndex! : i,
            e,
            config,
            cut,
          );
          const first = mapEmitterPoint(
            resolved,
            launch.position[0],
            launch.position[1],
            emissionOffset(event.particles),
          );
          const last = mapEmitterPoint(
            resolved,
            launch.position[0] + launch.velocity[0],
            launch.position[1] + launch.velocity[1],
            emissionOffset(event.particles),
          );
          temporary[0] = first.x;
          temporary[1] = first.y;
          temporary[2] = first.z;
          temporary[7] = last.x;
          temporary[8] = last.y;
          temporary[9] =
            last.z +
            (resolved.reverse ? -launch.velocity[2] : launch.velocity[2]);
          let rootPose: ParticleWorldPose | undefined;
          if (event.boneId) {
            const bone = sampleBirth?.(birth, event.boneId);
            if (!bone) {
              output[i * 7 + 4] = 0;
              continue;
            }
            const [a, b, c, d, tx, ty] = bone.matrix,
              registration = placementFor(resolved).registration;
            for (const k of [0, 7]) {
              const x = (temporary[k] / registration) * 1024 + 512,
                y = 768 - (temporary[k + 1] / registration) * 1024;
              temporary[k] = ((a * x + c * y + tx - 512) / 1024) * registration;
              temporary[k + 1] =
                (-(b * x + d * y + ty - 768) / 1024) * registration;
            }
          }
          if (world) {
            const root = (rootPose = sampleWorld!(birth));
            temporary[3] = temporary[4] = temporary[10] = temporary[11] = 1;
            particleWorld.transform(temporary, 0, root);
            particleWorld.transform(temporary, 7, root);
          }
          const p: ParticleVector = [temporary[0], temporary[1], temporary[2]];
          const v: ParticleVector = [
            temporary[7] - p[0],
            temporary[8] - p[1],
            temporary[9] - p[2],
          ];
          const state = samplePhysics(
            p,
            v,
            Math.max(0, age - birth),
            Math.max(0, event.duration - birth),
          );
          if (rootPose && worldOffset)
            particleWorld.frame(temporary, 0, rootPose);
          for (let axis = 0; axis < 3; axis++)
            output[i * 7 + axis] =
              state.position[axis] +
              (rootPose && worldOffset
                ? temporary[axis] * worldOffset * rootPose.root[3]
                : 0);
          if (!state.alive) output[i * 7 + 4] = 0;
          if (Math.hypot(state.velocity[0], state.velocity[1]) > 1e-7)
            output[i * 7 + 5] = Math.atan2(
              state.velocity[1],
              state.velocity[0],
            );
        }
      }
      return count;
    };
    if (!event.boneId || !pose) return applyWorld();
    const currentBone = pose.bones.get(event.boneId);
    if (!currentBone) return 0;
    if ((event.simulationSpace === 'card' || world) && !sampleBirth)
      throw Error('卡牌空间粒子需要出生姿态采样器');
    const resolved = resolveEmitter(event.particles, doc);
    if (!resolved.ok) return 0;
    const registration = placementFor(resolved).registration;
    let revealIndex = 0;
    for (let i = 0; i < count; i++) {
      const bone =
        event.simulationSpace === 'card' || world
          ? sampleBirth!(
              particleBirth(
                event.particles,
                i,
                age,
                visuals[i] >= 0 ? revealIndex++ : undefined,
              ),
              event.boneId,
            )
          : currentBone;
      if (!bone) {
        output[i * 7 + 4] = 0;
        continue;
      }
      const [a, b, c, d, tx, ty] = bone.matrix;
      const scale = Math.sqrt(Math.abs(a * d - b * c)),
        angle = Math.atan2(b, a);
      const k = i * 7,
        x = (output[k] / registration) * 1024 + 512,
        y = 768 - (output[k + 1] / registration) * 1024;
      output[k] = ((a * x + c * y + tx - 512) / 1024) * registration;
      output[k + 1] = (-(b * x + d * y + ty - 768) / 1024) * registration;
      output[k + 3] *= scale;
      output[k + 4] *= bone.opacity;
      output[k + 5] -= angle;
    }
    return applyWorld();
  }
  /** One center/half-width/alpha/longitudinal-UV sample per cross section.
   * The batcher connects adjacent sections; no frame history survives a seek. */
  function sampleTrailInto(
    event: ActionParticleEvent,
    age: number,
    doc: ComponentSource,
    facing: number,
    pose: CharacterPose | null | undefined,
    output: NumericOutput,
    visuals: VisualOutput,
    limit: number,
    sampleBirth?: (
      seconds: number,
      boneId: string,
    ) => Pick<BonePose, 'matrix' | 'opacity'> | undefined,
    sampleWorld?: (seconds: number) => ParticleWorldPose,
    worldCamera = 2.7,
    worldFrames?: NumericOutput,
  ) {
    if (
      !event.particles.enabled ||
      !event.boneId ||
      !pose ||
      !event.trail ||
      limit < 1
    )
      return 0;
    const resolved = resolveEmitter(event.particles, doc);
    if (!resolved.ok) return 0;
    const p = event.particles,
      e = resolved.geometry,
      side = e.side || 'both';
    if (!sampleBirth) throw Error('连续剑痕需要历史姿态采样器');
    if (
      event.simulationSpace !== 'world' &&
      ((side === 'front' && Math.cos(facing) < 0) ||
        (side === 'back' && Math.cos(facing) >= 0))
    )
      return 0;
    const head = Math.min(age, event.emissionDuration ?? event.duration),
      tail = Math.max(0, age - event.trail.duration);
    if (head <= tail) return 0;
    const sections = Math.min(event.trail.segments, Math.floor(limit)) + 1,
      base = mapEmitterPoint(
        resolved,
        e.u - 0.5,
        (0.5 - e.v) * 1.5,
        emissionOffset(p),
      ),
      registration = placementFor(resolved).registration,
      fade = Math.min(0.12, event.duration * 0.2),
      edge = Math.max(
        0,
        Math.min(1, age / fade, (event.duration - age) / fade),
      );
    if (output.length < sections * 7 || visuals.length < sections)
      throw Error('剑痕采样缓冲区不足');
    if (worldFrames && worldFrames.length < sections * 6)
      throw Error('世界剑痕朝向缓冲区不足');
    for (let i = 0; i < sections; i++) {
      const t = tail + ((head - tail) * i) / (sections - 1),
        bone = sampleBirth
          ? sampleBirth(t, event.boneId)
          : pose.bones.get(event.boneId),
        k = i * 7,
        freshness = Math.max(0, 1 - (age - t) / event.trail.duration);
      if (!bone) return 0;
      const [a, b, c, d, tx, ty] = bone.matrix,
        x = (base.x / registration) * 1024 + 512,
        y = 768 - (base.y / registration) * 1024;
      output[k] = ((a * x + c * y + tx - 512) / 1024) * registration;
      output[k + 1] = (-(b * x + d * y + ty - 768) / 1024) * registration;
      output[k + 2] = base.z;
      output[k + 3] =
        p.size *
        base.scale *
        Math.sqrt(Math.abs(a * d - b * c)) *
        (0.15 + 0.85 * freshness);
      output[k + 4] =
        p.opacity * bone.opacity * freshness * edge * edge * (3 - 2 * edge);
      output[k + 5] = freshness * 2 - 1;
      output[k + 6] = 0;
      visuals[i] = -2;
      if (event.simulationSpace === 'world') {
        const root = sampleWorld!(t);
        if (!particleWorld.visible(root, side, worldCamera)) output[k + 4] = 0;
        particleWorld.transform(output, k, root);
        if (worldFrames) particleWorld.frame(worldFrames, i * 6, root);
      }
    }
    return sections;
  }
  /** Analytic birth times match the procedural sampler, including grouped halo
   * particles and delayed reveal rays. No frame history or fixed-step replay. */
  function particleBirth(
    p: Particles,
    index: number,
    seconds: number,
    revealIndex?: number,
  ) {
    if (revealIndex !== undefined) {
      const r = p.reveal;
      if (r.profile !== 'trails') return 0;
      const late = revealIndex % 5 === 0;
      return (
        r.duration *
        Math.min(
          0.8,
          r.stagger *
            (late
              ? 0.8 + 0.4 * hash(revealIndex + 751, p.seed)
              : 0.12 * hash(revealIndex + 751, p.seed)),
        )
      );
    }
    if (['float', 'field'].includes(p.trajectory)) return 0;
    const halo = p.trajectory === 'halo';
    let life = p.lifetime,
      seed = hash(index, p.seed),
      delay = 0;
    if (halo && p.visual === 'adamantium')
      life *= 0.8 + 0.4 * hash(index + 467, p.seed);
    if (halo && ['krackle', 'starcore'].includes(p.visual)) {
      const groupSize = p.visual === 'krackle' ? 3 : 4;
      seed = hash(Math.floor(index / groupSize) + 201, p.seed);
      delay = (index % groupSize) * (groupSize === 3 ? 0.1 : 0.07);
    }
    return Math.max(
      0,
      (Math.floor(Math.max(0, seconds) / life + seed) - seed + delay) * life,
    );
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
    particleBirth,
    actionParticleEvents,
    sampleEventInto,
    createPhysicsCache: () => particlePhysics.cache(),
  };
})();

export default api;
