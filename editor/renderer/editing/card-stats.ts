import type { CardLayer, TextStyle } from '../../shared/document';
import type {
  StatsDocument,
  StatsConfig,
  StatImageLoader,
  StatTextStyle,
  Vec2,
} from '../../shared/render-models';
/* Card values are real editable layers, shared by composition, AI and export. */

const api = (() => {
  'use strict';
  const roles = ['stat-cost', 'stat-power'];
  const baseTextStyle: TextStyle = {
    fontFamily: 'Arial',
    fontSize: 108,
    fontWeight: 800,
    italic: false,
    color: '#ffffff',
    stroke: '#15202d',
    strokeWidth: 7,
    align: 'center',
  };
  const isStat = (l: Pick<CardLayer, 'role'> | null | undefined) =>
    roles.includes(l?.role || '');
  const themes = [
    { id: 'snap', name: 'Snap 基础' },
    { id: 'stellar-energy', name: '星辉边饰 · 银金倒角' },
  ];
  const themeImages = new Map<string, HTMLImageElement>(),
    themeLoads = new Map<string, Promise<void>>();
  function theme(style?: Partial<TextStyle>) {
    const id = style?.badgeTheme || 'snap';
    if (!themes.some((t) => t.id === id)) throw Error('卡片数值外观无效');
    return id;
  }
  async function loadTheme(id: string, loader: StatImageLoader) {
    theme({ badgeTheme: id });
    if (id === 'snap' || themeImages.has(id)) return;
    if (!themeLoads.has(id))
      themeLoads.set(
        id,
        (async () => {
          const image = await loader('assets/stats/stellar-energy.png'),
            w = image.naturalWidth || image.width,
            h = image.naturalHeight || image.height;
          if (!w || !h || w !== h * 2 || w > 4096)
            throw Error('数值素材须为两个等大的正方形图集');
          themeImages.set(id, image);
        })().catch((e) => {
          themeLoads.delete(id);
          throw e;
        }),
      );
    await themeLoads.get(id);
  }
  async function loadThemes(doc: StatsDocument, loader: StatImageLoader) {
    await Promise.all(
      [
        ...new Set<string>(
          doc.layers.filter(isStat).map((l) => theme(l.textStyle)),
        ),
      ].map((id) => loadTheme(id, loader)),
    );
  }
  function resolveTheme(doc: StatsDocument) {
    const ids = new Set<string>(
      doc.layers.filter(isStat).map((l) => theme(l.textStyle)),
    );
    return ids.size > 1 ? 'mixed' : ids.values().next().value || 'snap';
  }
  function value(role: string | undefined, text: unknown) {
    const n = Number(text);
    if (
      !/^-?\d{1,3}$/.test(String(text)) ||
      !Number.isInteger(n) ||
      n < (role === 'stat-cost' ? 0 : -99) ||
      n > (role === 'stat-cost' ? 99 : 999)
    )
      throw Error('费用须为 0–99，战力须为 -99–999 的整数');
    return n;
  }
  function resolve(doc: StatsDocument) {
    const cost = doc.layers.find((l) => l.role === roles[0]),
      power = doc.layers.find((l) => l.role === roles[1]);
    return {
      cost: cost ? value(cost.role, cost.text) : 2,
      power: power ? value(power.role, power.text) : 4,
      visible: !!cost?.visible && !!power?.visible,
      costLayerId: cost?.id || null,
      powerLayerId: power?.id || null,
    };
  }
  function validate(doc: StatsDocument) {
    for (const role of roles) {
      const ls = doc.layers.filter((l) => l.role === role);
      if (ls.length > 1) throw Error('卡片数值图层重复');
      if (ls[0]) {
        if (ls[0].kind !== 'text') throw Error('卡片数值必须为可编辑文字');
        value(role, ls[0].text);
        theme(ls[0].textStyle);
      }
    }
  }
  function apply(doc: StatsDocument, config: StatsConfig) {
    const old = resolve(doc);
    if (config.theme !== undefined) theme({ badgeTheme: config.theme });
    for (const [role, key] of [
      [roles[0], 'cost'],
      [roles[1], 'power'],
    ] as const) {
      value(role, String(config[key] ?? old[key]));
      const l = doc.layers.find((l) => l.role === role);
      if (l?.locked) throw Error('数值图层已锁定：' + l.name);
    }
    if (
      doc.layers.length +
        roles.filter((role) => !doc.layers.some((l) => l.role === role))
          .length >
      64
    )
      throw Error('图层数量超限');
    for (const [role, key, name] of [
      [roles[0], 'cost', '费用'],
      [roles[1], 'power', '战力'],
    ] as const) {
      const n = config[key] ?? old[key];
      let l = doc.layers.find((l) => l.role === role);
      if (!l) {
        let id = role;
        for (let i = 1; doc.layers.some((x) => x.id === id); i++)
          id = role + '-' + i;
        l = {
          id,
          kind: 'text',
          role,
          name,
          text: String(n),
          textStyle: { ...baseTextStyle },
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          visible: true,
          locked: false,
        };
        doc.layers.unshift(l);
      }
      if (config.theme !== undefined) {
        const before = theme(l.textStyle);
        if (config.theme === 'stellar-energy' && before !== 'stellar-energy')
          l.badgePreviousTextStyle = { ...l.textStyle };
        if (config.theme === 'snap' && before !== 'snap') {
          l.textStyle = { ...(l.badgePreviousTextStyle || baseTextStyle) };
          delete l.badgePreviousTextStyle;
        }
        l.textStyle = { ...l.textStyle, badgeTheme: config.theme };
        if (config.theme === 'stellar-energy')
          l.textStyle = {
            ...l.textStyle,
            fontFamily: 'Georgia',
            fontWeight: 700,
            italic: false,
            color: '#ffffff',
            stroke: role === roles[0] ? '#173b66' : '#633611',
            strokeWidth: 3,
          };
      }
      l.text = String(n);
      l.visible =
        config.visible ?? (config.theme !== undefined ? l.visible : true);
    }
    return resolve(doc);
  }
  // The layer list is front-to-back. Badges are editable artwork, so they must
  // obey the same painter order as weapons, characters and image wordmarks.
  function paintOrder(layers: readonly CardLayer[]): CardLayer[] {
    return [...layers].reverse();
  }
  function draw(
    ctx: CanvasRenderingContext2D,
    layer: CardLayer,
    style: StatTextStyle,
  ) {
    const text = layer.text ?? '';
    const cost = layer.role === roles[0],
      x = cost ? 94 : 930,
      y = 94,
      id = theme(style);
    ctx.save();
    ctx.lineJoin = 'round';
    if (id === 'stellar-energy') {
      const image = themeImages.get(id);
      if (!image) {
        ctx.restore();
        throw Error('星辉边饰数值素材尚未加载');
      }
      const side = (image.naturalWidth || image.width) / 2;
      ctx.drawImage(
        image,
        cost ? 0 : side,
        0,
        side,
        side,
        x - 94,
        y - 94,
        188,
        188,
      );
    } else {
      const gradient = ctx.createLinearGradient(x - 80, 5, x + 80, 180);
      gradient.addColorStop(0, cost ? '#50b5ff' : '#ffdf72');
      gradient.addColorStop(0.52, cost ? '#1276d2' : '#f6a72d');
      gradient.addColorStop(1, cost ? '#123d92' : '#a24a12');
      ctx.beginPath();
      if (cost) ctx.arc(x, y, 83, 0, Math.PI * 2);
      else {
        for (const [i, p] of (
          [
            [850, 12],
            [1006, 12],
            [1014, 37],
            [1006, 137],
            [930, 179],
            [854, 137],
            [846, 37],
          ] as Vec2[]
        ).entries())
          i ? ctx.lineTo(...p) : ctx.moveTo(...p);
        ctx.closePath();
      }
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = cost ? '#0e3257' : '#5b3116';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = cost ? '#abddff' : '#ffedb5';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${style.fontSize}px "${style.fontFamily}",sans-serif`;
    const measured = ctx.measureText(text).width,
      maxWidth = id === 'stellar-energy' ? 112 : 136;
    if (measured > maxWidth)
      ctx.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${(style.fontSize * maxWidth) / measured}px "${style.fontFamily}",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth;
    if (style.strokeWidth) ctx.strokeText(text, x, y + 5);
    ctx.fillStyle = style.color;
    ctx.fillText(text, x, y + 5);
    ctx.restore();
  }
  return {
    isStat,
    value,
    resolve,
    validate,
    apply,
    draw,
    paintOrder,
    themes,
    theme,
    loadTheme,
    loadThemes,
    resolveTheme,
  };
})();

export default api;
