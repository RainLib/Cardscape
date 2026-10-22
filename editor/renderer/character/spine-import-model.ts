/* Public Spine JSON data -> self-owned native rig. No Spine runtime is used.
 * Attachments map explicitly to existing registered images and UV rectangles. */
import type { CardDocument, CardLayer } from '../../shared/document';
import type {
  SpineSource,
  SpineOptions,
  SpineEntry,
  SpineFrame,
  ImportPlan,
  FFDInfo,
} from '../../shared/spine';
import type {
  Bone,
  CharacterRig,
  CharacterAction,
  SkinMesh,
  Weight,
  CompiledRig,
  Keyframe,
  DeformFrame,
  Ease,
} from '../../shared/character';
import importedCardCharacterAnimation from './character-animation-model.ts';

const api = (() => {
  'use strict';
  function required<K, V>(map: Map<K, V>, key: K): V {
    const value = map.get(key);
    if (value === undefined) throw Error('Spine 引用不存在');
    return value;
  }

  const schema = 'card-character-animation-import/1',
    num = (v: number | undefined, f = 0) => (v === undefined ? f : v);
  function inspect(
    source: SpineSource,
    {
      document: doc,
      layerMap = {},
      scale = 1,
      origin = [512, 768],
      skin = 'default',
      loop = false,
      images = {},
    }: SpineOptions = {},
  ) {
    const newLayers: CardLayer[] = [],
      localMap = { ...layerMap };
    doc = structuredClone(doc);
    for (const [key, image] of Object.entries(images)) {
      if (!doc) throw Error('导入图集图片需要目标工程');
      if (
        !image ||
        typeof image.src !== 'string' ||
        !image.src.startsWith('data:image/png;base64,') ||
        image.src.length > 24 * 1024 * 1024
      )
        throw Error('图集图片数据无效');
      let id = 'sp-img' + newLayers.length;
      while (doc.layers.some((l) => l.id === id)) id += 'x';
      const layer: CardLayer = {
        id,
        name: key.slice(0, 100),
        kind: 'image',
        src: image.src,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
      };
      newLayers.push(layer);
      doc.layers.unshift(layer);
      localMap[key] = { layerId: id, uvRect: image.uvRect };
    }
    layerMap = localMap;
    const record = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === 'object' && !Array.isArray(v);
    const errors: string[] = [],
      warnings: string[] = [],
      fail = (message: string) => {
        if (!errors.includes(message)) errors.push(message);
      };
    if (
      !source ||
      !Array.isArray(source.bones) ||
      !source.bones.length ||
      source.bones.length > 64 ||
      !source.skeleton ||
      typeof source.skeleton.spine !== 'string' ||
      !/^((3\.8)|(4\.[0123]))(\.|$)/.test(source.skeleton.spine || '')
    )
      throw Error(
        '请选择 Spine 3.8 / 4.0–4.3 的 JSON 导出（最多 64 骨骼）；不支持 .spine / .skel 二进制',
      );
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      scale > 100 ||
      !Array.isArray(origin) ||
      origin.length !== 2 ||
      origin.some((v) => !Number.isFinite(v) || Math.abs(v) > 4096)
    )
      throw Error('导入缩放或原点无效');
    for (const key of ['ik', 'transform', 'path', 'physics', 'slots'] as const)
      if (source[key] !== undefined && !Array.isArray(source[key]))
        throw Error('Spine ' + key + ' 必须是数组');
    if (source.animations !== undefined && !record(source.animations))
      throw Error('Spine animations 必须是对象');
    const slots = entries(source, skin);
    if (!Array.isArray(slots) || slots.length > 32)
      throw Error('Spine Slot 数量超过 32');
    for (const key of ['transform', 'path', 'physics'] as const)
      if (source[key]?.length) fail(key + ' 约束尚不支持');
    const boneNames = new Map<string, string>(),
      bones: Bone[] = source.bones.map((b, i) => {
        if (
          !b ||
          typeof b.name !== 'string' ||
          !b.name ||
          boneNames.has(b.name)
        )
          throw Error('Spine 骨骼名称缺失或重复');
        boneNames.set(b.name, 'sp-b' + i);
        return {
          id: 'sp-b' + i,
          name: b.name.slice(0, 100),
          parentId: null,
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1,
        };
      });
    source.bones.forEach((b, i) => {
      for (const key of [
        'x',
        'y',
        'rotation',
        'scaleX',
        'scaleY',
        'shearX',
        'shearY',
        'length',
      ] as const)
        if (b[key] !== undefined && !Number.isFinite(b[key]))
          throw Error('Spine 骨骼数值无效：' + b.name);
      const sx = num(b.scaleX, 1),
        sy = num(b.scaleY, 1);
      if (
        sx !== sy ||
        sx <= 0 ||
        num(b.shearX) ||
        num(b.shearY) ||
        (b.transform && String(b.transform).toLowerCase() !== 'normal') ||
        (b.inherit && String(b.inherit).toLowerCase() !== 'normal') ||
        b.skin
      )
        fail('骨骼 ' + b.name + ' 的非均匀缩放、反射、剪切或特殊继承尚不支持');
      if (b.parent && !boneNames.has(b.parent))
        throw Error('Spine 父骨骼不存在：' + b.parent);
      Object.assign(bones[i], {
        parentId: b.parent ? required(boneNames, b.parent) : null,
        x: (b.parent ? 0 : origin[0]) + num(b.x) * scale,
        y: (b.parent ? 0 : origin[1]) - num(b.y) * scale,
        rotation: -num(b.rotation),
        scale: sx,
        tip: [num(b.length) * scale, 0],
      });
    });
    const rig: CharacterRig &
      Required<Pick<CharacterRig, 'constraints' | 'meshes' | 'expressions'>> = {
      schema: 'card-character-rig/1',
      bones,
      bindings: [],
      constraints: [],
      meshes: [],
      expressions: [],
    };
    let compiled: CompiledRig;
    try {
      compiled = importedCardCharacterAnimation.compile(rig);
    } catch (e) {
      throw Error(
        'Spine 骨架无效：' + (e instanceof Error ? e.message : String(e)),
      );
    }
    if (
      source.skins !== undefined &&
      (!source.skins ||
        typeof source.skins !== 'object' ||
        Object.keys(source.skins).length > 128)
    )
      throw Error('Spine Skin 格式无效或超过 128 个');
    const skins = Array.isArray(source.skins)
      ? source.skins.map((s) => ({
          name: s.name,
          attachments: s.attachments || {},
        }))
      : Object.entries(source.skins || {}).map(([name, attachments]) => ({
          name,
          attachments,
        }));
    const chosen =
      skins.find((s) => s.name === skin) ||
      (!skins.length ? { name: skin, attachments: {} } : null);
    if (!chosen) throw Error('Spine Skin 不存在：' + skin);
    const fallback = skins.find((s) => s.name === 'default')?.attachments || {};
    const mapping: Array<{
        slot: string;
        sourceSlot: string;
        attachment: string;
        layerId: string;
        type: string;
      }> = [],
      used = new Set<string>(),
      slotNames = new Set<string>(),
      ffdInfos: FFDInfo[] = [];
    const worldPoint = (boneId: string, x: number, y: number) =>
      importedCardCharacterAnimation.point(
        required(compiled.rest, boneId),
        x * scale,
        -y * scale,
      );
    for (const slot of slots) {
      if (
        !slot ||
        typeof slot.name !== 'string' ||
        slotNames.has(slot.name) ||
        !boneNames.has(slot.bone)
      )
        throw Error('Spine Slot 无效或重复');
      slotNames.add(slot.name);
      if (!slot.attachment) continue;
      if (slot.visible === false) fail('隐藏 Slot 尚不支持：' + slot.name);
      if (
        (slot.color && slot.color.toLowerCase() !== 'ffffffff') ||
        slot.dark ||
        (slot.blend && slot.blend !== 'normal')
      )
        fail('Slot ' + slot.name + ' 的颜色或混合模式尚不支持');
      const rawMap = layerMap[slot.name],
        m = typeof rawMap === 'string' ? { layerId: rawMap } : rawMap,
        layer = doc?.layers?.find((l) => l.id === m?.layerId),
        attachment = slot.attachmentData;
      mapping.push({
        slot: slot.name,
        sourceSlot: slot.sourceSlot,
        attachment: slot.attachment,
        layerId: layer?.id || '',
        type: attachment?.type || 'region',
      });
      if (!doc || !layer) {
        fail('请映射图片：' + slot.name);
        continue;
      }
      if (
        used.has(layer.id) ||
        !['image', 'foreground'].includes(layer.kind) ||
        layer.locked ||
        layer.previewReference
      ) {
        fail('图片映射重复、锁定或不可编辑：' + slot.name);
        continue;
      }
      used.add(layer.id);
      if (!attachment) {
        fail('找不到附件：' + slot.name + '/' + slot.attachment);
        continue;
      }
      if (attachment.sequence || attachment.parent) {
        fail('序列或链接 Mesh 附件尚不支持：' + slot.name);
        continue;
      }
      for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const)
        if (attachment[key] !== undefined && !Number.isFinite(attachment[key]))
          throw Error('附件数值无效：' + slot.name);
      const type = attachment.type || 'region';
      if (!['region', 'mesh'].includes(type)) {
        fail('附件类型尚不支持：' + slot.name + ' / ' + type);
        continue;
      }
      if (attachment.color && attachment.color.toLowerCase() !== 'ffffffff')
        fail('附件颜色尚不支持：' + slot.name);
      const boneId = required(boneNames, slot.bone),
        uvRect = m.uvRect || [0, 0, 1024, 1536];
      if (
        !Array.isArray(uvRect) ||
        uvRect.length !== 4 ||
        uvRect.some((v) => !Number.isFinite(v)) ||
        uvRect[0] < 0 ||
        uvRect[1] < 0 ||
        uvRect[2] <= 0 ||
        uvRect[3] <= 0 ||
        uvRect[0] + uvRect[2] > 1024 ||
        uvRect[1] + uvRect[3] > 1536
      )
        throw Error('图片 UV 矩形无效：' + slot.name);
      const ffd: Omit<FFDInfo, 'mesh' | 'inv'> = {
          slot: slot.sourceSlot,
          attachment: slot.attachment,
          skin: slot.attachmentSkin,
          refs: [],
        },
        bindPoints = [];
      const mesh: SkinMesh = {
          layerId: layer.id,
          vertices: [],
          uv: [],
          triangles: [],
          weights: [],
          morphs: [],
        },
        pl = windowPlacement(doc, layer),
        inv = importedCardCharacterAnimation.inverse(
          importedCardCharacterAnimation.matrix(
            512 + pl.x,
            768 + pl.y,
            (pl.rotation * 180) / Math.PI,
            pl.scale,
          ),
        );
      const add = (
        p: { x: number; y: number },
        uv: number[],
        weights: Weight[],
      ) => {
        const q = importedCardCharacterAnimation.point(inv, p.x, p.y);
        mesh.vertices.push(q.x + 512, q.y + 768);
        mesh.uv.push(
          (uvRect[0] + uv[0] * uvRect[2]) / 1024,
          (uvRect[1] + uv[1] * uvRect[3]) / 1536,
        );
        mesh.weights.push(weights);
      };
      if (type === 'region') {
        const w = attachment.width,
          h = attachment.height;
        if (
          typeof w !== 'number' ||
          typeof h !== 'number' ||
          !Number.isFinite(w) ||
          !Number.isFinite(h) ||
          w <= 0 ||
          h <= 0
        )
          throw Error('Region 需要有效宽高：' + slot.name);
        const a = importedCardCharacterAnimation.matrix(
            num(attachment.x) * scale,
            -num(attachment.y) * scale,
            -num(attachment.rotation),
            1,
          ),
          sx = num(attachment.scaleX, 1),
          sy = num(attachment.scaleY, 1);
        if (sx <= 0 || sy <= 0) fail('Region 反射尚不支持：' + slot.name);
        for (const [x, y, u, v] of [
          [-w / 2, h / 2, 0, 0],
          [w / 2, h / 2, 1, 0],
          [w / 2, -h / 2, 1, 1],
          [-w / 2, -h / 2, 0, 1],
        ] as const) {
          const q = importedCardCharacterAnimation.point(
              a,
              x * sx * scale,
              -y * sy * scale,
            ),
            p = importedCardCharacterAnimation.point(
              required(compiled.rest, boneId),
              q.x,
              q.y,
            );
          add(p, [u, v], [{ boneId, weight: 1 }]);
        }
        mesh.triangles = [0, 2, 1, 0, 3, 2];
      } else {
        const uv = attachment.uvs,
          v = attachment.vertices;
        if (
          !Array.isArray(uv) ||
          uv.length < 6 ||
          uv.length % 2 ||
          uv.length > 8192 ||
          uv.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
          !Array.isArray(v) ||
          v.length > 81920 ||
          v.some((v) => !Number.isFinite(v)) ||
          !Array.isArray(attachment.triangles)
        )
          throw Error('Spine Mesh 数据无效或超限：' + slot.name);
        let cursor = 0;
        for (let i = 0; i < uv.length / 2; i++) {
          if (v.length === uv.length) {
            ffd.refs.push({ index: i, boneId, offset: cursor });
            add(
              worldPoint(boneId, v[cursor++], v[cursor++]),
              uv.slice(i * 2, i * 2 + 2),
              [{ boneId, weight: 1 }],
            );
            continue;
          }
          const count = v[cursor++];
          if (!Number.isInteger(count) || count < 1 || count > 4)
            throw Error('每顶点最多支持 4 根 Spine 骨骼：' + slot.name);
          const influences = [],
            points = [];
          let total = 0,
            px = 0,
            py = 0;
          for (let j = 0; j < count; j++) {
            const index = v[cursor++],
              offset = ffd.refs.length * 2,
              x = v[cursor++],
              y = v[cursor++],
              weight = v[cursor++];
            ffd.refs.push({ index: i, boneId: bones[index]?.id, offset });
            if (
              !Number.isInteger(index) ||
              !bones[index] ||
              ![x, y, weight].every(Number.isFinite) ||
              weight < 0 ||
              weight > 1
            )
              throw Error('Spine 顶点权重无效：' + slot.name);
            const p = worldPoint(bones[index].id, x, y);
            px += p.x * weight;
            py += p.y * weight;
            total += weight;
            points.push({ p, weight, boneId: bones[index].id });
            influences.push({ boneId: bones[index].id, weight });
          }
          if (
            Math.abs(total - 1) > 1e-5 ||
            new Set<string>(influences.map((w) => w.boneId)).size !== count
          )
            throw Error('Spine 顶点权重未归一化或重复：' + slot.name);
          for (const q of points) {
            const p = importedCardCharacterAnimation.point(inv, q.p.x, q.p.y),
              v = importedCardCharacterAnimation.point(inv, px, py);
            if (Math.hypot(p.x - v.x, p.y - v.y) > 1e-8)
              bindPoints.push({
                boneId: q.boneId,
                index: i,
                x: p.x - v.x,
                y: p.y - v.y,
              });
          }
          add({ x: px, y: py }, uv.slice(i * 2, i * 2 + 2), influences);
        }
        if (cursor !== v.length)
          throw Error('Spine Mesh 顶点长度不一致：' + slot.name);
        mesh.triangles = [...attachment.triangles];
      }
      if (bindPoints.length) {
        mesh.binds = {};
        for (const b of bindPoints)
          (mesh.binds[b.boneId] ||= []).push(b.index, b.x, b.y);
      }
      ffdInfos.push({ ...ffd, mesh, inv });
      const old = doc.characterRig?.meshes?.find((m) => m.layerId === layer.id);
      if (old?.depths) {
        mesh.depths = transferDepth(old, mesh.uv);
        warnings.push('已按 UV 保留已有图片的顶点深度：' + slot.name);
      }
      rig.bindings.push({
        layerId: layer.id,
        boneId,
        opacity: slot.setup ? 1 : 0,
      });
      rig.meshes.push(mesh);
    }
    const constraintNames = new Map<string, string>();
    for (const [i, c] of (source.ik || []).entries()) {
      if (
        !c ||
        typeof c.name !== 'string' ||
        constraintNames.has(c.name) ||
        !Array.isArray(c.bones) ||
        !c.bones.length ||
        c.bones.length > 2 ||
        !c.bones.every((n) => boneNames.has(n)) ||
        !boneNames.has(c.target)
      )
        throw Error('Spine IK 无效');
      if (c.stretch || c.compress || num(c.softness) || c.skin)
        fail('IK ' + c.name + ' 的伸缩、软化或 Skin 约束尚不支持');
      const last = bones.find(
        (b) => b.id === required(boneNames, c.bones[c.bones.length - 1]),
      );
      if (!last?.tip) throw Error('Spine IK 末端不存在');
      constraintNames.set(c.name, 'sp-ik' + i);
      rig.constraints.push({
        id: 'sp-ik' + i,
        name: c.name.slice(0, 100),
        rootId: required(boneNames, c.bones[0]),
        tipId: last.id,
        end: last.tip,
        target: [0, 0],
        targetBoneId: required(boneNames, c.target),
        bend: c.bendPositive === false ? 1 : -1,
        mix: num(c.mix, 1),
        order: num(c.order, i),
        solver: c.bones.length === 1 ? 'ccd' : 'analytic',
      });
    }
    const actions: CharacterAction[] = [],
      animationEntries = Object.entries(source.animations || {});
    if (animationEntries.length > 24) throw Error('Spine 动作超过 24 个');
    for (const [index, [name, animation]] of animationEntries.entries()) {
      if (
        !record(animation) ||
        (animation.bones !== undefined && !record(animation.bones)) ||
        (animation.ik !== undefined && !record(animation.ik))
      )
        throw Error('Spine 动画格式无效');
      for (const key of Object.keys(animation))
        if (
          !['bones', 'ik', 'deform', 'attachments', 'slots'].includes(key) &&
          Object.keys(animation[key] || {}).length
        )
          fail('动画 ' + name + ' / ' + key + ' 尚不支持');
      let duration = 0;
      function scan(v: unknown): void {
        if (Array.isArray(v))
          for (const f of v) {
            if (
              f &&
              typeof f === 'object' &&
              !Array.isArray(f) &&
              'time' in f
            ) {
              if (!Number.isFinite(f.time) || f.time < 0)
                throw Error('Spine 关键帧时间无效');
              duration = Math.max(duration, f.time);
            } else scan(f);
          }
        else if (v && typeof v === 'object')
          for (const a of Object.values(v)) scan(a);
      }
      scan(animation);
      duration = duration || 1;
      if (duration > 30) throw Error('Spine 动作最长 30 秒');
      const action: CharacterAction &
        Required<Pick<CharacterAction, 'boneTracks' | 'ikTracks'>> = {
        id: 'sp-action' + index,
        name: name.slice(0, 100) || 'Spine 动作',
        event: 'trigger',
        duration,
        loop: !!loop,
        motion: 1,
        emission: 1,
        bend: 0,
        boneTracks: {},
        ikTracks: {},
      };
      for (const [name, tracks] of Object.entries(animation.bones || {})) {
        if (!record(tracks)) throw Error('Spine 骨骼轨道格式无效');
        if (!boneNames.has(name)) throw Error('Spine 动画引用不存在的骨骼');
        const id = required(boneNames, name),
          out: Record<string, Keyframe[]> = {};
        for (const [type, frames] of Object.entries(tracks)) {
          if (!['rotate', 'translate', 'scale'].includes(type)) {
            fail('骨骼轨道 ' + type + ' 尚不支持');
            continue;
          }
          if (!Array.isArray(frames) || !frames.length || frames.length > 256)
            throw Error('Spine 关键帧数量无效');
          if (type === 'rotate')
            out.rotation = timeline(
              frames,
              duration,
              (f) => -num(f.angle, num(f.value)),
              source.skeleton.spine,
              0,
              -1,
              0,
            );
          if (type === 'translate') {
            out.x = timeline(
              frames,
              duration,
              (f) => num(f.x) * scale,
              source.skeleton.spine,
              0,
              scale,
              0,
            );
            out.y = timeline(
              frames,
              duration,
              (f) => -num(f.y) * scale,
              source.skeleton.spine,
              1,
              -scale,
              0,
            );
          }
          if (type === 'scale') {
            if (
              source.skeleton.spine.startsWith('4.') &&
              frames.some((f) => {
                const curve = f.curve;
                return (
                  Array.isArray(curve) &&
                  (curve.length !== 8 ||
                    curve
                      .slice(0, 4)
                      .some((v, i) => Math.abs(v - curve[i + 4]) > 1e-9))
                );
              })
            )
              fail('缩放贝塞尔的 X/Y 通道不一致或缺失：' + name);
            if (frames.some((f) => num(f.x, 1) !== num(f.y, 1)))
              fail('非均匀缩放动画尚不支持：' + name);
            out.scale = timeline(
              frames,
              duration,
              (f) => num(f.x, 1),
              source.skeleton.spine,
              0,
              1,
              1,
            );
          }
        }
        action.boneTracks[id] = out;
      }
      for (const [name, frames] of Object.entries(animation.ik || {})) {
        if (!constraintNames.has(name))
          throw Error('Spine IK 动画引用不存在的约束');
        const c = rig.constraints.find(
          (c) => c.id === required(constraintNames, name),
        );
        if (!c) throw Error('Spine IK 目标不存在');
        if (!Array.isArray(frames)) throw Error('Spine IK 轨道格式无效');
        if (
          frames.some(
            (f) =>
              num(f.softness) ||
              (f.bendPositive !== undefined &&
                (f.bendPositive === false ? 1 : -1) !== c.bend) ||
              f.stretch ||
              f.compress,
          )
        )
          fail('IK 弯曲侧、伸缩或软化动画尚不支持：' + name);
        action.ikTracks[c.id] = {
          mix: timeline(
            frames,
            duration,
            (f) => num(f.mix, 1),
            source.skeleton.spine,
            0,
            1,
            1,
          ),
        };
      }
      for (const [slotName, tracks] of Object.entries(animation.slots || {})) {
        if (!record(tracks)) throw Error('Spine Slot 轨道无效');
        for (const key of Object.keys(tracks))
          if (key !== 'attachment')
            fail('Slot 动画 ' + key + ' 尚不支持：' + slotName);
        const frames = tracks.attachment;
        if (!frames) continue;
        if (!Array.isArray(frames) || !frames.length || frames.length > 256)
          throw Error('附件切换帧无效');
        let previous = -1;
        for (const f of frames) {
          const time = num(f.time);
          if (
            !record(f) ||
            !Number.isFinite(time) ||
            time < 0 ||
            time <= previous ||
            (f.name !== undefined &&
              f.name !== null &&
              typeof f.name !== 'string')
          )
            throw Error('附件切换关键帧无效');
          previous = time;
        }
        for (const m of mapping.filter(
          (m) => m.sourceSlot === slotName && m.layerId,
        )) {
          const setup = source.slots?.find(
            (s) => s.name === slotName,
          )?.attachment;
          const out: Keyframe[] = [];
          if (num(frames[0].time) > 0)
            out.push({
              at: 0,
              value: m.attachment === setup ? 1 : 0,
              ease: 'hold',
            });
          for (const f of frames)
            out.push({
              at: num(f.time) / duration,
              value: f.name === m.attachment ? 1 : 0,
              ease: 'hold',
            });
          (action.layerTracks ||= {})[m.layerId] = { opacity: out };
        }
      }
      const deform = animation.deform || {};
      if (
        !record(deform) ||
        (animation.attachments !== undefined && !record(animation.attachments))
      )
        throw Error('Spine FFD 格式无效');
      const deformations = [];
      for (const [skinName, slots] of Object.entries(deform))
        for (const [slotName, attachments] of Object.entries(slots))
          for (const [attachment, frames] of Object.entries(attachments))
            deformations.push({ skinName, slotName, attachment, frames });
      for (const [skinName, slots] of Object.entries(
        animation.attachments || {},
      ))
        for (const [slotName, attachments] of Object.entries(slots))
          for (const [attachment, tracks] of Object.entries(attachments)) {
            for (const key of Object.keys(tracks))
              if (key !== 'deform')
                fail('附件动画 ' + key + ' 尚不支持：' + slotName);
            if (tracks.deform)
              deformations.push({
                skinName,
                slotName,
                attachment,
                frames: tracks.deform,
              });
          }
      for (const track of deformations) {
        const info = ffdInfos.find(
          (f) =>
            f.slot === track.slotName &&
            f.attachment === track.attachment &&
            f.skin === track.skinName,
        );
        if (!info) {
          if (track.skinName === skin || track.skinName === 'default')
            fail(
              'FFD 目标不是当前可导入网格：' +
                track.slotName +
                '/' +
                track.attachment,
            );
          continue;
        }
        if (!info.refs.length) {
          fail('FFD 仅支持 Mesh：' + track.slotName);
          continue;
        }
        info.mesh.binds ||= {};
        const frames = deformFrames(
          track.frames,
          duration,
          info,
          compiled,
          scale,
          source.skeleton.spine,
        );
        (action.deformTracks ||= {})[info.mesh.layerId] = frames;
      }
      actions.push(action);
    }
    if (!actions.length)
      actions.push({
        id: 'sp-action0',
        name: 'Spine 初始姿势',
        event: 'trigger',
        duration: 1,
        loop: false,
        motion: 1,
        emission: 1,
        bend: 0,
      });
    if (!errors.length)
      try {
        importedCardCharacterAnimation.validate({
          ...doc,
          layers: doc?.layers || [],
          characterRig: rig,
          actions,
        });
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    warnings.push('按 Slot 绘制顺序调整映射图层的遮挡，未映射图层保留位置。');
    warnings.push(
      '仅导入所选 Skin 的初始附件；支持图集新增图片或映射已有图层；附件切换保留为独立图层可见性轨道。',
    );
    warnings.push(
      '贝塞尔轨道保留为自有曲线关键帧，FFD 在蒙皮前按骨骼分别应用。',
    );
    return {
      version: source.skeleton.spine,
      skin: chosen.name,
      skins: skins.map((s) => s.name),
      mapping,
      counts: {
        bones: bones.length,
        meshes: rig.meshes.length,
        constraints: rig.constraints.length,
        actions: actions.length,
      },
      unsupported: errors,
      warnings,
      plan: {
        schema,
        characterRig: rig,
        actions,
        newLayers,
        layerOrder: mapping
          .filter((m) => m.layerId)
          .map((m) => m.layerId)
          .reverse(),
      },
    };
  }

  function entries(source: SpineSource, skin = 'default') {
    const skins = Array.isArray(source.skins)
      ? source.skins.map((s) => ({
          name: s.name,
          attachments: s.attachments || {},
        }))
      : Object.entries(source.skins || {}).map(([name, attachments]) => ({
          name,
          attachments,
        }));
    const chosen = skins.find((s) => s.name === skin)?.attachments || {},
      fallback = skins.find((s) => s.name === 'default')?.attachments || {},
      out: SpineEntry[] = [];
    for (const slot of source.slots || []) {
      const names = new Set<string>(slot.attachment ? [slot.attachment] : []);
      for (const a of Object.values(source.animations || {}))
        for (const f of a.slots?.[slot.name]?.attachment || [])
          if (typeof f.name === 'string') names.add(f.name);
      for (const name of names) {
        const own = chosen[slot.name]?.[name],
          attachmentData = own || fallback[slot.name]?.[name];
        out.push({
          ...slot,
          name: name === slot.attachment ? slot.name : slot.name + ' @ ' + name,
          sourceSlot: slot.name,
          attachment: name,
          attachmentData,
          attachmentSkin: own ? skin : 'default',
          setup: name === slot.attachment,
        });
      }
    }
    return out;
  }
  function deformFrames(
    frames: SpineFrame[],
    duration: number,
    info: FFDInfo,
    compiled: CompiledRig,
    scale: number,
    version: string,
  ) {
    if (!Array.isArray(frames) || !frames.length || frames.length > 256)
      throw Error('FFD 帧数无效');
    let previous = -1;
    const output: Record<string, DeformFrame[]> = {},
      size = info.refs.length * 2;
    for (let j = 0; j < frames.length; j++) {
      const f = frames[j],
        time = num(f.time),
        offset = num(f.offset),
        values = f.vertices || [];
      if (
        !f ||
        !Number.isFinite(time) ||
        time < 0 ||
        time <= previous ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Array.isArray(values) ||
        offset + values.length > size ||
        values.some((v) => !Number.isFinite(v))
      )
        throw Error('FFD 时间、稀疏偏移或顶点数据无效');
      previous = time;
      const curve = f.curve;
      if (
        curve !== undefined &&
        curve !== 'stepped' &&
        (!Array.isArray(curve) ||
          curve.length !== 4 ||
          curve.some((v) => !Number.isFinite(v)))
      )
        throw Error('FFD 曲线格式无效');
      const groups: Record<string, number[]> = {};
      for (const ref of info.refs) {
        const x = (values[ref.offset - offset] || 0) * scale,
          y = -(values[ref.offset + 1 - offset] || 0) * scale,
          m = importedCardCharacterAnimation.multiply(
            info.inv,
            required(compiled.rest, ref.boneId),
          ),
          dx = m[0] * x + m[2] * y,
          dy = m[1] * x + m[3] * y;
        groups[ref.boneId] ||= [];
        if (Math.hypot(dx, dy) > 1e-10)
          groups[ref.boneId].push(ref.index, dx, dy);
      }
      for (const id of new Set<string>(info.refs.map((r) => r.boneId))) {
        const out: DeformFrame = {
          at: time / duration,
          deltas: groups[id] || [],
          ease: curve === 'stepped' ? 'hold' : 'linear',
        };
        if (Array.isArray(curve) && j + 1 < frames.length) {
          const end = num(frames[j + 1].time);
          out.curve = version.startsWith('4.')
            ? [
                (curve[0] - time) / (end - time),
                curve[1],
                (curve[2] - time) / (end - time),
                curve[3],
              ]
            : [...curve];
        }
        (output[id] ||= []).push(out);
      }
    }
    return output;
  }

  function transferDepth(old: SkinMesh, uv: number[]) {
    const depths = old.depths;
    if (!depths) throw Error('缺少网格深度');
    const known = new Map<string, number>(
      depths.map((z, i) => [
        old.uv[i * 2].toFixed(7) + ':' + old.uv[i * 2 + 1].toFixed(7),
        z,
      ]),
    );
    const output = [];
    for (let i = 0; i < uv.length; i += 2) {
      const x = uv[i],
        y = uv[i + 1],
        exact = known.get(x.toFixed(7) + ':' + y.toFixed(7));
      if (exact !== undefined) {
        output.push(exact);
        continue;
      }
      let value = null;
      for (let j = 0; j < old.triangles.length; j += 3) {
        const [a, b, c] = old.triangles.slice(j, j + 3),
          ax = old.uv[a * 2],
          ay = old.uv[a * 2 + 1],
          bx = old.uv[b * 2],
          by = old.uv[b * 2 + 1],
          cx = old.uv[c * 2],
          cy = old.uv[c * 2 + 1],
          det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-12) continue;
        const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det,
          v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det,
          w = 1 - u - v;
        if (Math.min(u, v, w) >= -1e-7) {
          value = depths[a] * u + depths[b] * v + depths[c] * w;
          break;
        }
      }
      if (value === null) {
        let nearest = 0,
          best = Infinity;
        for (let j = 0; j < depths.length; j++) {
          const d = (x - old.uv[j * 2]) ** 2 + (y - old.uv[j * 2 + 1]) ** 2;
          if (d < best) {
            best = d;
            nearest = j;
          }
        }
        value = depths[nearest];
      }
      output.push(Math.max(-0.25, Math.min(0.25, value)));
    }
    return output;
  }
  function windowPlacement(doc: CardDocument, layer: CardLayer) {
    const slot = doc.slots?.find((s) => s.id === layer.slotId);
    return importedCardCharacterAnimation.sourcePlacement(
      layer,
      slot as { u: number; v: number } | undefined,
    );
  }
  function timeline(
    frames: SpineFrame[],
    duration: number,
    value: (frame: SpineFrame) => number,
    version: string,
    channel: number,
    factor: number,
    fallback: number,
  ) {
    if (!Array.isArray(frames) || !frames.length) throw Error('Spine 轨道为空');
    const result: Keyframe[] = [];
    let previous = -1;
    for (const f of frames) {
      if (
        !f ||
        typeof f !== 'object' ||
        Array.isArray(f) ||
        (['time', 'x', 'y', 'angle', 'value', 'mix'] as const).some(
          (k) => f[k] !== undefined && !Number.isFinite(f[k]),
        )
      )
        throw Error('Spine 关键帧格式无效');
      if (
        !Number.isFinite(num(f.time)) ||
        num(f.time) < 0 ||
        num(f.time) <= previous ||
        !Number.isFinite(value(f))
      )
        throw Error('Spine 时间或轨道数值无效');
      previous = num(f.time);
    }
    const push = (time: number, v: number, ease: Ease = 'linear') => {
      const at = time / duration;
      if (result.length && Math.abs(result[result.length - 1].at - at) < 1e-12)
        result.pop();
      result.push({ at, value: v, ease });
      if (result.length > 64)
        throw Error('贝塞尔转换超过每轨 64 帧，请简化源轨道');
    };
    if (num(frames[0].time) > 0) push(0, fallback, 'hold');
    for (let i = 0; i < frames.length; i++) {
      const a = frames[i],
        b = frames[i + 1],
        start = num(a.time),
        av = value(a);
      push(start, av, a.curve === 'stepped' ? 'hold' : 'linear');
      if (
        !b ||
        a.curve === undefined ||
        a.curve === 'linear' ||
        a.curve === 'stepped'
      )
        continue;
      if (
        !Array.isArray(a.curve) ||
        a.curve.length < 4 ||
        a.curve.some((v) => !Number.isFinite(v))
      )
        throw Error('Spine 贝塞尔格式无效');
      const end = num(b.time),
        bv = value(b),
        v4 = version.startsWith('4.'),
        offset = v4 ? channel * 4 : 0,
        curve = a.curve.slice(offset, offset + 4);
      if (curve.length !== 4) throw Error('Spine 贝塞尔缺少通道控制点');
      const cx = v4
          ? [
              (curve[0] - start) / (end - start),
              (curve[2] - start) / (end - start),
            ]
          : [curve[0], curve[2]],
        cy = v4
          ? [curve[1] * factor, curve[3] * factor]
          : [av + (bv - av) * curve[1], av + (bv - av) * curve[3]];
      if (cx.some((x) => x < -0.05 || x > 1.05))
        throw Error('Spine 贝塞尔时间控制点无效');
      if (
        Math.abs(cx[0] - 1 / 3) < 1e-7 &&
        Math.abs(cx[1] - 2 / 3) < 1e-7 &&
        Math.abs(cy[0] - av) < 1e-7 &&
        Math.abs(cy[1] - bv) < 1e-7
      ) {
        push(start, av, 'smooth');
        continue;
      }
      result[result.length - 1].curve = [cx[0], cy[0], cx[1], cy[1]];
    }
    return result;
  }
  function convert(
    source: SpineSource,
    options: SpineOptions = {},
  ): ImportPlan {
    const report = inspect(source, options);
    if (report.unsupported.length)
      throw Error('Spine 导入检查未通过：' + report.unsupported.join('；'));
    return report.plan;
  }
  return {
    inspect,
    convert,
    timeline,
    entries,
    adapter: { id: 'spine-json', convert },
  };
})();

export default api;
