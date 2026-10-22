// Reproducible authoring recipe for the existing registered Quantumslinger.
// Work on an offline copy and open that copy in the editor for acceptance.
const C=require('../dist/renderer/character-animation-model.js'),T=require('../dist/renderer/character-weight-tools.js'),J=require('../dist/renderer/character-joint-tools.js'),Pixels=require('./character-source-coverage.cjs');
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function prepare(source,{support}={}){
 const doc=structuredClone(source),required=['root','shoulder','forearm','near-leg','far-leg','cloth'];for(const id of required)if(!doc.characterRig?.bones.some(b=>b.id===id))throw Error('Missing Quantumslinger bone: '+id);
 const seed=doc.actions.find(a=>a.name==='抬枪与提腿 · 4秒完整动作');if(!seed)throw Error('Missing authored four-second motion');
 doc.id='quantumslinger-wide-joint-motion';doc.name='量子枪客 · 大幅抬枪与提腿';
 if(support){const body=doc.layers.find(l=>l.id==='hero-body');body.underpaint={...body.underpaint,original:body.src,candidate:support.candidate,addedMask:support.addedMask,supportMask:support.mask,filledPixels:support.filledPixels,jobId:support.jobId};body.src=support.image;}
 const rest=C.compile(doc.characterRig).rest,summary=[];
 for(const mesh of doc.characterRig.meshes){const layer=doc.layers.find(l=>l.id===mesh.layerId),settings=layer.id==='near-grip'?{boneId:'forearm',parentId:'shoulder',inner:16,outer:110}:layer.id==='near-leg'?{boneId:'near-leg',parentId:'root',inner:36,outer:190}:layer.id==='far-leg'?{boneId:'far-leg',parentId:'root',inner:32,outer:185}:layer.anatomy?.part==='cape'?{boneId:'cloth',parentId:'root',inner:80,outer:360}:null;
  let added=0;if(settings){const mat=rest.get(settings.boneId),pivot=T.sourcePoint(doc,layer,{x:mat[4],y:mat[5]});added=J.rings(mesh,{pivot,radii:settings.boneId==='forearm'?[24,52,82,112]:[40,88,140,192],segments:16});J.radial(mesh,{...settings,pivot});if(layer.id==='near-grip')mesh.weights=mesh.weights.map(()=>[{boneId:'forearm',weight:1}]);}
  else if(layer.id==='far-grip')mesh.weights=mesh.weights.map(()=>[{boneId:'far-arm',weight:1}]);
  else{const mat=rest.get('shoulder'),pivot=T.sourcePoint(doc,layer,{x:mat[4],y:mat[5]});added=J.rings(mesh,{pivot,radii:[24,56,96,144],segments:16});mesh.weights=mesh.weights.map((_,i)=>{const x=mesh.vertices[i*2],y=mesh.vertices[i*2+1],w=smooth(280,345,x)*(1-smooth(400,485,x))*smooth(300,370,y)*(1-smooth(465,555,y));return w>1e-8?[{boneId:'shoulder',weight:w},...(w<1-1e-8?[{boneId:'root',weight:1-w}]:[])]:[{boneId:'root',weight:1}];});}
  const removed=J.trim(mesh,Pixels.occupied([layer]));summary.push({layerId:layer.id,addedJointVertices:added,removedEmptyTriangles:removed,vertices:mesh.weights.length,triangles:mesh.triangles.length/3});
 }
 const action=structuredClone(seed);action.id='raise-gun-leg-wide';action.name='抬枪与提腿 · 大幅关节运动';
 for(const [id,tracks]of Object.entries(action.boneTracks))for(const frames of Object.values(tracks))for(const f of frames)f.value*=id==='root'?2.5:id==='near-leg'?4:id==='far-leg'?3.5:id==='cloth'?2:3;
 for(const [key,frames]of Object.entries(action.ikTracks.aim))for(const f of frames){const rest=key==='x'?268.64:key==='y'?335.36:0;if(key==='x'||key==='y')f.value=rest+(f.value-rest)*(key==='x'?8:7.5);}
 doc.actions.push(action);C.validate(doc);return {document:doc,action,summary};
}
module.exports={prepare};
