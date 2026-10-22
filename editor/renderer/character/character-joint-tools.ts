import type { SkinMesh } from '../../shared/character';
import type { Point2 } from '../../shared/geometry';
import type { MeshEditOptions } from '../../shared/mesh-editing';
/* Editor-only support for independently skinned surfaces. Joint rings refine
 * existing triangles; radial weights share the parent's pivot with the child
 * and avoid a sharp spatial weight step through a rotating sleeve or hip. */
import importedCardCharacterMeshTools from './character-mesh-tools.ts';
import importedCardCharacterWeightTools from './character-weight-tools.ts';

const api = (() => {
  'use strict';
  const smooth = (t: number) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  function radial(
    mesh: SkinMesh,
    {
      parentId,
      boneId,
      pivot,
      inner = 24,
      outer = 160,
      locked = new Set<string>(),
      selection = null,
    }: {
      parentId: string;
      boneId: string;
      pivot: Point2;
      inner?: number;
      outer?: number;
      locked?: ReadonlySet<string>;
      selection?: ReadonlySet<number> | null;
    },
  ) {
    if (
      !parentId ||
      !boneId ||
      parentId === boneId ||
      ![pivot?.x, pivot?.y, inner, outer].every(Number.isFinite) ||
      inner < 0 ||
      outer <= inner
    )
      throw Error('关节过渡需要父子骨骼、有效中心及内外半径');
    let changed = 0;
    for (let i = 0; i < mesh.weights.length; i++) {
      if (selection && !selection.has(i)) continue;
      const x = mesh.vertices[i * 2],
        y = mesh.vertices[i * 2 + 1],
        w = smooth(
          (Math.hypot(x - pivot.x, y - pivot.y) - inner) / (outer - inner),
        ),
        next = importedCardCharacterWeightTools.normalized(
          [
            { boneId: parentId, weight: 1 - w },
            { boneId, weight: w },
          ],
          locked,
          mesh.weights[i],
        );
      if (JSON.stringify(next) !== JSON.stringify(mesh.weights[i])) {
        mesh.weights[i] = next;
        changed++;
      }
    }
    return changed;
  }
  function rings(
    mesh: SkinMesh,
    {
      pivot,
      radii = [32, 64, 112, 160],
      segments = 16,
      maxVertices = 4096,
      document,
    }: MeshEditOptions & {
      pivot: Point2;
      radii?: number[];
      segments?: number;
      maxVertices?: number;
    },
  ) {
    if (
      ![pivot?.x, pivot?.y].every(Number.isFinite) ||
      !Array.isArray(radii) ||
      radii.some((r) => !Number.isFinite(r) || r <= 0) ||
      !Number.isInteger(segments) ||
      segments < 8 ||
      segments > 64 ||
      !Number.isInteger(maxVertices) ||
      maxVertices < mesh.weights.length ||
      maxVertices > 4096
    )
      throw Error('关节支撑网格参数无效');
    const before = mesh.weights.length;
    for (const radius of radii)
      for (let n = 0; n < segments; n++) {
        if (mesh.weights.length >= maxVertices) break;
        const angle = (n / segments) * Math.PI * 2,
          p = {
            x: pivot.x + Math.cos(angle) * radius,
            y: pivot.y + Math.sin(angle) * radius,
          };
        if (
          p.x < 0 ||
          p.y < 0 ||
          p.x > 1024 ||
          p.y > 1536 ||
          !importedCardCharacterMeshTools.locate(mesh, p) ||
          mesh.weights.some(
            (_, i) =>
              Math.hypot(
                mesh.vertices[i * 2] - p.x,
                mesh.vertices[i * 2 + 1] - p.y,
              ) < 2,
          )
        )
          continue;
        importedCardCharacterMeshTools.insert(mesh, p, { document });
      }
    if (!mesh.binds) importedCardCharacterMeshTools.legalize(mesh);
    return mesh.weights.length - before;
  }
  function trim(
    mesh: SkinMesh,
    occupied: (x0: number, y0: number, x1: number, y1: number) => boolean,
  ) {
    if (typeof occupied !== 'function')
      throw Error('需要当前表面实际 Alpha 支撑');
    const triangles = [];
    for (let j = 0; j < mesh.triangles.length; j += 3) {
      const ids = mesh.triangles.slice(j, j + 3),
        xs = ids.map((i) => mesh.vertices[i * 2]),
        ys = ids.map((i) => mesh.vertices[i * 2 + 1]);
      if (
        occupied(
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        )
      )
        triangles.push(...ids);
    }
    if (!triangles.length) throw Error('当前图片没有网格覆盖');
    const before = mesh.triangles.length / 3;
    mesh.triangles = triangles;
    if (mesh.topology) {
      const edges = new Set<string>();
      for (let j = 0; j < triangles.length; j += 3)
        for (let n = 0; n < 3; n++) {
          const a = triangles[j + n],
            b = triangles[j + ((n + 1) % 3)];
          edges.add(Math.min(a, b) + ':' + Math.max(a, b));
        }
      mesh.topology.edges = mesh.topology.edges.filter(([a, b]) =>
        edges.has(Math.min(a, b) + ':' + Math.max(a, b)),
      );
    }
    return before - triangles.length / 3;
  }
  return { radial, rings, trim };
})();

export default api;
