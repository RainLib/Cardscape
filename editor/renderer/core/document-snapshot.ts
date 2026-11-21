import type { CardDocument } from '../../shared/document';

/** Copy mutable editing metadata while sharing immutable encoded image strings. */
export function snapshot(doc: CardDocument): CardDocument {
  return {
    ...doc,
    characterRig: doc.characterRig
      ? structuredClone(doc.characterRig)
      : undefined,
    cosmetics: doc.cosmetics ? { ...doc.cosmetics } : undefined,
    characterEffects: doc.characterEffects
      ? structuredClone(doc.characterEffects)
      : undefined,
    material: doc.material ? { ...doc.material } : undefined,
    particles: doc.particles ? structuredClone(doc.particles) : undefined,
    emissionRegions: doc.emissionRegions
      ? structuredClone(doc.emissionRegions)
      : undefined,
    spatial: doc.spatial ? { ...doc.spatial } : undefined,
    backAdjustments: doc.backAdjustments
      ? { ...doc.backAdjustments }
      : undefined,
    layerTree: doc.layerTree ? structuredClone(doc.layerTree) : undefined,
    layers: doc.layers.map((layer) => ({
      ...layer,
      spatial: layer.spatial ? { ...layer.spatial } : undefined,
      pivot: layer.pivot ? { ...layer.pivot } : undefined,
      motionAnchor: layer.motionAnchor
        ? structuredClone(layer.motionAnchor)
        : undefined,
      attachment: layer.attachment
        ? structuredClone(layer.attachment)
        : undefined,
      adjustments: layer.adjustments ? { ...layer.adjustments } : undefined,
      titleArt: layer.titleArt ? structuredClone(layer.titleArt) : undefined,
    })),
    composition: { ...doc.composition },
    armor: { ...doc.armor },
    frameStyle: doc.frameStyle ? { ...doc.frameStyle } : undefined,
    frameStyles: doc.frameStyles?.map((style) => ({ ...style })),
    effects: { ...doc.effects },
    masks: { ...doc.masks },
    meshGuides: [...(doc.meshGuides || [])],
    deformation: { ...doc.deformation },
    actions: doc.actions ? structuredClone(doc.actions) : undefined,
    slots: doc.slots?.map((slot) => ({ ...slot })),
    shader: { ...doc.shader },
  };
}
