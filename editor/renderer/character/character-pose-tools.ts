import type {
  Ease,
  Bone,
  CharacterDocument,
  CharacterAction,
  CharacterPose,
} from '../../shared/character';
import type { Point2 } from '../../shared/geometry';
export interface PoseDraft {
  key: string;
  action: CharacterAction;
}
/* Editor-only pose drafts. Previewing never mutates the saved rig or action. */
import importedCardCharacterAnimation from './character-animation-model.ts';

const api = (() => {
  'use strict';
  const degrees = (r: number) => (r * 180) / Math.PI;
  function fk(
    doc: CharacterDocument,
    action: CharacterAction,
    seconds: number,
    boneId: string,
    ease: Ease = 'linear',
  ) {
    const rig = doc.characterRig;
    if (!rig) throw Error('请先创建人物关节');
    const byId = new Map<string, Bone>(rig.bones.map((b) => [b.id, b]));
    const descends = (id: string) => {
      for (let b = byId.get(id); b; b = byId.get(b.parentId || ''))
        if (b.id === boneId) return true;
      return false;
    };
    const affected = (rig.constraints || []).filter(
      (c) =>
        (descends(c.rootId) || c.tipId === boneId) &&
        importedCardCharacterAnimation.control(
          doc,
          action,
          'ik',
          c.id,
          seconds / action.duration,
        ).mix > 0,
    );
    if (!affected.length) return structuredClone(action);
    const pose = importedCardCharacterAnimation.sample(doc, action, seconds, {
        seek: true,
      }),
      bones = new Set<string>(affected.flatMap((c) => [c.rootId, c.tipId]));
    let next = structuredClone(action);
    for (const id of bones) {
      const b = byId.get(id)!,
        world = pose!.bones.get(id)!.world,
        parent = b.parentId
          ? pose!.bones.get(b.parentId)!.world
          : importedCardCharacterAnimation.matrix(0, 0),
        local = importedCardCharacterAnimation.multiply(
          importedCardCharacterAnimation.inverse(parent),
          world,
        ),
        old = importedCardCharacterAnimation.local(
          action,
          id,
          seconds / action.duration,
        ).rotation,
        raw = degrees(Math.atan2(local[1], local[0])) - b.rotation,
        angle =
          old +
          degrees(
            Math.atan2(
              Math.sin(((raw - old) * Math.PI) / 180),
              Math.cos(((raw - old) * Math.PI) / 180),
            ),
          );
      next = importedCardCharacterAnimation.keyframe(
        next,
        id,
        'rotation',
        seconds,
        angle,
        ease,
      );
    }
    for (const c of affected)
      next = importedCardCharacterAnimation.controlKeyframe(
        doc,
        next,
        'ik',
        c.id,
        'mix',
        seconds,
        0,
        ease,
      );
    return next;
  }
  function drag(
    doc: CharacterDocument,
    action: CharacterAction,
    seconds: number,
    boneId: string,
    kind: string,
    start: Point2,
    pose: CharacterPose | null = importedCardCharacterAnimation.sample(
      doc,
      action,
      seconds,
      { seek: true },
    ),
    ease: Ease = 'linear',
  ) {
    const original = fk(doc, action, seconds, boneId, ease),
      b = doc.characterRig!.bones.find((b) => b.id === boneId)!,
      values = importedCardCharacterAnimation.local(
        original,
        boneId,
        seconds / original.duration,
      ),
      world = pose!.bones.get(boneId)!.world,
      pivot = { x: world[4], y: world[5] },
      parent = b.parentId
        ? pose!.bones.get(b.parentId)!.world
        : importedCardCharacterAnimation.matrix(0, 0),
      inv = importedCardCharacterAnimation.inverse(parent),
      from = importedCardCharacterAnimation.point(inv, start.x, start.y),
      theta = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    return (q: Point2) => {
      if (kind === 'rotate') {
        const angle = Math.atan2(q.y - pivot.y, q.x - pivot.x) - theta,
          delta = degrees(Math.atan2(Math.sin(angle), Math.cos(angle)));
        return importedCardCharacterAnimation.keyframe(
          original,
          boneId,
          'rotation',
          seconds,
          Math.max(-720, Math.min(720, values.rotation + delta)),
          ease,
        );
      }
      const to = importedCardCharacterAnimation.point(inv, q.x, q.y);
      let next = importedCardCharacterAnimation.keyframe(
        original,
        boneId,
        'x',
        seconds,
        Math.max(-4096, Math.min(4096, values.x + to.x - from.x)),
        ease,
      );
      return importedCardCharacterAnimation.keyframe(
        next,
        boneId,
        'y',
        seconds,
        Math.max(-4096, Math.min(4096, values.y + to.y - from.y)),
        ease,
      );
    };
  }
  function createSession() {
    let draft: PoseDraft | null = null;
    const key = (
      doc: Pick<CharacterDocument, 'characterRig'>,
      a: CharacterAction | null | undefined,
      seconds: number,
      token: unknown,
    ) =>
      JSON.stringify([
        token,
        a,
        seconds,
        doc.characterRig?.bones,
        doc.characterRig?.constraints,
        doc.characterRig?.expressions,
      ]);
    function get(
      doc: Pick<CharacterDocument, 'characterRig'>,
      a: CharacterAction | null | undefined,
      seconds: number,
      token: unknown,
    ) {
      if (draft && draft.key !== key(doc, a, seconds, token)) draft = null;
      return draft?.action || null;
    }
    return {
      get,
      set(
        doc: Pick<CharacterDocument, 'characterRig'>,
        a: CharacterAction | null | undefined,
        seconds: number,
        token: unknown,
        action: CharacterAction,
      ) {
        draft =
          JSON.stringify(a) === JSON.stringify(action)
            ? null
            : { key: key(doc, a, seconds, token), action };
      },
      clear() {
        draft = null;
      },
      snapshot: () => draft,
      restore(value: PoseDraft | null) {
        draft = value;
      },
    };
  }
  return { fk, drag, createSession };
})();

export default api;
