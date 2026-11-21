import type { RuntimeDocument, RuntimeValidators } from '../../shared/runtime';
import core from './runtime-core.ts';
import importedCardCharacterAnimation from '../character/character-animation-model.ts';
import importedCardExportProfile from './export-profile.ts';
import importedCardTitle from '../editing/title-model.ts';
import characterEffects from './character-effects.ts';
function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(message);
  return value as Record<string, unknown>;
}
export function createRuntimeValidator(validators: RuntimeValidators) {
  const { defaults, compositionDefaults, armorDefaults, animationTracks } =
    core;
  const range = (v: unknown, a: number, b: number): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
  function validate(value: unknown) {
    const input = record(value, '运行时文档无效');
    if (
      !Array.isArray(input.layers) ||
      input.layers.some(
        (layer: unknown) =>
          !layer || typeof layer !== 'object' || Array.isArray(layer),
      )
    )
      throw Error('运行时图层无效');
    const doc = input as RuntimeDocument;
    if (doc.exportSettings)
      importedCardExportProfile.validate(doc.exportSettings);
    importedCardCharacterAnimation.validate(doc);
    if (doc.backScene) validators.back(doc.backScene);
    if (doc.cosmetics) validators.cosmetics(doc.cosmetics);
    validators.spatial(doc);
    validators.frame(doc);
    validators.stats(doc);
    importedCardTitle.validate(doc);
    validators.components(doc);
    characterEffects.validate(doc.characterEffects);
    if (
      doc.effects?.flowSpeed !== undefined &&
      !range(doc.effects.flowSpeed, 0, 5)
    )
      throw Error('流光速度无效');
    if (
      doc.composition &&
      (typeof doc.composition !== 'object' ||
        Array.isArray(doc.composition) ||
        Object.keys(doc.composition).some(
          (k) =>
            !Object.hasOwn(compositionDefaults, k) ||
            typeof doc.composition?.[k] !== 'boolean',
        ))
    )
      throw Error('框内外方向无效');
    if (doc.armor)
      importedCardTitle.validateSweep({ ...armorDefaults, ...doc.armor });
    if (
      doc.deformation &&
      !['bend', 'wind', 'speed'].every((k) =>
        range(
          doc.deformation?.[k],
          k === 'bend' ? -1 : 0,
          k === 'speed' ? 5 : k === 'bend' ? 1 : 2,
        ),
      )
    )
      throw Error('几何形变参数无效');
    if (doc.shader) {
      const s = { ...defaults.shader, ...doc.shader };
      if (
        typeof s.editorMode !== 'string' ||
        !['glsl', 'nodes'].includes(s.editorMode)
      )
        throw Error('Shader 编辑模式无效');
      if (s.graphs) {
        if (
          typeof s.graphs !== 'object' ||
          Array.isArray(s.graphs) ||
          Object.keys(s.graphs).some(
            (k) => !['geometry', 'fragment'].includes(k),
          )
        )
          throw Error('Shader 节点阶段无效');
        for (const [stage, g] of Object.entries(s.graphs)) {
          validators.graph(g, stage);
        }
      }
      if (
        typeof s.fragmentPrelude !== 'string' ||
        s.fragmentPrelude.length > 65536
      )
        throw Error('GLSL 辅助函数无效');
      if (
        typeof s.geometryBody !== 'string' ||
        s.geometryBody.length > 4096 ||
        typeof s.fragmentBody !== 'string' ||
        s.fragmentBody.length > 4096
      )
        throw Error('GLSL 函数无效');
      if (
        typeof s.fragmentMask !== 'string' ||
        ![
          'none',
          'motion',
          'inset',
          'emission',
          'phase',
          'rigid',
          'coverage',
          'foil',
        ].includes(s.fragmentMask) ||
        !range(s.fragmentStrength, 0, 3) ||
        !(
          s.fragmentTarget === 'all' ||
          doc.layers.some((l) => l.id === s.fragmentTarget)
        )
      )
        throw Error('GLSL 效果参数无效');
    }
    if (doc.actions) {
      if (!Array.isArray(doc.actions) || doc.actions.length > 24)
        throw Error('动作数量超限');
      const ids = new Set<string>();
      for (const a of doc.actions) {
        if (
          !/^[\w-]{1,100}$/.test(a.id) ||
          ids.has(a.id) ||
          typeof a.name !== 'string' ||
          a.name.length > 100 ||
          !['idle', 'hover', 'trigger', 'flip', 'enter', 'exit'].includes(
            a.event || '',
          ) ||
          !range(a.duration, 0.1, 30) ||
          typeof a.loop !== 'boolean' ||
          !range(a.motion, 0, 3) ||
          !range(a.emission, 0, 5) ||
          !range(a.bend, -1, 1)
        )
          throw Error('动作属性无效');
        ids.add(a.id);
        if (
          a.transitionDuration !== undefined &&
          !range(a.transitionDuration, 0, 2)
        )
          throw Error('动作过渡时长无效');
        if (a.drawOrder !== undefined) {
          if (!Array.isArray(a.drawOrder) || a.drawOrder.length > 64)
            throw Error('动画层序关键帧无效');
          let previous = -1;
          for (const frame of a.drawOrder) {
            if (
              !frame ||
              !range(frame.at, 0, 1) ||
              frame.at <= previous ||
              !Array.isArray(frame.layers) ||
              frame.layers.length > 64 ||
              new Set(frame.layers).size !== frame.layers.length ||
              frame.layers.some(
                (id) =>
                  typeof id !== 'string' ||
                  !doc.layers.some(
                    (l) =>
                      l.id === id &&
                      l.kind !== 'frame' &&
                      l.kind !== 'background' &&
                      !['far', 'mid', 'near'].includes(l.spatial?.role || '') &&
                      !['baseplate', 'background-candidate'].includes(
                        l.role || '',
                      ),
                  ),
              )
            )
              throw Error('动画层序引用或时间无效');
            previous = frame.at;
          }
        }
        if (a.tracks !== undefined) {
          if (
            !a.tracks ||
            typeof a.tracks !== 'object' ||
            Array.isArray(a.tracks)
          )
            throw Error('动画轨道无效');
          for (const [key, frames] of Object.entries(a.tracks)) {
            const spec = animationTracks[key];
            if (
              !spec ||
              !Array.isArray(frames) ||
              frames.length < 1 ||
              frames.length > 64
            )
              throw Error('动画轨道无效');
            let last = -1;
            for (const value of frames as unknown[]) {
              const f = record(value, '动画关键帧无效');
              if (
                !f ||
                !range(f.at, 0, 1) ||
                f.at <= last ||
                !range(f.value, spec.min, spec.max) ||
                (!!f.ease &&
                  (typeof f.ease !== 'string' ||
                    !['linear', 'smooth', 'hold'].includes(f.ease)))
              )
                throw Error('动画关键帧无效');
              last = f.at;
            }
          }
        }
      }
    }
    const slots = new Set<string>();
    if (doc.slots) {
      if (!Array.isArray(doc.slots) || doc.slots.length > 32)
        throw Error('Slot 数量超限');
      for (const s of doc.slots) {
        if (
          !/^[\w-]{1,100}$/.test(s.id) ||
          slots.has(s.id) ||
          typeof s.name !== 'string' ||
          s.name.length > 100 ||
          !range(s.u, 0, 1) ||
          !range(s.v, 0, 1) ||
          !range(s.z, -0.2, 0.4) ||
          !range(s.scale, 0.05, 4) ||
          !range(s.rotation, -180, 180) ||
          typeof s.clip !== 'boolean' ||
          !['none', 'pulse', 'flow'].includes(s.effect || '') ||
          !range(s.strength, 0, 3) ||
          !range(s.speed, 0, 5)
        )
          throw Error('Slot 属性无效');
        slots.add(s.id);
      }
    }
    for (const l of doc.layers) {
      if (
        l.shaderChannel !== undefined &&
        (!Number.isInteger(l.shaderChannel) || !range(l.shaderChannel, 0, 255))
      )
        throw Error('图层 Shader 通道无效');
      if (
        l.shaderTransparent !== undefined &&
        typeof l.shaderTransparent !== 'boolean'
      )
        throw Error('图层 Shader 透明扩展无效');
      if (
        l.pivot &&
        (!range(l.pivot.u, 0, 1) ||
          !range(l.pivot.v, 0, 1) ||
          l.kind === 'frame')
      )
        throw Error('旋转中心无效');
      if (l.rotation !== undefined && !range(l.rotation, -180, 180))
        throw Error('图层旋转无效');
      if (l.motionAnchor)
        validators.attachment({
          maxOffset: 0.025,
          blendWidth: 64,
          anchor: {
            edge: 'segment',
            ...record(l.motionAnchor, '衣料锚点无效'),
          },
        });
      if (
        l.slotId &&
        (!slots.has(l.slotId) || !['image', 'text'].includes(l.kind))
      )
        throw Error('图层 Slot 绑定无效');
      if (
        l.blend &&
        (typeof l.blend !== 'string' || !['normal', 'add'].includes(l.blend))
      )
        throw Error('混合模式无效');
      if (l.adjustments) {
        const a = l.adjustments;
        if (
          !range(a.brightness, -100, 100) ||
          !range(a.contrast, -100, 100) ||
          !range(a.saturation, 0, 200) ||
          !range(a.gamma, 0.2, 3)
        )
          throw Error('图像调整参数无效');
      }
    }
  }

  return validate;
}
