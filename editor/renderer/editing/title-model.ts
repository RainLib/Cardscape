/* Localized hero artwork shares one sweep clock; glyphs come from each locale. */
import type {
  CardLayer,
  PartialTextStyle,
  SweepSettings,
  TitleVariant,
} from '../../shared/document';
const api = (() => {
  const sweep: SweepSettings = {
    enabled: true,
    strength: 0.65,
    duration: 3,
    period: 7,
    width: 0.12,
    color: '#c7f3ff',
  };
  const localeOK = (v: unknown): v is string =>
    typeof v === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v);
  const object = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  function validateStyle(style: unknown): asserts style is PartialTextStyle {
    if (
      !object(style) ||
      Object.keys(style).some(
        (k) =>
          ![
            'fontFamily',
            'fontSize',
            'fontWeight',
            'italic',
            'color',
            'stroke',
            'strokeWidth',
            'align',
          ].includes(k),
      )
    )
      throw Error('语言字标样式无效');
    for (const [key, value] of Object.entries(style)) {
      if (
        key === 'fontFamily' &&
        (typeof value !== 'string' ||
          value.length > 100 ||
          !/^[\w\u3400-\u9fff -]+$/.test(value))
      )
        throw Error('语言字标字体无效');
      if (
        key === 'fontSize' &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 12 ||
          value > 300)
      )
        throw Error('语言字标字号无效');
      if (
        key === 'fontWeight' &&
        !new Set<unknown>([400, 700, 800, '400', '700', '800']).has(value)
      )
        throw Error('语言字标字重无效');
      if (key === 'italic' && typeof value !== 'boolean')
        throw Error('语言字标斜体无效');
      if (
        ['color', 'stroke'].includes(key) &&
        (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value))
      )
        throw Error('语言字标颜色无效');
      if (
        key === 'strokeWidth' &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 24)
      )
        throw Error('语言字标描边无效');
      if (
        key === 'align' &&
        (typeof value !== 'string' ||
          !['left', 'center', 'right'].includes(value))
      )
        throw Error('语言字标对齐无效');
    }
  }
  function resolve(layer: Partial<CardLayer>, locale = 'zh-CN') {
    const art = layer.titleArt,
      variants = art?.variants || [],
      variant =
        variants.find((v) => v.locale === locale) ||
        variants.find((v) => v.locale === locale.split('-')[0]) ||
        variants[0];
    return {
      text: variant?.text ?? layer.text ?? '',
      style: { ...layer.textStyle, ...variant?.style },
      src: variant?.src,
      asset: variant?.asset,
      rasterAsset: variant?.rasterAsset,
      locale: variant?.locale || locale,
      fallback: !!variant && variant.locale !== locale,
      sweep: {
        ...sweep,
        ...art?.sweep,
        enabled: !!art && (art.sweep?.enabled ?? true),
      },
    };
  }
  function validateSweep(value: unknown): void {
    if (
      !object(value) ||
      Object.keys(value).some((k) => !Object.hasOwn(sweep, k)) ||
      typeof value.enabled !== 'boolean' ||
      typeof value.color !== 'string' ||
      !/^#[a-fA-F0-9]{6}$/.test(value.color)
    )
      throw Error('扫光参数无效；周期不能短于持续时间');
    for (const [key, min, max] of [
      ['strength', 0, 3],
      ['duration', 0.3, 20],
      ['period', 0.3, 30],
      ['width', 0.02, 0.5],
    ] as const) {
      const n = value[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
        throw Error('扫光参数无效；周期不能短于持续时间');
    }
    if (Number(value.period) < Number(value.duration))
      throw Error('扫光参数无效；周期不能短于持续时间');
  }
  function validate(doc: unknown) {
    if (!object(doc)) throw Error('卡片语言无效');
    if (doc.locale !== undefined && !localeOK(doc.locale))
      throw Error('卡片语言无效');
    if (doc.layers !== undefined && !Array.isArray(doc.layers))
      throw Error('字标语言版本无效');
    const layers: unknown[] = Array.isArray(doc.layers) ? doc.layers : [];
    for (const layer of layers) {
      if (!object(layer) || !layer.titleArt) continue;
      if (
        layer.kind !== 'text' ||
        (typeof layer.role === 'string' && layer.role.startsWith('stat-'))
      )
        throw Error('英雄字标仅用于普通文字图层');
      const art = layer.titleArt;
      if (
        !object(art) ||
        !Array.isArray(art.variants) ||
        !art.variants.length ||
        art.variants.length > 16
      )
        throw Error('字标语言版本无效');
      const seen = new Set<string>();
      for (const variant of art.variants) {
        if (
          !object(variant) ||
          !localeOK(variant.locale) ||
          seen.has(variant.locale) ||
          typeof variant.text !== 'string' ||
          variant.text.length > 64 ||
          (variant.src !== undefined &&
            (typeof variant.src !== 'string' ||
              !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(variant.src) ||
              variant.src.length > 24 * 1024 * 1024))
        )
          throw Error('字标语言素材无效');
        if (variant.style) validateStyle(variant.style);
        seen.add(variant.locale);
      }
      if (art.sweep !== undefined && !object(art.sweep))
        throw Error('扫光参数无效；周期不能短于持续时间');
      validateSweep({ ...sweep, ...(object(art.sweep) ? art.sweep : {}) });
    }
  }
  function upsert(layer: CardLayer, variant: TitleVariant) {
    const art = layer.titleArt || { variants: [], sweep: { ...sweep } },
      variants = art.variants.map((v) => ({ ...v })),
      index = variants.findIndex((v) => v.locale === variant.locale);
    if (index < 0) variants.push({ ...variant });
    else variants[index] = { ...variants[index], ...variant };
    layer.titleArt = { ...art, variants };
  }
  return { sweep, localeOK, resolve, validate, validateSweep, upsert };
})();
export default api;
