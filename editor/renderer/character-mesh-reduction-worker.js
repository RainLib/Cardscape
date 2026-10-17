// Keep the editor responsive. The worker owns only a disposable rig copy;
// application rechecks the captured document/revision before committing once.
self.window=self;
importScripts('frame-model.js','card-stats.js','title-model.js','mask-edit-model.js','spatial-model.js','character-ik-model.js','character-deform-model.js','character-advanced-model.js','character-animation-model.js','runtime-model.js','character-weight-tools.js','character-mesh-tools.js','character-mesh-reduction.js');
self.onmessage=({data})=>{try{const doc=data.document,meshes=data.ids.map(id=>doc.characterRig.meshes.find(m=>m.layerId===id));let last=0;const report=self.CardCharacterMeshReduction.simplify(doc,meshes,{...data.options,onProgress(progress){if(progress.removed-last>=4){last=progress.removed;self.postMessage({progress});}}});self.CardCharacterAnimation.validate(doc);self.postMessage({report,meshes,deforms:doc.actions.map(a=>a.deformTracks)});}catch(e){self.postMessage({error:e.message});}};
