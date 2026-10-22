import type { SkinMesh } from '../../shared/character';
import type {
  MeshDocument,
  BarycentricLocation,
} from '../../shared/mesh-editing';
import type {
  MeshRepairPlanRequest,
  MeshScanRequest,
  MeshAutoRequest,
  MeshChooseOptions,
} from '../../shared/mesh-repair';
type ReviewFrame = ReturnType<
  ReturnType<typeof importedCardCharacterMeshReduction.review>['frame']
>;
/* Heatmap selections live in UV space, never in posed/card or atlas pixels.
 * Restore the compared source group before repairing: subdividing a reduced
 * mesh alone cannot recover deleted weights, bind samples or FFD keys. */
import importedCardCharacterMeshTools from './character-mesh-tools.ts';
import importedCardCharacterMeshAuthoring from './character-mesh-authoring.ts';
import importedCardCharacterMeshReduction from './character-mesh-reduction.ts';
import importedCardCharacterAnimation from './character-animation-model.ts';

const api = (() => {
  'use strict';
  const key = (p: number[]) => p.map((v) => Math.round(v * 1e10)).join(':'),
    vertex = (m: Pick<SkinMesh, 'vertices'>, i: number) => ({
      x: m.vertices[i * 2],
      y: m.vertices[i * 2 + 1],
    });
  function choose(
    frame: ReviewFrame,
    {
      metric = 'error',
      threshold = 0.75,
      box = null,
      side = 'after',
      previous = [],
    }: MeshChooseOptions = {},
  ) {
    if (
      !['error', 'motionError'].includes(metric) ||
      !['before', 'after'].includes(side) ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1024
    )
      throw Error('误差选区参数无效');
    if (
      box &&
      (![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
        box.width < 0 ||
        box.height < 0)
    )
      throw Error('误差框选范围无效');
    const result = new Map<string, number[]>(previous.map((p) => [key(p), p]));
    for (const sample of [...frame.samples].sort(
      (a, b) => b[metric] - a[metric],
    )) {
      const p = sample[side === 'before' ? 'beforePoint' : 'afterPoint'];
      if (
        sample[metric] <= 0.0002 ||
        sample[metric] < threshold ||
        (box &&
          (p.x < box.x ||
            p.x > box.x + box.width ||
            p.y < box.y ||
            p.y > box.y + box.height))
      )
        continue;
      result.set(key(sample.uv), sample.uv);
    }
    return [...result.values()].map((p) => [...p]);
  }
  function region(mesh: SkinMesh, uvs: number[][]) {
    if (
      !Array.isArray(uvs) ||
      uvs.length > 100000 ||
      uvs.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
      )
    )
      throw Error('误差选区 UV 无效');
    const faces = new Map<number | undefined, number[]>(),
      points: Array<{
        uv: number[];
        location: BarycentricLocation;
        x: number;
        y: number;
      }> = [];
    for (const uv of new Map<string, number[]>(
      uvs.map((p) => [key(p), p]),
    ).values()) {
      const at = importedCardCharacterMeshTools.locateUV(mesh, {
        x: uv[0],
        y: uv[1],
      });
      if (!at) continue;
      faces.set(at.j, at.ids);
      points.push({
        uv,
        location: at,
        x: at.ids.reduce(
          (v, i, k) => v + mesh.vertices[i * 2] * at.values[k],
          0,
        ),
        y: at.ids.reduce(
          (v, i, k) => v + mesh.vertices[i * 2 + 1] * at.values[k],
          0,
        ),
      });
    }
    return {
      faces: [...faces.values()],
      vertices: [...new Set<number>([...faces.values()].flat())].sort(
        (a, b) => a - b,
      ),
      points,
    };
  }
  function plan({
    source,
    current,
    ids,
    layerId,
    uvs,
    kind = 'protect',
    spacing = 24,
  }: MeshRepairPlanRequest) {
    if (
      !['protect', 'refine'].includes(kind) ||
      !Number.isFinite(spacing) ||
      spacing < 8 ||
      spacing > 160
    )
      throw Error('局部修正参数无效');
    if (
      !ids?.length ||
      new Set<string>(ids).size !== ids.length ||
      !ids.includes(layerId)
    )
      throw Error('修正网格组无效');
    const next = importedCardCharacterMeshReduction.snapshot(current),
      sourceMesh = source.characterRig!.meshes!.find(
        (m) => m.layerId === layerId,
      );
    if (!sourceMesh) throw Error('操作前网格已不可用');
    const selected = region(sourceMesh, uvs);
    if (!selected.vertices.length)
      throw Error('请先选择有源网格支撑的高误差区域');
    const meshes = ids.map((id) => {
      if (!current.characterRig!.meshes!.some((m) => m.layerId === id))
        throw Error('当前网格已不存在');
      const layer = current.layers.find((l) => l.id === id);
      if (!layer || layer.locked) throw Error('请先解锁参与修正的图层');
      const original = source.characterRig!.meshes!.find(
        (m) => m.layerId === id,
      );
      if (!original) throw Error('操作前网格组不完整');
      const copy = structuredClone(original);
      next.characterRig!.meshes![
        next.characterRig!.meshes!.findIndex((m) => m.layerId === id)
      ] = copy;
      return copy;
    });
    const signature = (m: SkinMesh) =>
      JSON.stringify([m.vertices, m.uv, m.triangles]);
    if (meshes.some((m) => signature(m) !== signature(sourceMesh)))
      throw Error('同步修正需要相同源拓扑');
    // Restore only this group's FFD tracks, by action ID (not array position).
    // Sibling layers, bones, constraints, curve metadata and other tracks survive.
    for (const action of next.actions || []) {
      const old = source.actions?.find((a) => a.id === action.id);
      if (!old) throw Error('动作列表已变化，请重新检查误差');
      for (const id of ids) {
        if (old.deformTracks?.[id]) {
          action.deformTracks ||= {};
          action.deformTracks[id] = structuredClone(old.deformTracks[id]);
        } else if (action.deformTracks) delete action.deformTracks[id];
      }
    }
    if (source.actions?.some((a) => !next.actions?.some((b) => a.id === b.id)))
      throw Error('动作列表已变化，请重新检查误差');
    const baseline = importedCardCharacterMeshReduction.snapshot(next),
      compare = importedCardCharacterMeshReduction.audit(
        baseline,
        baseline.characterRig!.meshes!.filter((m) => ids.includes(m.layerId)),
      ),
      originalCount = meshes[0].weights.length;
    for (const m of meshes)
      importedCardCharacterMeshAuthoring.pin(m, selected.vertices);
    let added = 0;
    if (kind === 'refine') {
      const domain = {
          vertices: sourceMesh.vertices,
          triangles: selected.faces.flat(),
        },
        coords = selected.vertices.map((i) => vertex(sourceMesh, i)),
        xs = coords.map((p) => p.x),
        ys = coords.map((p) => p.y),
        x = Math.min(...xs),
        y = Math.min(...ys),
        width = Math.max(...xs) - x,
        height = Math.max(...ys) - y;
      // Edge-intersection probes can lie microns from existing vertices. Seed
      // face interiors instead, avoiding thin support triangles and float32 folds.
      added = importedCardCharacterMeshAuthoring.fillGroup(meshes, {
        document: next,
        spacing,
        maxVertices: Math.min(
          importedCardCharacterMeshAuthoring.budget(next, meshes),
          originalCount + 128,
        ),
        features: selected.faces.slice(0, 64).map((face) => ({
          x: face.reduce((v, i) => v + sourceMesh.vertices[i * 2], 0) / 3,
          y: face.reduce((v, i) => v + sourceMesh.vertices[i * 2 + 1], 0) / 3,
        })),
        region: { kind: 'box', x, y, width, height },
        accept(m, index) {
          return !!importedCardCharacterMeshTools.locate(
            domain,
            vertex(m, index!),
          );
        },
      });
      for (const m of meshes)
        importedCardCharacterMeshAuthoring.pin(
          m,
          Array.from(
            { length: m.weights.length - originalCount },
            (_, i) => originalCount + i,
          ),
        );
    }
    importedCardCharacterAnimation.validate(next);
    const report = compare(next, meshes);
    importedCardCharacterMeshReduction.assert(report, {
      maxError: 0.001,
      maxBoundaryError: 0,
      maxWeightError: 0,
    });
    return {
      document: next,
      ids: [...ids],
      layerId,
      kind,
      added,
      protected: meshes[0].topology!.pins.length,
      regionVertices: selected.vertices.length,
      regionFaces: selected.faces.length,
      beforeVertices: current.characterRig!.meshes!.find(
        (m) => m.layerId === layerId,
      )!.weights.length,
      sourceVertices: originalCount,
      afterVertices: meshes[0].weights.length,
      report,
    };
  }
  function scan({
    source,
    current,
    ids,
    options = {},
    onProgress,
  }: MeshScanRequest) {
    if (!ids?.length || new Set<string>(ids).size !== ids.length)
      throw Error('扫描网格组无效');
    if (
      (source.actions || []).length !== (current.actions || []).length ||
      source.actions?.some(
        (a) =>
          !current.actions?.some(
            (b) => b.id === a.id && b.duration === a.duration,
          ),
      )
    )
      throw Error('动作列表已变化，请重新检查误差');
    const meshes = (doc: MeshDocument) =>
      ids.map((id) => {
        const m = doc.characterRig?.meshes?.find((m) => m.layerId === id);
        if (!m) throw Error('扫描快照缺少网格');
        return m;
      });
    return importedCardCharacterMeshReduction.audit(source, meshes(source), {
      steps: options.steps ?? 24,
      allActions: true,
    })(current, meshes(current), {
      scan: importedCardCharacterMeshReduction.settings(options),
      onProgress,
    });
  }
  // A disposable, all-actions transaction. Recovery uses retained source samples;
  // every reduction trial is still measured against the original comparison.
  function auto({
    source,
    reference = source,
    current,
    ids,
    options = {},
    onProgress,
  }: MeshAutoRequest) {
    const limits = importedCardCharacterMeshReduction.settings(options);
    for (const id of ids || [])
      if (!current.layers.some((l) => l.id === id && !l.locked))
        throw Error('请先解锁参与修正的图层');
    onProgress?.({ stage: 'scan' });
    const before = scan({
      source: reference,
      current,
      ids,
      options,
      onProgress: (p) => onProgress?.({ stage: 'scan', ...p }),
    });
    const uvs = [
      ...new Map<string, number[]>(
        (before.regions || []).flatMap((r) => r.uvs).map((p) => [key(p), p]),
      ).values(),
    ];
    if (!uvs.length)
      return {
        document: importedCardCharacterMeshReduction.snapshot(current),
        before,
        after: before,
        added: 0,
        protected: 0,
        removed: 0,
        changed: false as const,
        ids,
        target: null,
        reachedTarget: true,
      };
    onProgress?.({ stage: 'refine', regions: uvs.length });
    const repaired = plan({
        source,
        current,
        ids,
        layerId: ids[0],
        uvs,
        kind: 'refine',
        spacing: options.spacing ?? 24,
      }),
      next = repaired.document,
      meshes = ids.map(
        (id) => next.characterRig!.meshes!.find((m) => m.layerId === id)!,
      ),
      ratio = options.ratio ?? 0.5,
      target = Math.max(
        3,
        Math.ceil(
          current.characterRig!.meshes!.find((m) => m.layerId === ids[0])!
            .weights.length * ratio,
        ),
      );
    const recovery = importedCardCharacterMeshReduction.snapshot(next);
    onProgress?.({ stage: 'reduce' });
    const reduced = importedCardCharacterMeshReduction.simplify(next, meshes, {
      ...limits,
      ratio,
      allowBoundary: !!options.allowBoundary,
      steps: options.steps ?? 24,
      allActions: true,
      reference,
      targetVertices: target,
      onProgress: (p) => onProgress?.({ stage: 'reduce', ...p }),
    });
    importedCardCharacterAnimation.validate(next);
    onProgress?.({ stage: 'verify' });
    const after = scan({
      source: reference,
      current: next,
      ids,
      options,
      onProgress: (p) => onProgress?.({ stage: 'verify', ...p }),
    });
    importedCardCharacterMeshReduction.assert(after, limits);
    return {
      ...repaired,
      document: next,
      recovery,
      before,
      after,
      removed: reduced.removed,
      target,
      reachedTarget: reduced.reachedTarget,
      changed: true as const,
      regions: uvs.length,
    };
  }
  return { choose, region, plan, key, scan, auto };
})();

export default api;
