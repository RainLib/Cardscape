// Terminating this worker discards the entire plan. Only validated results are
// returned; UI application rechecks the document object, revision and locks.
self.window=self;
importScripts('frame-model.js','card-stats.js','title-model.js','mask-edit-model.js','spatial-model.js','character-ik-model.js','character-deform-model.js','character-advanced-model.js','character-animation-model.js','runtime-model.js','character-weight-tools.js','character-mesh-tools.js','character-mesh-authoring.js','character-mesh-reduction.js','character-mesh-repair.js');
self.onmessage=({data})=>{try{
 let last=0;const onProgress=p=>{const now=Date.now();if(!p.completed||p.completed===p.total||now-last>=100){last=now;self.postMessage({progress:p});}};
 const request={...data,onProgress},result=data.mode==='scan'?self.CardCharacterMeshRepair.scan(request):data.mode==='auto'?self.CardCharacterMeshRepair.auto(request):null;
 if(!result)throw Error('未知的动作扫描操作');self.postMessage({result});
}catch(e){self.postMessage({error:e.message});}};
