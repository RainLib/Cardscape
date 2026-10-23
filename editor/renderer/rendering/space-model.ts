import type { CardLayer } from '../../shared/document';
import type {
  Vec2,
  Vec3,
  SpacePreferences,
  SpaceDocument,
  SpaceNode,
  SpaceDisplayNode,
  SpaceCamera,
  SourceView,
  DepthControl,
} from '../../shared/render-models';
import importedCardSpatial from './spatial-model.ts';
import importedCardRuntime from './runtime-core.ts';
import importedCardFrame from '../editing/frame-model.ts';

const api = (() => {
  'use strict';
  const spatial = importedCardSpatial,
    background = spatial.background,
    character = spatial.character;
  function preferences(input: unknown = {}): SpacePreferences {
    const value: Record<string, unknown> =
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const number = (
      key: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const n = value[key];
      return typeof n === 'number' && Number.isFinite(n)
        ? Math.max(min, Math.min(max, n))
        : fallback;
    };
    return {
      mode:
        typeof value.mode === 'string' &&
        ['gallery', 'actual', 'explode'].includes(value.mode)
          ? value.mode
          : 'gallery',
      fullSource: value.fullSource !== false,
      channels: value.channels === true,
      gap: number('gap', 0.24, 0, 0.75),
      yaw: number('yaw', 48, -180, 180),
      pitch: number('pitch', 9, -75, 75),
      zoom: number('zoom', 1, 0.1, 8),
      interaction: value.interaction === 'move' ? 'move' : 'orbit',
      mask:
        typeof value.mask === 'string' &&
        [
          'none',
          'motion',
          'inset',
          'foil',
          'emission',
          'phase',
          'rigid',
          'coverage',
        ].includes(value.mask)
          ? value.mask
          : 'none',
    };
  }
  function scene(
    doc: SpaceDocument | null | undefined,
    prefs: unknown = {},
  ): SpaceDisplayNode[] {
    if (!doc) return [];
    const style = importedCardFrame.resolve(doc),
      depths = importedCardFrame.depths(style),
      layers = [...doc.layers].reverse(),
      nodes: SpaceNode[] = [];
    const add = (
      layer: CardLayer,
      part: string,
      z: number,
      label: string,
      color: string,
    ) => {
      const placement = importedCardRuntime.placement(doc, layer);
      if (layer && layer.kind !== 'frame' && spatial.enabled(doc)) {
        const sp = spatial.resolve(doc, layer);
        z = sp.z + (placement.z ?? 0);
        const registration =
          (spatial.camera(doc) - z) / (spatial.camera(doc) - 0.045);
        placement.scale *= registration;
        placement.x *= registration;
        placement.y *= registration;
        placement.clip = sp.clip || placement.clip;
      }
      nodes.push({
        id: (layer?.id || 'card-back') + ':' + part,
        layerId: layer?.id || null,
        layer,
        part,
        z,
        placement,
        label,
        color,
        extent:
          background(layer) && spatial.enabled(doc)
            ? spatial.extent(layer)
            : [1.18, 1.18],
        visible: layer ? layer.visible !== false : true,
        locked: layer ? !!layer.locked : true,
      });
    };
    // Reverse assets have their own scene; this view describes the front composition.
    let order = 0;
    for (const l of layers.filter(background)) {
      const pl = importedCardRuntime.placement(doc, l);
      add(
        l,
        'background',
        pl.z ?? depths.background + order * 0.00001,
        l.name,
        '#68a5c8',
      );
      order++;
    }
    for (const l of layers.filter((l) => l.kind === 'frame'))
      add(l, 'frame', depths.front, l.name, '#d8b472');
    order = 0;
    for (const l of layers.filter(
      (l) => l.kind !== 'frame' && !background(l),
    )) {
      if (character(l)) {
        const z =
          0.045 +
          0.045 * (doc.effects?.depth || 0) +
          (importedCardRuntime.placement(doc, l).z ?? 0);
        add(l, 'inside', z, l.name + ' · 框内', '#59b8b0');
        add(l, 'outside', z, l.name + ' · 破框', '#e19570');
      } else {
        const pl = importedCardRuntime.placement(doc, l);
        add(
          l,
          'attachment',
          pl.z ?? 0.13 + order * 0.002,
          l.name,
          l.kind === 'text' ? '#bb9bda' : '#8ab1dc',
        );
        order++;
      }
    }
    const p = preferences(prefs);
    return nodes.map((n, i) => ({
      ...n,
      index: i,
      displayZ: p.mode === 'explode' ? n.z + i * p.gap : n.z,
    }));
  }
  // Presentation preferences never change authored layers or the actual preview.
  // One source is shown once by default; paired clipping passes are an explicit diagnostic.
  function displayScene(
    doc: SpaceDocument | null | undefined,
    prefs: unknown = {},
  ): SpaceDisplayNode[] {
    const p = preferences(prefs),
      raw = scene(doc, { ...p, mode: 'actual' }),
      seen = new Set<string | null>(),
      channels = p.mode !== 'gallery' && !p.fullSource && p.channels;
    return raw
      .filter((n) => {
        if (channels) return true;
        if (seen.has(n.layerId)) return false;
        seen.add(n.layerId);
        return true;
      })
      .map((n, i) => ({
        ...n,
        id: channels ? n.id : (n.layerId || 'card-back') + ':source',
        part: channels ? n.part : character(n.layer) ? 'character' : n.part,
        label: channels ? n.label : n.layer?.name || n.label,
        number: i + 1,
        index: i,
        displayZ: p.mode === 'explode' ? n.z + i * p.gap : n.z,
      }));
  }
  function sourceView(
    node: { part: string; layer?: CardLayer },
    size?: readonly number[],
    full = true,
  ): SourceView {
    const r = background(node.layer) ? node.layer?.sourceWindow : null,
      w = size?.[0] || 1024,
      h = size?.[1] || 1536;
    if (node.part === 'frame')
      return full
        ? {
            plane: [0, 0, w / 1024, h / 1536],
            rect: [0, 0, 1, 1],
            size: [w, h],
          }
        : {
            plane: [0, 0, 1, 1],
            rect: [(w - 1024) / 2 / w, (h - 1536) / 2 / h, 1024 / w, 1536 / h],
            size: [1024, 1536],
          };
    if (!r) return { plane: [0, 0, 1, 1], rect: [0, 0, 1, 1], size: [w, h] };
    return full
      ? {
          plane: [
            (w / 2 - r.x - r.width / 2) / r.width,
            ((r.y + r.height / 2 - h / 2) * 1.5) / r.height,
            w / r.width,
            h / r.height,
          ],
          rect: [0, 0, 1, 1],
          size: [w, h],
        }
      : {
          plane: [0, 0, 1, 1],
          rect: [r.x / w, r.y / h, r.width / w, r.height / h],
          size: [r.width, r.height],
        };
  }
  function rotate(p: readonly number[], yaw: number, pitch: number): Vec3 {
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cx = Math.cos(pitch),
      sx = Math.sin(pitch),
      x = cy * p[0] + sy * p[2],
      z = -sy * p[0] + cy * p[2];
    return [x, cx * p[1] - sx * z, sx * p[1] + cx * z];
  }
  function inverse(p: readonly number[], yaw: number, pitch: number): Vec3 {
    const cx = Math.cos(pitch),
      sx = Math.sin(pitch),
      cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      y = cx * p[1] + sx * p[2],
      z = -sx * p[1] + cx * p[2];
    return [cy * p[0] - sy * z, y, sy * p[0] + cy * z];
  }
  function camera(
    prefs: Pick<SpacePreferences, 'yaw' | 'pitch' | 'zoom'>,
    width: number,
    height: number,
    center = 0,
    depthSpan = 0,
  ): SpaceCamera {
    return {
      yaw: (prefs.yaw * Math.PI) / 180,
      pitch: (prefs.pitch * Math.PI) / 180,
      zoom: prefs.zoom,
      aspect: Math.max(0.01, width / height),
      width,
      height,
      center,
      eye: Math.max(5.5, depthSpan * 0.6 + 3),
    };
  }
  function project(point: readonly number[], c: SpaceCamera): Vec2 {
    const q = rotate([point[0], point[1], point[2] - c.center], c.yaw, c.pitch),
      distance = c.eye - q[2],
      x = (q[0] * c.zoom * 3) / c.aspect / distance,
      y = (q[1] * c.zoom * 3) / distance;
    return [((x + 1) * c.width) / 2, ((1 - y) * c.height) / 2];
  }
  function onPlane(
    screen: readonly number[],
    z: number,
    c: SpaceCamera,
  ): Vec3 | null {
    const x = (((screen[0] / c.width) * 2 - 1) * c.aspect) / (c.zoom * 3),
      y = (1 - (screen[1] / c.height) * 2) / (c.zoom * 3),
      eye = inverse([0, 0, c.eye], c.yaw, c.pitch),
      ray = inverse([x, y, -1], c.yaw, c.pitch);
    eye[2] += c.center;
    if (Math.abs(ray[2]) < 0.015) return null;
    const t = (z - eye[2]) / ray[2];
    return [eye[0] + ray[0] * t, eye[1] + ray[1] * t, z];
  }
  function corners(
    node: Pick<SpaceDisplayNode, 'part' | 'displayZ'> &
      Partial<Pick<SpaceDisplayNode, 'placement' | 'sourcePlane' | 'extent'>>,
  ): Vec3[] {
    const p = node.placement || { x: 0, y: 0, scale: 1, rotation: 0 },
      s = node.sourcePlane || [
        0,
        0,
        ...(node.part === 'background' ? node.extent || [1.18, 1.18] : [1, 1]),
      ],
      c = Math.cos(-(p.rotation ?? 0)),
      r = Math.sin(-(p.rotation ?? 0));
    return [
      [-0.5, -0.75],
      [0.5, -0.75],
      [0.5, 0.75],
      [-0.5, 0.75],
    ].map(([x, y]): Vec3 => {
      x = x * s[2] + s[0];
      y = y * s[3] + s[1];
      return [
        p.x / 1024 + (x * c - y * r) * p.scale,
        -p.y / 1024 + (x * r + y * c) * p.scale,
        node.displayZ,
      ];
    });
  }
  function depthControl(
    doc: SpaceDocument,
    layer: CardLayer | null | undefined,
  ): DepthControl | null {
    if (!layer) return null;
    if (spatial.enabled(doc) && layer.kind !== 'frame')
      return {
        type: 'spatial',
        label: '相对卡框 Z',
        value: spatial.resolve(doc, layer).relativeZ,
        min: -0.4,
        max: 0.4,
        step: 0.005,
      };
    if (layer.kind === 'foreground')
      return {
        type: 'foreground',
        label: '人物空间深度',
        value: doc.effects.depth,
        min: 0,
        max: 1.5,
        step: 0.01,
      };
    if (layer.kind === 'frame')
      return {
        type: 'frame',
        label: '卡框厚度 px',
        value: importedCardFrame.resolve(doc).depth,
        min: 8,
        max: 180,
        step: 1,
      };
    if (background(layer))
      return {
        type: 'background',
        label: '背景视差强度',
        value: doc.effects.background,
        min: 0,
        max: 1.5,
        step: 0.01,
      };
    const slot = importedCardRuntime.slot(doc, layer);
    return slot
      ? {
          type: 'slot',
          label: 'Slot 深度',
          value: slot.z,
          min: -0.2,
          max: 0.4,
          step: 0.005,
        }
      : null;
  }
  // Diagnostic geometry uses the same registered root-to-tip positions as the
  // live preview. Exploded display offsets are applied later, never saved here.
  function clothGeometry(doc: SpaceDocument, layer: CardLayer) {
    const link = spatial.connection(doc, layer);
    if (
      !link?.anchor ||
      link.mode === 'rigid' ||
      link.anchor.edge === 'boundary'
    )
      return null;
    const source = doc.foregroundMesh || importedCardRuntime.grid(40),
      weights = spatial.attachmentWeights(
        source.uv,
        null,
        null,
        link.blendWidth,
        link.anchor,
      ),
      parent = importedCardRuntime.placement(doc, link.parent),
      child = importedCardRuntime.placement(doc, layer),
      positions = [];
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i],
        mix = (a: number, b: number) => a + (b - a) * w,
        rotation = -mix(parent.rotation ?? 0, child.rotation ?? 0),
        c = Math.cos(rotation),
        s = Math.sin(rotation),
        x = source.positions[i * 3],
        y = source.positions[i * 3 + 1],
        scale = mix(parent.scale, child.scale),
        z = mix(link.parentZ + (parent.z ?? 0), link.z + (child.z ?? 0)),
        registration =
          (spatial.camera(doc) - z) / (spatial.camera(doc) - 0.045);
      positions.push(
        ((x * c - y * s) * scale + mix(parent.x, child.x) / 1024) *
          registration,
        ((x * s + y * c) * scale - mix(parent.y, child.y) / 1024) *
          registration,
        z,
      );
    }
    return { ...source, positions };
  }
  function setProperty(
    doc: SpaceDocument,
    layerId: string,
    key: string,
    value: number,
  ) {
    const l = doc.layers.find((l) => l.id === layerId);
    if (!l || l.locked) throw Error('图层已锁定，请先解锁');
    if (!Number.isFinite(value)) throw Error('请输入有效数值');
    if (key === 'depth') {
      const control = depthControl(doc, l);
      if (!control) throw Error('该图层尚未绑定深度 Slot');
      if (value < control.min || value > control.max)
        throw Error('深度超出范围');
      if (control.type === 'spatial')
        spatial.set(doc, l, { ...l.spatial, role: spatial.role(l), z: value });
      else if (control.type === 'foreground') doc.effects.depth = value;
      else if (control.type === 'background') doc.effects.background = value;
      else if (control.type === 'frame') {
        doc.frameStyle = { ...importedCardFrame.resolve(doc), depth: value };
      } else {
        const slot = importedCardRuntime.slot(doc, l);
        if (!slot) throw Error('该图层尚未绑定深度 Slot');
        slot.z = value;
      }
      return;
    }
    if (l.kind === 'frame') throw Error('卡框位置固定，请调整样式或厚度');
    const ranges: Record<string, Vec2> = {
      x: [-4096, 4096],
      y: [-4096, 4096],
      scale: [0.02, 5],
      opacity: [0, 1],
    };
    if (!ranges[key] || value < ranges[key][0] || value > ranges[key][1])
      throw Error('图层参数超出范围');
    l[key] = value;
  }
  return {
    preferences,
    scene,
    displayScene,
    sourceView,
    background,
    rotate,
    inverse,
    camera,
    project,
    onPlane,
    corners,
    depthControl,
    setProperty,
    clothGeometry,
  };
})();

export default api;
