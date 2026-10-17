// Sampling owns a disposable, image-free document. It never edits the card.
self.window=self;
importScripts('frame-model.js','card-stats.js','title-model.js','mask-edit-model.js','spatial-model.js','character-ik-model.js','character-deform-model.js','character-advanced-model.js','character-animation-model.js','runtime-model.js','character-motion-audit.js','character-weight-tools.js','character-mesh-tools.js','character-mesh-reduction.js','character-weight-repair.js');
self.onmessage=({data})=>{try{
 const source=data.document,mesh=source.characterRig?.meshes?.find(m=>m.layerId===data.layerId);if(!mesh)throw Error('当前图片没有蒙皮网格');
 const doc={...source,characterRig:{...source.characterRig,meshes:[mesh]}};
 if(data.mode==='repair'){
  const result=self.CardCharacterWeightRepair.repair(doc,data.layerId,{locked:data.locked,onProgress:progress=>self.postMessage({progress})});
  if(result.changed){const after=structuredClone(doc);after.characterRig.meshes[0].weights=result.weights;result.comparison=self.CardCharacterMeshReduction.audit(doc,[mesh],{steps:60,allActions:true})(after,after.characterRig.meshes);}
  self.postMessage({result});
 }else self.postMessage({reports:doc.actions.map(action=>self.CardCharacterMotionAudit.audit(doc,action))});
}catch(e){self.postMessage({error:e.message});}};
