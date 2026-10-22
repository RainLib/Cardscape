/* Sample complete clips, including interpolation between authored keyframes.
 * This is an authoring diagnostic; it never changes weights or clamps motion. */
import importedCardCharacterAnimation from './character-animation-model.ts';
import type {
  CharacterAction,
  Keyframe,
  DeformFrame,
} from '../../shared/character';
import type { MeshDocument } from '../../shared/mesh-editing';
import type {
  TriangleIssue,
  MotionAuditReport,
  CollectedMotionReport,
  MotionAuditOptions,
} from '../../shared/weight-audit';

const api = (() => {
  'use strict';
  function sampleTimes(action: CharacterAction, fps = 60) {
    if (
      !action ||
      !Number.isFinite(action.duration) ||
      action.duration <= 0 ||
      !Number.isInteger(fps) ||
      fps < 1 ||
      fps > 120
    )
      throw Error('请选择有效动作与 1–120 fps 的检查频率');
    const times = new Set<number>(
      Array.from({ length: Math.ceil(action.duration * fps) + 1 }, (_, i) =>
        Math.min(action.duration, i / fps),
      ),
    );
    for (const field of [
      'boneTracks',
      'ikTracks',
      'expressionTracks',
      'deformTracks',
      'layerTracks',
    ] as const)
      for (const tracks of Object.values(action[field] || {}))
        for (const frames of Object.values<Keyframe[] | DeformFrame[]>(tracks))
          for (const f of frames) times.add(f.at * action.duration);
    return [...times].sort((a, b) => a - b);
  }
  function audit(
    doc: MeshDocument,
    action: CharacterAction,
    options: MotionAuditOptions & { collectIssues: true },
  ): CollectedMotionReport;
  function audit(
    doc: MeshDocument,
    action: CharacterAction,
    options?: MotionAuditOptions,
  ): MotionAuditReport;
  function audit(
    doc: MeshDocument,
    action: CharacterAction,
    {
      fps = 60,
      minAreaRatio = 0.1,
      collectIssues = false,
    }: MotionAuditOptions = {},
  ): MotionAuditReport {
    const times = sampleTimes(action, fps),
      issues = new Map<string, TriangleIssue>();
    const meshes = (doc.characterRig?.meshes || []).map((mesh) => {
      const layer = doc.layers.find((l) => l.id === mesh.layerId);
      if (!layer) throw Error('动作检查找不到网格图层');
      return {
        mesh,
        layer,
        base: importedCardCharacterAnimation.sourcePlacement(
          layer,
          doc.slots?.find((s) => s.id === layer.slotId),
        ),
      };
    });
    const result: MotionAuditReport = {
      actionId: action.id,
      name: action.name,
      duration: action.duration,
      fps,
      samples: times.length,
      meshCount: meshes.length,
      flippedTriangles: 0,
      compressedTriangles: 0,
      minAreaRatio: 1,
      maxIKError: 0,
      unreachableSamples: 0,
      unresolvedSamples: 0,
      firstIssue: null,
      ok: true,
    };
    for (const seconds of times) {
      const pose = importedCardCharacterAnimation.sample(doc, action, seconds, {
        seek: true,
      });
      for (const [id, ik] of pose?.ik || []) {
        if (ik.mix < 0.00001) continue;
        result.maxIKError = Math.max(result.maxIKError, ik.error);
        if (ik.solver === 'ccd' && ik.mix > 0.999 && !ik.converged) {
          result.unresolvedSamples++;
          result.firstIssue ||= { seconds, type: 'ik-convergence', id };
        }
        if (!ik.reachable) {
          result.unreachableSamples++;
          result.firstIssue ||= { seconds, type: 'ik', id };
        }
      }
      for (const { mesh, layer, base } of meshes) {
        const positions = importedCardCharacterAnimation.geometry(
          doc,
          layer,
          pose,
          base,
        )!.positions;
        for (let j = 0; j < mesh.triangles.length; j += 3) {
          const [a, b, c] = mesh.triangles.slice(j, j + 3),
            v = mesh.vertices,
            source =
              (v[b * 2] - v[a * 2]) * (v[c * 2 + 1] - v[a * 2 + 1]) -
              (v[c * 2] - v[a * 2]) * (v[b * 2 + 1] - v[a * 2 + 1]),
            area =
              (positions[b * 3] - positions[a * 3]) *
                (positions[c * 3 + 1] - positions[a * 3 + 1]) -
              (positions[c * 3] - positions[a * 3]) *
                (positions[b * 3 + 1] - positions[a * 3 + 1]),
            ratio = (-area * 1024 * 1024) / source;
          if (
            collectIssues &&
            (!Number.isFinite(ratio) || ratio < minAreaRatio)
          ) {
            const key = layer.id + ':' + j,
              prior = issues.get(key);
            if (!prior || ratio < prior.ratio)
              issues.set(key, {
                seconds,
                layerId: layer.id,
                triangle: j / 3,
                vertices: [a, b, c],
                ratio,
              });
          }
          result.minAreaRatio = Math.min(result.minAreaRatio, ratio);
          if (!Number.isFinite(ratio) || ratio <= 0) {
            result.flippedTriangles++;
            result.firstIssue ||= {
              seconds,
              type: 'triangle',
              layerId: layer.id,
              triangle: j / 3,
              vertices: [a, b, c],
            };
          } else if (ratio < minAreaRatio) {
            result.compressedTriangles++;
            result.firstIssue ||= {
              seconds,
              type: 'compression',
              layerId: layer.id,
              triangle: j / 3,
              vertices: [a, b, c],
            };
          }
        }
      }
    }
    if (collectIssues) result.issues = [...issues.values()];
    result.ok =
      !result.flippedTriangles &&
      !result.compressedTriangles &&
      !result.unreachableSamples &&
      !result.unresolvedSamples;
    return result;
  }
  return { audit, sampleTimes };
})();

export default api;
