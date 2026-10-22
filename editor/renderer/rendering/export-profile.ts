/* Persisted export policy shared by authoring and portable players. */
import type {
  ExportPreset,
  ExportSettings,
  TextureTier,
} from '../../shared/export-policy';
const api = (() => {
  const presets = {
    source: { name: '原图保真', small: 1, threshold: 420, adaptive: false },
    'mobile-list': {
      name: '移动端列表',
      small: 0.25,
      threshold: 420,
      adaptive: true,
    },
    'mobile-detail': {
      name: '移动端详情',
      small: 0.5,
      threshold: 360,
      adaptive: true,
    },
    desktop: { name: '桌面端', small: 0.5, threshold: 280, adaptive: true },
  };
  function config(value: Partial<ExportSettings> = {}): ExportSettings {
    const preset = value.preset || 'source',
      p = presets[preset];
    if (!p) throw Error('未知导出预设');
    return {
      schema: 'card-export-settings/1',
      preset,
      adaptive: value.adaptive ?? p.adaptive,
      threshold: value.threshold ?? p.threshold,
      smallParticles: value.smallParticles ?? false,
      smallMaterials: value.smallMaterials ?? false,
      smallDecorations: value.smallDecorations ?? false,
      remoteDelivery: value.remoteDelivery ?? false,
      includeSource:
        value.includeSource ??
        (value.preset === undefined || value.preset === 'source'),
      layers: { ...value.layers },
    };
  }
  function validate(value: unknown): ExportSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('导出设置无效');
    // Normalize first, then check every persisted setting before returning the typed value.
    const input = value as Partial<ExportSettings>,
      v = config(input);
    if (
      input.schema !== v.schema ||
      [
        'remoteDelivery',
        'adaptive',
        'smallParticles',
        'smallMaterials',
        'smallDecorations',
        'includeSource',
      ].some((k) => typeof v[k as keyof ExportSettings] !== 'boolean') ||
      !Number.isFinite(v.threshold) ||
      v.threshold < 160 ||
      v.threshold > 1600 ||
      !input.layers ||
      Array.isArray(input.layers) ||
      Object.entries(v.layers).some(
        ([key, rule]) => !key || !['always', 'detail', 'omit'].includes(rule),
      )
    )
      throw Error('导出设置无效');
    return v;
  }
  function tier(
    value: Partial<ExportSettings> | null | undefined,
    width: number,
    current: TextureTier | null = null,
  ): TextureTier {
    if (!value) return 'large';
    const v = config(value);
    if (!v.adaptive) return v.preset === 'mobile-list' ? 'small' : 'large';
    if (!Number.isFinite(width) || width < 0) return current || 'small';
    return width >= (current === 'large' ? v.threshold * 0.85 : v.threshold)
      ? 'large'
      : 'small';
  }
  function effects(
    value: Partial<ExportSettings> | null | undefined,
    level: TextureTier,
  ) {
    const c = value ? config(value) : null,
      large = !c || level === 'large';
    return {
      particles: large || !!c?.smallParticles,
      materials: large || !!c?.smallMaterials,
      decorations: large || !!c?.smallDecorations,
    };
  }
  function visible(
    value: Partial<ExportSettings> | null | undefined,
    id: string,
    level: TextureTier,
  ) {
    const v = value ? config(value) : null,
      rule = v?.layers[id] || 'always';
    return (
      rule !== 'omit' &&
      (rule !== 'detail' || level === 'large' || !!v?.smallDecorations)
    );
  }
  function projectedWidth(
    width: number,
    height: number,
    zoom = 1,
    scale = 1,
    camera = 2.7,
    dpr = 1,
  ) {
    return (
      ((height *
        1.45 *
        Math.min(1, width / Math.max(1, height) / 0.85) *
        Math.max(0.01, zoom) *
        Math.max(0.01, scale)) /
        Math.max(0.15, camera)) *
      Math.min(2, Math.max(1, dpr))
    );
  }
  return { presets, config, validate, tier, effects, visible, projectedWidth };
})();
export default api;
