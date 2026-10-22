/* Editor-only geometry and normalized weight tools. No runtime dependency. */
import type { CardLayer, CardDocument } from '../../shared/document';
import type {
  SkinMesh,
  Weight,
  CharacterPose,
  CharacterAction,
} from '../../shared/character';
import type { Point2 } from '../../shared/geometry';
type WeightDocument = Pick<
  CardDocument,
  'layers' | 'characterRig' | 'actions' | 'slots'
>;
type WeightMesh = Pick<SkinMesh, 'vertices' | 'weights' | 'triangles'>;
interface PaintOptions {
  radius?: number;
  strength?: number;
  value?: number;
  mode?: 'add' | 'remove' | 'replace' | 'smooth';
  feather?: number;
  locked?: ReadonlySet<string>;
  adjacency?: ReadonlySet<number>[];
  selection?: ReadonlySet<number> | null;
  points?: readonly Point2[] | null;
}

import importedCardCharacterAnimation from './character-animation-model.ts';

const api = (() => {
  'use strict';
  const palette = [
    '#65d9c1',
    '#ff9a62',
    '#76adff',
    '#ce92f5',
    '#f2cf68',
    '#ef83b2',
    '#8cc96a',
    '#84cadc',
  ];
  const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const color = (i: number) => palette[i % palette.length];
  function boneColor(doc: unknown, id: string) {
    let h = 2166136261;
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const hue = (h >>> 0) % 360,
      s = 0.58,
      l = 0.67,
      c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((hue / 60) % 2) - 1)),
      m = l - c / 2,
      rgb =
        hue < 60
          ? [c, x, 0]
          : hue < 120
            ? [x, c, 0]
            : hue < 180
              ? [0, c, x]
              : hue < 240
                ? [0, x, c]
                : hue < 300
                  ? [x, 0, c]
                  : [c, 0, x];
    return (
      '#' +
      rgb
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  const rgb = (color: string) =>
    [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  function boneTip(doc: WeightDocument, id: string) {
    const rig = doc.characterRig;
    if (!rig) throw Error('请先创建人物关节');
    const b = rig.bones.find((b) => b.id === id)!,
      child = rig.bones.find((b) => b.parentId === id),
      constraint = rig.constraints?.find((c) => c.tipId === id);
    return (
      b.tip ||
      (child ? [child.x, child.y] : constraint ? constraint.end : [80, 0])
    );
  }
  function segments(doc: WeightDocument, pose: CharacterPose | null = null) {
    const rig = importedCardCharacterAnimation.compile(doc.characterRig!),
      world = (id: string) => pose?.bones.get(id)?.world || rig.rest.get(id)!;
    return rig.order.map((b) => {
      const p = importedCardCharacterAnimation.point(world(b.id), 0, 0),
        parent = b.parentId
          ? importedCardCharacterAnimation.point(world(b.parentId), 0, 0)
          : p,
        tip = importedCardCharacterAnimation.point(
          world(b.id),
          boneTip(doc, b.id)[0],
          boneTip(doc, b.id)[1],
        );
      return { id: b.id, p, parent, tip };
    });
  }
  function distance(p: Point2, a: Point2, b: Point2) {
    const x = b.x - a.x,
      y = b.y - a.y,
      t = clamp(((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1));
    return Math.hypot(p.x - a.x - x * t, p.y - a.y - y * t);
  }
  function pick(doc: WeightDocument, p: Point2, zoom: number) {
    const all = segments(doc);
    let best: string | null = null,
      distanceBest = 12 / zoom;
    for (const b of all) {
      const d = Math.hypot(p.x - b.p.x, p.y - b.p.y);
      if (d < distanceBest) {
        best = b.id;
        distanceBest = d;
      }
    }
    if (best) return best;
    for (const b of all) {
      const d = distance(p, b.p, b.tip);
      if (d < 8 / zoom) {
        best = b.id;
        break;
      }
    }
    return best;
  }
  function moveJoint(doc: WeightDocument, id: string, p: Point2) {
    const b = doc.characterRig!.bones.find((b) => b.id === id)!,
      rest = importedCardCharacterAnimation.compile(doc.characterRig!).rest,
      parent = b.parentId
        ? rest.get(b.parentId)!
        : importedCardCharacterAnimation.matrix(0, 0);
    const q = importedCardCharacterAnimation.point(
      importedCardCharacterAnimation.inverse(parent),
      p.x,
      p.y,
    );
    b.x = q.x;
    b.y = q.y;
    importedCardCharacterAnimation.validate(doc);
  }
  function moveTip(doc: WeightDocument, id: string, p: Point2) {
    const b = doc.characterRig!.bones.find((b) => b.id === id)!,
      q = importedCardCharacterAnimation.point(
        importedCardCharacterAnimation.inverse(
          importedCardCharacterAnimation
            .compile(doc.characterRig!)
            .rest.get(id)!,
        ),
        p.x,
        p.y,
      );
    b.tip = [q.x, q.y];
    importedCardCharacterAnimation.validate(doc);
  }
  function sourceMatrix(doc: WeightDocument, layer: CardLayer | undefined) {
    const p = placement(doc, layer);
    return importedCardCharacterAnimation.matrix(
      512 + p.x,
      768 + p.y,
      (p.rotation * 180) / Math.PI,
      p.scale,
    );
  }
  function placement(doc: WeightDocument, layer: CardLayer | undefined) {
    return importedCardCharacterAnimation.sourcePlacement(
      layer,
      doc.slots?.find((slot) => slot.id === layer?.slotId),
    );
  }
  function vertexPoints(
    doc: WeightDocument,
    layer: CardLayer | undefined,
    mesh: Pick<SkinMesh, 'vertices' | 'weights'>,
    pose: CharacterPose | null = null,
  ) {
    const mat = sourceMatrix(doc, layer),
      geometry = pose
        ? importedCardCharacterAnimation.geometry(
            doc,
            layer,
            pose,
            placement(doc, layer),
          )
        : null;
    return mesh.weights.map((_, i) =>
      importedCardCharacterAnimation.point(
        mat,
        geometry
          ? geometry.positions[i * 3] * 1024
          : mesh.vertices[i * 2] - 512,
        geometry
          ? -geometry.positions[i * 3 + 1] * 1024
          : mesh.vertices[i * 2 + 1] - 768,
      ),
    );
  }
  function sourcePoint(doc: WeightDocument, layer: CardLayer, p: Point2) {
    const q = importedCardCharacterAnimation.point(
      importedCardCharacterAnimation.inverse(sourceMatrix(doc, layer)),
      p.x,
      p.y,
    );
    return { x: q.x + 512, y: q.y + 768 };
  }
  function normalized(
    values: Weight[],
    locked: ReadonlySet<string> = new Set(),
    old: Weight[] = [],
  ) {
    const fixed = old.filter((w) => locked.has(w.boneId) && w.weight > 0),
      remaining = clamp(1 - fixed.reduce((s, w) => s + w.weight, 0));
    let free = values
        .filter((w) => !locked.has(w.boneId) && w.weight > 1e-8)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4 - fixed.length),
      sum = free.reduce((s, w) => s + w.weight, 0);
    if (!sum && remaining > 1e-8) return old.map((w) => ({ ...w }));
    return [
      ...fixed.map((w) => ({ ...w })),
      ...free.map((w) => ({
        boneId: w.boneId,
        weight: (w.weight / sum) * remaining,
      })),
    ].filter((w) => w.weight > 1e-8);
  }
  function setWeight(
    old: Weight[],
    boneId: string,
    value: number,
    locked: ReadonlySet<string> = new Set(),
  ) {
    if (locked.has(boneId)) return old.map((w) => ({ ...w }));
    const fixed = old.filter((w) => locked.has(w.boneId)),
      available = clamp(1 - fixed.reduce((s, w) => s + w.weight, 0));
    value = clamp(value, 0, available);
    let others = old
        .filter(
          (w) =>
            w.boneId !== boneId && !locked.has(w.boneId) && w.weight > 1e-8,
        )
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4 - fixed.length - (value > 1e-8 ? 1 : 0)),
      sum = others.reduce((s, w) => s + w.weight, 0);
    if (!sum && value < available - 1e-8) return old.map((w) => ({ ...w }));
    const next = [
      ...fixed.map((w) => ({ ...w })),
      ...others.map((w) => ({
        boneId: w.boneId,
        weight: (w.weight / sum) * (available - value),
      })),
    ];
    if (value > 1e-8) next.push({ boneId, weight: value });
    return next.filter((w) => w.weight > 1e-8);
  }
  function neighbors(mesh: Pick<SkinMesh, 'weights' | 'triangles'>) {
    const result = mesh.weights.map(() => new Set<number>());
    for (let j = 0; j < mesh.triangles.length; j += 3) {
      const tri = mesh.triangles.slice(j, j + 3);
      for (const a of tri) for (const b of tri) if (a !== b) result[a].add(b);
    }
    return result;
  }
  function falloff(distance: number, radius: number, feather = 1) {
    if (distance >= radius) return 0;
    const inner = radius * (1 - feather);
    return distance <= inner
      ? 1
      : ((radius - distance) / (radius - inner)) ** 2;
  }
  function paint(
    mesh: WeightMesh,
    boneId: string,
    centers: readonly Point2[],
    {
      radius = 60,
      strength = 0.2,
      value = 1,
      mode = 'add',
      feather = 1,
      locked = new Set<string>(),
      adjacency = neighbors(mesh),
      selection = null,
      points = null,
    }: PaintOptions = {},
  ) {
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !['add', 'remove', 'replace', 'smooth'].includes(mode) ||
      ![strength, value, feather].every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 1,
      )
    )
      throw Error('权重笔刷参数无效');
    let changed = 0;
    for (const p of centers) {
      const previous = mesh.weights.map((ws) => ws.map((w) => ({ ...w })));
      for (let i = 0; i < mesh.weights.length; i++) {
        if (selection?.size && !selection.has(i)) continue;
        const d = Math.hypot(
          (points?.[i].x ?? mesh.vertices[i * 2]) - p.x,
          (points?.[i].y ?? mesh.vertices[i * 2 + 1]) - p.y,
        );
        if (d >= radius) continue;
        const f = falloff(d, radius, feather) * strength,
          old = previous[i].find((w) => w.boneId === boneId)?.weight || 0;
        const adjacent = [...adjacency[i]],
          average = adjacent.length
            ? adjacent.reduce(
                (s, j) =>
                  s +
                  (previous[j].find((w) => w.boneId === boneId)?.weight || 0),
                0,
              ) / adjacent.length
            : old;
        const target =
          mode === 'replace'
            ? old + (value - old) * f
            : mode === 'smooth'
              ? old + (average - old) * f
              : clamp(old + (mode === 'remove' ? -f : f));
        const next = setWeight(previous[i], boneId, target, locked);
        if (JSON.stringify(next) !== JSON.stringify(mesh.weights[i])) {
          mesh.weights[i] = next;
          changed++;
        }
      }
    }
    return changed;
  }
  function auto(
    doc: WeightDocument,
    layer: CardLayer,
    mesh: WeightMesh,
    boneIds: string[],
    locked: ReadonlySet<string> = new Set(),
    selection: ReadonlySet<number> | null = null,
  ) {
    const bones = segments(doc).filter((b) => boneIds.includes(b.id));
    if (!bones.length) throw Error('请选择参与初绑的骨骼');
    const points = vertexPoints(doc, layer, mesh);
    for (let i = 0; i < mesh.weights.length; i++) {
      if (selection?.size && !selection.has(i)) continue;
      const values = bones.map((b) => ({
        boneId: b.id,
        weight: 1 / (distance(points[i], b.p, b.tip) ** 2 + 256),
      }));
      mesh.weights[i] = normalized(values, locked, mesh.weights[i]);
    }
  }
  function smooth(
    mesh: Pick<SkinMesh, 'weights' | 'triangles'>,
    locked: ReadonlySet<string> = new Set(),
    selection: ReadonlySet<number> | null = null,
  ) {
    const adjacent = neighbors(mesh),
      old = mesh.weights.map((ws) => ws.map((w) => ({ ...w })));
    for (let i = 0; i < old.length; i++) {
      if (selection?.size && !selection.has(i)) continue;
      const values = new Map<string, number>();
      for (const j of [i, ...adjacent[i]] as const)
        for (const w of old[j])
          values.set(w.boneId, (values.get(w.boneId) || 0) + w.weight);
      mesh.weights[i] = normalized(
        [...values].map(([boneId, weight]) => ({ boneId, weight })),
        locked,
        old[i],
      );
    }
  }
  function slices(weights: Weight[]) {
    let at = -Math.PI / 2;
    const sum = weights.reduce((s, w) => s + w.weight, 0);
    return weights
      .filter((w) => w.weight > 1e-8)
      .map((w) => {
        const start = at;
        at += (w.weight / sum) * Math.PI * 2;
        return { boneId: w.boneId, weight: w.weight, start, end: at };
      });
  }
  function sector(weights: Weight[], dx: number, dy: number) {
    let angle = Math.atan2(dy, dx);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    return (
      slices(weights).find((s) => angle >= s.start && angle <= s.end)?.boneId ||
      null
    );
  }
  function summary(
    mesh: Pick<SkinMesh, 'weights'>,
    selection: ReadonlySet<number>,
  ) {
    const ids = [...selection].filter((i) => i >= 0 && i < mesh.weights.length),
      bones = new Set<string>(
        ids.flatMap((i) =>
          mesh.weights[i].filter((w) => w.weight > 1e-8).map((w) => w.boneId),
        ),
      ),
      result = new Map<string, { min: number; max: number; average: number }>();
    for (const id of bones) {
      const values = ids.map(
        (i) => mesh.weights[i].find((w) => w.boneId === id)?.weight || 0,
      );
      result.set(id, {
        min: Math.min(...values),
        max: Math.max(...values),
        average: values.reduce((s, v) => s + v, 0) / values.length,
      });
    }
    return result;
  }
  function box(
    points: readonly Point2[],
    start: Point2,
    end: Point2,
    allowed: ReadonlySet<number> | null = null,
  ) {
    const left = Math.min(start.x, end.x),
      right = Math.max(start.x, end.x),
      top = Math.min(start.y, end.y),
      bottom = Math.max(start.y, end.y);
    return new Set<number>(
      points.flatMap((p, i) =>
        p.x >= left &&
        p.x <= right &&
        p.y >= top &&
        p.y <= bottom &&
        (!allowed || allowed.has(i))
          ? [i]
          : [],
      ),
    );
  }
  function displayVertices(
    points: readonly Point2[],
    candidates: Iterable<number>,
    selected: ReadonlySet<number>,
    zoom: number,
    gap = 14,
  ) {
    const kept = [],
      seen = new Set<number>(),
      cells = new Set<string>(),
      size = gap / zoom;
    for (const i of [...selected, ...candidates] as const) {
      if (!points[i] || seen.has(i)) continue;
      const p = points[i],
        cell = Math.floor(p.x / size) + ':' + Math.floor(p.y / size);
      if (selected.has(i) || !cells.has(cell)) {
        kept.push(i);
        seen.add(i);
        cells.add(cell);
      }
    }
    return kept;
  }
  function strokeSampler(radius: number) {
    const spacing = Math.max(1, radius * 0.18);
    let last: Point2 | null = null,
      carry = 0;
    return {
      sample(p: Point2) {
        if (!last) {
          last = { ...p };
          return [{ ...p }];
        }
        const dx = p.x - last.x,
          dy = p.y - last.y,
          length = Math.hypot(dx, dy),
          points = [];
        if (length > 0) {
          for (
            let distance = spacing - carry;
            distance <= length && points.length < 4096;
            distance += spacing
          )
            points.push({
              x: last.x + (dx * distance) / length,
              y: last.y + (dy * distance) / length,
            });
          carry = (carry + length) % spacing;
        }
        last = { ...p };
        return points;
      },
    };
  }
  function prune(
    mesh: Pick<SkinMesh, 'weights'>,
    threshold = 0.01,
    locked: ReadonlySet<string> = new Set(),
    selection: ReadonlySet<number> | null = null,
  ) {
    for (let i = 0; i < mesh.weights.length; i++) {
      if (selection?.size && !selection.has(i)) continue;
      const old = mesh.weights[i],
        values = old.filter(
          (w) => locked.has(w.boneId) || w.weight >= threshold,
        );
      if (values.length) mesh.weights[i] = normalized(values, locked, old);
    }
  }
  function copy(
    mesh: Pick<SkinMesh, 'weights'>,
    selection: ReadonlySet<number>,
  ) {
    return [...selection]
      .sort((a, b) => a - b)
      .map((i) => mesh.weights[i].map((w) => ({ ...w })));
  }
  function paste(
    mesh: Pick<SkinMesh, 'weights'>,
    selection: ReadonlySet<number>,
    clipboard: Weight[][],
    locked: ReadonlySet<string> = new Set(),
  ) {
    const ids = [...selection].sort((a, b) => a - b);
    if (
      !ids.length ||
      !clipboard.length ||
      (clipboard.length !== 1 && clipboard.length !== ids.length)
    )
      throw Error('请选择相同数量的顶点，或复制单个顶点后批量粘贴');
    ids.forEach(
      (i, j) =>
        (mesh.weights[i] = normalized(
          clipboard[clipboard.length === 1 ? 0 : j],
          locked,
          mesh.weights[i],
        )),
    );
  }
  // Affine image-to-triangle map used by the editor's posed 2D canvas only.
  function triangleTransform(
    source: readonly Point2[],
    target: readonly Point2[],
  ) {
    const [a, b, c] = source,
      [p, q, r] = target,
      den = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (Math.abs(den) < 1e-9) return null;
    const ux = b.x - a.x,
      uy = b.y - a.y,
      vx = c.x - a.x,
      vy = c.y - a.y,
      dx = q.x - p.x,
      dy = q.y - p.y,
      ex = r.x - p.x,
      ey = r.y - p.y,
      m = [
        (dx * vy - ex * uy) / den,
        (dy * vy - ey * uy) / den,
        (ex * ux - dx * vx) / den,
        (ey * ux - dy * vx) / den,
        0,
        0,
      ];
    m[4] = p.x - m[0] * a.x - m[2] * a.y;
    m[5] = p.y - m[1] * a.x - m[3] * a.y;
    return m;
  }
  function testAction(
    doc: WeightDocument,
    action: CharacterAction,
    boneId: string,
    seconds: number,
    angle: number,
  ) {
    if (
      !action ||
      !doc.characterRig?.bones.some((b) => b.id === boneId) ||
      !Number.isFinite(angle) ||
      Math.abs(angle) > 90
    )
      throw Error('权重测试姿势无效');
    const draft = structuredClone(action),
      rotation =
        importedCardCharacterAnimation.local(
          action,
          boneId,
          seconds / action.duration,
        ).rotation + angle;
    draft.boneTracks ||= {};
    draft.boneTracks[boneId] ||= {};
    draft.boneTracks[boneId].rotation = [
      { at: 0, value: ((((rotation + 180) % 360) + 360) % 360) - 180 },
    ];
    for (const c of doc.characterRig.constraints || [])
      if (c.rootId === boneId || c.tipId === boneId) {
        draft.ikTracks ||= {};
        draft.ikTracks[c.id] = {
          ...draft.ikTracks[c.id],
          mix: [{ at: 0, value: 0 }],
        };
      }
    return draft;
  }
  return {
    color,
    boneColor,
    rgb,
    boneTip,
    segments,
    distance,
    pick,
    moveJoint,
    moveTip,
    vertexPoints,
    sourcePoint,
    normalized,
    setWeight,
    neighbors,
    paint,
    auto,
    smooth,
    falloff,
    slices,
    sector,
    summary,
    box,
    displayVertices,
    strokeSampler,
    prune,
    copy,
    paste,
    triangleTransform,
    testAction,
  };
})();

export default api;
