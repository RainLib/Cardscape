import type { CardDocument, CardLayer } from '../shared/document';
import type { Particles } from '../shared/visual-components';
import type {
  CharacterAction,
  CharacterRig,
  SkinMesh,
} from '../shared/character';

export interface GuardianInputs {
  atlas: string;
  background: string;
  back: string;
  base: CardDocument;
  particleBase: Particles;
  audio?: { swish: string; charge: string; impact: string };
}

/** Run in Chromium: packing preserves generated cutout alpha and uses rigid
 * similarities for anatomy. No image is copied to fake hidden joint support. */
export async function assembleGuardian(input: GuardianInputs) {
  type Point = [number, number];
  type Part = {
    id: string;
    name: string;
    cell: number;
    bone: string;
    part: string;
    root: Point;
    tip: Point;
    target: Point;
    end: Point;
    z: number;
  };
  const load = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(Error('Cannot decode generated character asset'));
      image.src = src;
    });
  const atlas = await load(input.atlas),
    cell = atlas.naturalWidth / 3;
  if (atlas.naturalWidth !== atlas.naturalHeight || !Number.isInteger(cell))
    throw Error('Character atlas must be a square grid of nine equal cells');
  const make = () => {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1536;
    return c;
  };
  const parts: Part[] = [
    {
      id: 'torso',
      name: '躯干 · 完整肩髋支撑',
      cell: 0,
      bone: 'root',
      part: 'torso',
      root: [230, 25],
      tip: [230, 325],
      target: [512, 360],
      end: [512, 660],
      z: 0.075,
    },
    {
      id: 'head',
      name: '头盔与颈部连接',
      cell: 1,
      bone: 'head',
      part: 'head',
      root: [210, 326],
      tip: [210, 126],
      target: [512, 360],
      end: [512, 244],
      z: 0.095,
    },
    {
      id: 'cape',
      name: '完整披风 · 固定肩根',
      cell: 2,
      bone: 'cape',
      part: 'cape',
      root: [209, 40],
      tip: [209, 390],
      target: [512, 430],
      end: [512, 1060],
      z: 0.025,
    },
    {
      id: 'left-upper',
      name: '左侧上臂与肩甲',
      cell: 3,
      bone: 'left-upper',
      part: 'arm',
      root: [220, 90],
      tip: [200, 330],
      target: [382, 465],
      end: [338, 670],
      z: 0.09,
    },
    {
      id: 'left-forearm',
      name: '左前臂 · 手与整剑刚性握持组',
      cell: 4,
      bone: 'left-forearm',
      part: 'forearm',
      root: [203, 35],
      tip: [210, 150],
      target: [338, 670],
      end: [320, 830],
      z: 0.12,
    },
    {
      id: 'right-upper',
      name: '右侧上臂与肩甲',
      cell: 5,
      bone: 'right-upper',
      part: 'arm',
      root: [220, 90],
      tip: [240, 335],
      target: [637, 465],
      end: [681, 670],
      z: 0.09,
    },
    {
      id: 'right-forearm',
      name: '右前臂 · 完整施法手掌',
      cell: 6,
      bone: 'right-forearm',
      part: 'forearm',
      root: [210, 45],
      tip: [220, 230],
      target: [681, 670],
      end: [715, 830],
      z: 0.115,
    },
    {
      id: 'left-leg',
      name: '左侧髋关节与完整腿靴',
      cell: 7,
      bone: 'left-leg',
      part: 'leg',
      root: [210, 40],
      tip: [210, 390],
      target: [422, 665],
      end: [410, 1135],
      z: 0.085,
    },
    {
      id: 'right-leg',
      name: '右侧髋关节与完整腿靴',
      cell: 8,
      bone: 'right-leg',
      part: 'leg',
      root: [210, 40],
      tip: [210, 390],
      target: [617, 665],
      end: [640, 1135],
      z: 0.06,
    },
  ];
  const layers: CardLayer[] = [],
    canvases = new Map<string, HTMLCanvasElement>();
  // Isolate each painted component from adjacent atlas cells. Coordinates are
  // measured against the source alpha; the source artwork remains untouched.
  const crops = [
    [48, 9, 370, 397],
    [85, 27, 250, 324],
    [17, 8, 370, 394],
    [130, 15, 177, 361],
    [140, 0, 141, 395],
    [110, 14, 177, 362],
    [120, 0, 172, 375],
    [130, 0, 135, 402],
    [140, 0, 134, 403],
  ];
  const registrations: Array<{
    id: string;
    scale: number;
    rotation: number;
    root: Point;
    end: Point;
  }> = [];
  for (const p of parts) {
    const c = make(),
      ctx = c.getContext('2d', { willReadFrequently: true })!;
    const scale =
      Math.hypot(p.end[0] - p.target[0], p.end[1] - p.target[1]) /
      Math.hypot(p.tip[0] - p.root[0], p.tip[1] - p.root[1]);
    const rotation =
      Math.atan2(p.end[1] - p.target[1], p.end[0] - p.target[0]) -
      Math.atan2(p.tip[1] - p.root[1], p.tip[0] - p.root[0]);
    ctx.translate(...p.target);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    const [cx, cy, cw, ch] = crops[p.cell];
    ctx.drawImage(
      atlas,
      (p.cell % 3) * cell + cx,
      Math.floor(p.cell / 3) * cell + cy,
      cw,
      ch,
      cx - p.root[0],
      cy - p.root[1],
      cw,
      ch,
    );
    const src = c.toDataURL('image/png');
    canvases.set(p.id, c);
    layers.push({
      id: p.id,
      name: p.name,
      kind: p.id === 'torso' ? 'foreground' : 'image',
      src,
      master: src,
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      visible: true,
      locked: false,
      anatomy: {
        schema: 'card-character-part/1',
        part: p.part,
        side: p.id.startsWith('left')
          ? 'right'
          : p.id.startsWith('right')
            ? 'left'
            : 'center',
      },
      spatial: {
        role: p.id === 'cape' ? 'rear' : p.id === 'torso' ? 'body' : 'front',
        z: p.z,
        clip: false,
      },
    });
    registrations.push({
      id: p.id,
      scale,
      rotation,
      root: p.target,
      end: p.end,
    });
  }
  const root: Point = [512, 620];
  const rig: CharacterRig = {
    schema: 'card-character-rig/1',
    bones: [
      {
        id: 'root',
        name: '哨卫整体',
        parentId: null,
        x: root[0],
        y: root[1],
        rotation: 0,
        scale: 1,
      },
    ],
    bindings: [],
    meshes: [],
    constraints: [],
    expressions: [],
  };
  for (const p of parts) {
    if (p.bone !== 'root') {
      const parent = p.id.endsWith('forearm')
        ? p.id.replace('forearm', 'upper')
        : 'root';
      const origin =
        parent === 'root' ? root : parts.find((v) => v.bone === parent)!.target;
      rig.bones.push({
        id: p.bone,
        name: p.name,
        parentId: parent,
        x: p.target[0] - origin[0],
        y: p.target[1] - origin[1],
        rotation: 0,
        scale: 1,
        tip: [p.end[0] - p.target[0], p.end[1] - p.target[1]],
      });
    }
    rig.bindings.push({ layerId: p.id, boneId: p.bone });
    const nx = p.id === 'cape' ? 16 : 1,
      ny = p.id === 'cape' ? 24 : 1;
    const mesh: SkinMesh = {
      layerId: p.id,
      vertices: [],
      uv: [],
      triangles: [],
      weights: [],
      morphs: [],
    };
    for (let y = 0; y <= ny; y++)
      for (let x = 0; x <= nx; x++) {
        mesh.vertices.push((x / nx) * 1024, (y / ny) * 1536);
        mesh.uv.push(x / nx, y / ny);
        mesh.weights.push([{ boneId: p.bone, weight: 1 }]);
      }
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const i = y * (nx + 1) + x;
        mesh.triangles.push(
          i,
          i + 1,
          i + nx + 1,
          i + 1,
          i + nx + 2,
          i + nx + 1,
        );
      }
    rig.meshes!.push(mesh);
  }
  rig.constraints = [
    {
      id: 'right-arm-ik',
      name: '右臂施法目标',
      rootId: 'right-upper',
      tipId: 'right-forearm',
      end: [34, 160],
      target: [715, 830],
      bend: 1,
      mix: 0,
      solver: 'analytic',
      enabled: true,
    },
  ];
  const masks: Record<string, string> = {},
    channels = Object.fromEntries(
      ['coverage', 'rigid', 'emission', 'foil', 'motion', 'inset', 'phase'].map(
        (id) => [id, new Uint8ClampedArray(1024 * 1536)],
      ),
    );
  for (const p of parts) {
    const pixels = canvases
      .get(p.id)!
      .getContext('2d')!
      .getImageData(0, 0, 1024, 1536).data;
    for (let i = 0; i < 1024 * 1536; i++) {
      const a = pixels[i * 4 + 3],
        r = pixels[i * 4],
        g = pixels[i * 4 + 1],
        b = pixels[i * 4 + 2];
      channels.coverage[i] = Math.max(channels.coverage[i], a);
      if (p.id !== 'cape') channels.rigid[i] = Math.max(channels.rigid[i], a);
      if (p.id !== 'cape' && g > 105 && b > 125 && r < g * 0.85 && g > b * 0.6)
        channels.emission[i] = Math.max(
          channels.emission[i],
          Math.round(a * 0.9),
        );
      if (p.id !== 'cape' && r > 100 && g > 65 && r > g * 1.07 && g > b * 1.1)
        channels.foil[i] = Math.max(channels.foil[i], Math.round(a * 0.7));
      if (p.id === 'cape')
        channels.motion[i] = Math.round(
          a * Math.max(0, Math.min(1, (Math.floor(i / 1024) - 490) / 650)),
        );
    }
  }
  for (let i = 0; i < 1024 * 1536; i++) {
    const x = i % 1024,
      y = Math.floor(i / 1024);
    channels.inset[i] = 255;
    channels.phase[i] = Math.round(
      ((x / 1024) * 0.35 + (y / 1536) * 0.65) * 255,
    );
  }
  // The sword is explicitly allowed to cross the rim, while ordinary cloth stays inside.
  const sword = canvases
    .get('left-forearm')!
    .getContext('2d')!
    .getImageData(0, 0, 1024, 1536).data;
  const head = canvases
    .get('head')!
    .getContext('2d')!
    .getImageData(0, 0, 1024, 1536).data;
  for (let i = 0; i < 1024 * 1536; i++)
    if (sword[i * 4 + 3] > 0 || head[i * 4 + 3] > 0) channels.inset[i] = 0;
  for (const [id, values] of Object.entries(channels)) {
    const c = make(),
      ctx = c.getContext('2d')!,
      data = ctx.createImageData(1024, 1536);
    for (let i = 0; i < values.length; i++) {
      data.data[i * 4] =
        data.data[i * 4 + 1] =
        data.data[i * 4 + 2] =
          values[i];
      data.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    masks[id] = c.toDataURL();
  }
  const frames = (values: number[]) =>
    values.map((value, i) => ({
      at: i / (values.length - 1),
      value,
      ease: 'smooth' as const,
    }));
  const common = {
    event: 'trigger',
    duration: 2.4,
    loop: false,
    motion: 1,
    emission: 1,
    bend: 0,
    transitionDuration: 0.3,
  };
  const capeMesh = rig.meshes!.find((m) => m.layerId === 'cape')!;
  const wave = (amount: number) =>
    capeMesh.weights.flatMap((_, i) => {
      const x = capeMesh.vertices[i * 2],
        y = capeMesh.vertices[i * 2 + 1],
        weight = Math.max(0, Math.min(1, (y - 490) / 650));
      return weight > 0
        ? [
            i,
            Math.sin((x / 1024) * Math.PI) * weight * amount,
            Math.sin((x / 1024) * Math.PI * 2) * weight * amount * 0.2,
          ]
        : [];
    });
  const actions: CharacterAction[] = [
    {
      ...common,
      id: 'idle',
      name: '守望 · 呼吸与披风',
      event: 'idle',
      duration: 4,
      loop: true,
      boneTracks: {
        root: { y: frames([0, -3, 0, 3, 0]) },
        head: { rotation: frames([-1, 1, -1]) },
        cape: { rotation: frames([-0.6, 0.6, -0.6]) },
      },
      deformTracks: {
        cape: {
          cape: [0, 18, 0, -18, 0].map((v, i) => ({
            at: i / 4,
            deltas: wave(v),
            ease: 'smooth',
          })),
        },
      },
    },
    {
      ...common,
      id: 'sweep',
      name: '横斩 · 完整握持组与抬腿',
      boneTracks: {
        root: { rotation: frames([0, -2, 4, 0]), y: frames([0, -8, -4, 0]) },
        'left-upper': { rotation: frames([0, -12, -25, 0]) },
        'left-forearm': { rotation: frames([0, -25, -60, 0]) },
        'left-leg': { rotation: frames([0, 8, 28, 0]) },
        'right-leg': { rotation: frames([0, -4, -12, 0]) },
        head: { rotation: frames([0, 2, -3, 0]) },
      },
      drawOrder: [
        { at: 0, layers: ['left-forearm', 'left-upper', 'torso'] },
        { at: 0.35, layers: ['torso', 'left-upper', 'left-forearm'] },
        { at: 0.9, layers: [] },
      ],
    },
    {
      ...common,
      id: 'cast',
      name: '核心共鸣 · 双节 IK 施法',
      duration: 2.8,
      emission: 2.2,
      ikTracks: {
        'right-arm-ik': {
          x: frames([715, 850, 850, 715]),
          y: frames([830, 610, 610, 830]),
          mix: frames([0, 1, 1, 0]),
        },
      },
      boneTracks: {
        head: { rotation: frames([0, -4, 0]) },
        'left-leg': { rotation: frames([0, 6, 0]) },
      },
    },
    {
      ...common,
      id: 'enter',
      name: '星炉唤醒 · 进场',
      event: 'enter',
      duration: 1.2,
      tracks: {
        y: frames([120, 0]),
        scale: frames([0.8, 1]),
        opacity: frames([0, 1]),
      },
    },
    {
      ...common,
      id: 'flip',
      name: '翻面 · 正背面校验',
      event: 'flip',
      duration: 1.4,
      tracks: { yaw: frames([0, 180]) },
    },
  ];
  const order = [
    'head',
    'left-forearm',
    'right-forearm',
    'left-upper',
    'right-upper',
    'torso',
    'left-leg',
    'right-leg',
    'cape',
  ];
  const effect = (
    x: number,
    y: number,
    layerId: string,
    burst = false,
  ): Particles => ({
    ...input.particleBase,
    enabled: true,
    count: 32,
    visual: burst ? 'streak' : 'glimmer',
    lifetime: 0.6,
    speed: 0.12,
    spread: 0.18,
    size: burst ? 0.018 : 0.012,
    z: 0.12,
    opacity: 0.85,
    placement: 'surface',
    emitter: {
      ...input.particleBase.emitter!,
      target: layerId ? 'layer' : 'card',
      layerId,
      regionId: '',
      shape: 'ellipse',
      u: x / 1024,
      v: y / 1536,
      width: 0.06,
      height: 0.04,
      side: 'front',
    },
    reveal: {
      ...input.particleBase.reveal,
      enabled: burst,
      only: burst,
      duration: 0.75,
      count: 48,
      travel: 0.32,
      size: 0.018,
      stretch: 6,
      profile: 'trails',
      stagger: 0.35,
    },
  });
  actions.find((a) => a.id === 'cast')!.particleEvents = [
    {
      id: 'palm-charge',
      name: '掌心聚能',
      at: 0.1,
      duration: 2,
      emissionDuration: 1.1,
      boneId: 'right-forearm',
      particles: effect(715, 830, 'right-forearm'),
    },
    {
      id: 'palm-burst',
      name: '核心共鸣爆发',
      at: 0.4,
      duration: 0.8,
      boneId: 'right-forearm',
      simulationSpace: 'card',
      particles: effect(715, 830, 'right-forearm', true),
    },
  ];
  actions.find((a) => a.id === 'sweep')!.particleEvents = [
    {
      id: 'blade-ribbon',
      name: '连续剑锋带',
      at: 0.12,
      duration: 1.9,
      emissionDuration: 1.5,
      boneId: 'left-forearm',
      trail: { duration: 0.3, segments: 32 },
      particles: {
        ...effect(290, 1010, 'left-forearm'),
        size: 0.016,
        color: '#91deff',
      },
    },
    {
      id: 'blade-trail',
      name: '剑锋流光',
      at: 0.12,
      duration: 1.65,
      boneId: 'left-forearm',
      simulationSpace: 'card',
      particles: {
        ...effect(290, 1010, 'left-forearm'),
        visual: 'streak',
        size: 0.008,
        stretch: 5,
        emitter: {
          ...effect(290, 1010, 'left-forearm').emitter!,
          width: 0.025,
          height: 0.18,
        },
      },
    },
  ];
  actions.find((a) => a.id === 'enter')!.particleEvents = [
    {
      id: 'entry-rays',
      name: '唤醒辉光',
      at: 0,
      duration: 0.9,
      particles: {
        ...effect(512, 768, '', true),
        placement: 'behind',
        reveal: {
          ...effect(512, 768, '', true).reveal,
          duration: 0.9,
          travel: 0.85,
          count: 64,
        },
      },
    },
  ];
  actions.push({
    ...common,
    id: 'exit',
    name: '星炉休眠 · 退场',
    event: 'exit',
    duration: 1.2,
    tracks: { opacity: frames([1, 1, 0]), scale: frames([1, 1.02, 0.9]) },
    particleEvents: [
      {
        id: 'exit-sparks',
        name: '休眠散光',
        at: 0,
        duration: 0.9,
        particles: {
          ...effect(512, 768, '', true),
          reveal: {
            ...effect(512, 768, '', true).reveal,
            duration: 0.9,
            travel: 0.6,
          },
        },
      },
    ],
  });
  const cast = actions.find((a) => a.id === 'cast')!;
  const worldSword = actions.find((a) => a.id === 'sweep')!.particleEvents![0];
  actions.push({
    ...structuredClone(cast),
    id: 'world-cast',
    name: '星痕巡游 · 世界空间',
    tracks: {
      x: frames([0, 220, -120]),
      y: frames([0, -70, 20]),
      yaw: frames([-12, 18, -8]),
      pitch: frames([0, 8, -4]),
      scale: frames([0.8, 1.1, 0.85]),
      opacity: frames([1, 0.4, 0.8]),
    },
    particleEvents: [
      {
        ...structuredClone(cast.particleEvents![0]),
        id: 'world-palm',
        name: '世界聚能',
        simulationSpace: 'world',
      },
      {
        ...structuredClone(worldSword),
        id: 'world-ribbon',
        name: '世界剑锋带',
        simulationSpace: 'world',
      },
      {
        id: 'world-cosmic',
        name: '世界星云',
        at: 0.1,
        duration: 2,
        simulationSpace: 'world',
        particles: {
          ...effect(512, 768, ''),
          visual: 'cosmic',
          placement: 'behind',
          count: 20,
          reveal: { ...effect(512, 768, '').reveal, enabled: false },
        },
      },
    ],
  });
  actions.push({
    ...structuredClone(cast),
    id: 'collision-cast',
    name: '星屑坠落 · 平面碰撞',
    duration: 4,
    tracks: { x: frames([-40, 40, -40]), yaw: frames([-5, 5, -5]) },
    particleEvents: [
      {
        id: 'impact-sparks',
        name: '地面反弹星屑',
        at: 0,
        duration: 3.8,
        emissionDuration: 1.2,
        simulationSpace: 'world',
        particles: {
          ...effect(512, 460, ''),
          count: 32,
          lifetime: 2.2,
          visual: 'ember',
          color: '#ffbd6b',
          size: 0.012,
          reveal: { ...effect(512, 460, '').reveal, enabled: false },
          emitter: {
            ...effect(512, 460, '').emitter!,
            shape: 'ellipse',
            width: 0.14,
            height: 0.02,
          },
        },
        physics: {
          schema: 'card-particle-physics/1',
          velocity: [0, 0.45, 0],
          spread: [0.3, 0.12, 0.05],
          gravity: [0, -1.8, 0],
          radius: 0.008,
          restitution: 0.65,
          friction: 0.12,
          response: 'bounce',
          maxBounces: 8,
          planes: [
            { id: 'floor', normal: [0, 1, 0], distance: -0.58 },
            { id: 'left', normal: [1, 0, 0], distance: -0.3 },
            { id: 'right', normal: [-1, 0, 0], distance: -0.3 },
          ],
        },
      },
    ],
  });
  if (input.audio) {
    const cue = (
      id: string,
      src: string,
      sourceDuration: number,
      at: number,
      duration: number,
      extra: Partial<import('../shared/character').ActionAudioEvent> = {},
    ) => ({
      id,
      name: id,
      src,
      sourceDuration,
      at,
      duration,
      offset: 0,
      volume: 0.55,
      playbackRate: 1,
      loop: false,
      enabled: true,
      ...extra,
    });
    cast.audioEvents = [
      cue('核心聚能', input.audio.charge, 1.6, 0.05, 1.6),
      cue('施法冲击', input.audio.impact, 1, 0.66, 0.8),
    ];
    actions.find((a) => a.id === 'sweep')!.audioEvents = [
      cue('剑锋风切', input.audio.swish, 0.6, 0.28, 0.6),
    ];
    actions.find((a) => a.id === 'world-cast')!.audioEvents = structuredClone(
      cast.audioEvents,
    );
    actions.find((a) => a.id === 'collision-cast')!.audioEvents = [
      cue('星屑余响', input.audio.impact, 1, 0.1, 2, {
        offset: 0.12,
        playbackRate: 0.8,
        loop: true,
        volume: 0.4,
      }),
    ];
  }
  const doc: CardDocument = {
    ...input.base,
    id: 'arcane-sentinel-production',
    name: '星炉哨卫 · 成品验收',
    previewMode: 'authored',
    back: input.back,
    masks,
    characterRig: rig,
    actions,
    layers: [
      {
        id: 'title',
        name: '星炉哨卫 · 可编辑标题',
        kind: 'text',
        text: '星炉哨卫',
        spatial: { role: 'title', z: 0.2, clip: false },
        x: 0,
        y: -190,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
        textStyle: {
          fontFamily: 'sans-serif',
          fontSize: 66,
          fontWeight: '800',
          color: '#f9e6bd',
          stroke: '#1b211e',
          strokeWidth: 6,
          align: 'center',
        },
      },
      {
        id: 'description',
        name: '核心共鸣 · 效果描述',
        kind: 'text',
        text: '星炉守望 · 核心共鸣',
        spatial: { role: 'title', z: 0.2, clip: false },
        x: 0,
        y: -62,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
        textStyle: {
          fontFamily: 'sans-serif',
          fontSize: 34,
          fontWeight: '700',
          color: '#d7edf0',
          stroke: '#12252b',
          strokeWidth: 4,
          align: 'center',
        },
      },
      ...order.map((id) => layers.find((l) => l.id === id)!),
      {
        id: 'frame',
        name: '星炉铜框 · 双窗异形',
        kind: 'frame',
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'background',
        name: '星炉大厅 · 独立远景',
        kind: 'background',
        src: input.background,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: true,
        spatial: { role: 'far', z: -0.18, clip: true },
      },
    ],
  };
  const assembly = make(),
    ctx = assembly.getContext('2d')!;
  ctx.fillStyle = '#263c43';
  ctx.fillRect(0, 0, 1024, 1536);
  for (const id of [...order].reverse()) ctx.drawImage(canvases.get(id)!, 0, 0);
  return { document: doc, assembly: assembly.toDataURL(), registrations };
}
