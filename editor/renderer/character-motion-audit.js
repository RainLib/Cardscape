/* Sample complete clips, including interpolation between authored keyframes.
 * This is an authoring diagnostic; it never changes weights or clamps motion. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-animation-model.js'),require('./runtime-model.js'));else root.CardCharacterMotionAudit=factory(root.CardCharacterAnimation,root.CardRuntime);})(typeof window==='object'?window:globalThis,(C,R)=>{
'use strict';
function audit(doc,action,{fps=60,minAreaRatio=.1}={}){
 if(!action||!Number.isFinite(action.duration)||action.duration<=0||!Number.isInteger(fps)||fps<1||fps>120)throw Error('请选择有效动作与 1–120 fps 的检查频率');
 const times=new Set(Array.from({length:Math.ceil(action.duration*fps)+1},(_,i)=>Math.min(action.duration,i/fps)));
 for(const field of ['boneTracks','ikTracks','expressionTracks'])for(const tracks of Object.values(action[field]||{}))for(const frames of Object.values(tracks))for(const f of frames)times.add(f.at*action.duration);
 const meshes=(doc.characterRig?.meshes||[]).map(mesh=>({mesh,layer:doc.layers.find(l=>l.id===mesh.layerId),base:R.placement(doc,doc.layers.find(l=>l.id===mesh.layerId))}));
 const result={actionId:action.id,name:action.name,duration:action.duration,fps,samples:times.size,meshCount:meshes.length,flippedTriangles:0,compressedTriangles:0,minAreaRatio:1,maxIKError:0,unreachableSamples:0,unresolvedSamples:0,firstIssue:null};
 for(const seconds of [...times].sort((a,b)=>a-b)){
  const pose=C.sample(doc,action,seconds,{seek:true});
  for(const [id,ik]of pose?.ik||[]){if(ik.mix<.00001)continue;result.maxIKError=Math.max(result.maxIKError,ik.error);if(ik.solver==='ccd'&&ik.mix>.999&&!ik.converged){result.unresolvedSamples++;result.firstIssue||={seconds,type:'ik-convergence',id};}if(!ik.reachable){result.unreachableSamples++;result.firstIssue||={seconds,type:'ik',id};}}
  for(const {mesh,layer,base}of meshes){const positions=C.geometry(doc,layer,pose,base).positions;
   for(let j=0;j<mesh.triangles.length;j+=3){const [a,b,c]=mesh.triangles.slice(j,j+3),v=mesh.vertices,source=(v[b*2]-v[a*2])*(v[c*2+1]-v[a*2+1])-(v[c*2]-v[a*2])*(v[b*2+1]-v[a*2+1]),area=(positions[b*3]-positions[a*3])*(positions[c*3+1]-positions[a*3+1])-(positions[c*3]-positions[a*3])*(positions[b*3+1]-positions[a*3+1]),ratio=-area*1024*1024/source;
    result.minAreaRatio=Math.min(result.minAreaRatio,ratio);if(!Number.isFinite(ratio)||ratio<=0){result.flippedTriangles++;result.firstIssue||={seconds,type:'triangle',layerId:layer.id,triangle:j/3,vertices:[a,b,c]};}else if(ratio<minAreaRatio){result.compressedTriangles++;result.firstIssue||={seconds,type:'compression',layerId:layer.id,triangle:j/3,vertices:[a,b,c]};}
   }
  }
 }
 result.ok=!result.flippedTriangles&&!result.compressedTriangles&&!result.unreachableSamples&&!result.unresolvedSamples;return result;
}
return {audit};
});
