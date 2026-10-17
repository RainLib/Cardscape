/* Heatmap selections live in UV space, never in posed/card or atlas pixels.
 * Restore the compared source group before repairing: subdividing a reduced
 * mesh alone cannot recover deleted weights, bind samples or FFD keys. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-mesh-tools.js'),require('./character-mesh-authoring.js'),require('./character-mesh-reduction.js'),require('./character-animation-model.js'));else root.CardCharacterMeshRepair=factory(root.CardCharacterMeshTools,root.CardCharacterMeshAuthoring,root.CardCharacterMeshReduction,root.CardCharacterAnimation);})(typeof window==='object'?window:globalThis,(U,M,N,C)=>{
'use strict';
const key=p=>p.map(v=>Math.round(v*1e10)).join(':'),vertex=(m,i)=>({x:m.vertices[i*2],y:m.vertices[i*2+1]});
function choose(frame,{metric='error',threshold=.75,box=null,side='after',previous=[]}={}){
 if(!['error','motionError'].includes(metric)||!['before','after'].includes(side)||!Number.isFinite(threshold)||threshold<0||threshold>1024)throw Error('误差选区参数无效');
 if(box&&(!['x','y','width','height'].every(k=>Number.isFinite(box[k]))||box.width<0||box.height<0))throw Error('误差框选范围无效');
 const result=new Map(previous.map(p=>[key(p),p]));
 for(const sample of [...frame.samples].sort((a,b)=>b[metric]-a[metric])){const p=sample[side+'Point'];if(sample[metric]<=.0002||sample[metric]<threshold||box&&(p.x<box.x||p.x>box.x+box.width||p.y<box.y||p.y>box.y+box.height))continue;result.set(key(sample.uv),sample.uv);}
 return [...result.values()].map(p=>[...p]);
}
function region(mesh,uvs){
 if(!Array.isArray(uvs)||uvs.length>100000||uvs.some(p=>!Array.isArray(p)||p.length!==2||!p.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('误差选区 UV 无效');
 const faces=new Map(),points=[];
 for(const uv of new Map(uvs.map(p=>[key(p),p])).values()){const at=U.locateUV(mesh,{x:uv[0],y:uv[1]});if(!at)continue;faces.set(at.j,at.ids);points.push({uv,location:at,x:at.ids.reduce((v,i,k)=>v+mesh.vertices[i*2]*at.values[k],0),y:at.ids.reduce((v,i,k)=>v+mesh.vertices[i*2+1]*at.values[k],0)});}
 return {faces:[...faces.values()],vertices:[...new Set([...faces.values()].flat())].sort((a,b)=>a-b),points};
}
function plan({source,current,ids,layerId,uvs,kind='protect',spacing=24}){
 if(!['protect','refine'].includes(kind)||!Number.isFinite(spacing)||spacing<8||spacing>160)throw Error('局部修正参数无效');
 if(!ids?.length||new Set(ids).size!==ids.length||!ids.includes(layerId))throw Error('修正网格组无效');
 const next=N.snapshot(current),sourceMesh=source.characterRig.meshes.find(m=>m.layerId===layerId);if(!sourceMesh)throw Error('操作前网格已不可用');
 const selected=region(sourceMesh,uvs);if(!selected.vertices.length)throw Error('请先选择有源网格支撑的高误差区域');
 const meshes=ids.map(id=>{if(!current.characterRig.meshes.some(m=>m.layerId===id))throw Error('当前网格已不存在');const layer=current.layers.find(l=>l.id===id);if(!layer||layer.locked)throw Error('请先解锁参与修正的图层');const original=source.characterRig.meshes.find(m=>m.layerId===id);if(!original)throw Error('操作前网格组不完整');const copy=structuredClone(original);next.characterRig.meshes[next.characterRig.meshes.findIndex(m=>m.layerId===id)]=copy;return copy;});
 const signature=m=>JSON.stringify([m.vertices,m.uv,m.triangles]);if(meshes.some(m=>signature(m)!==signature(sourceMesh)))throw Error('同步修正需要相同源拓扑');
 // Restore only this group's FFD tracks, by action ID (not array position).
 // Sibling layers, bones, constraints, curve metadata and other tracks survive.
 for(const action of next.actions){const old=source.actions.find(a=>a.id===action.id);if(!old)throw Error('动作列表已变化，请重新检查误差');for(const id of ids){if(old.deformTracks?.[id]){action.deformTracks||={};action.deformTracks[id]=structuredClone(old.deformTracks[id]);}else if(action.deformTracks)delete action.deformTracks[id];}}
 if(source.actions.some(a=>!next.actions.some(b=>a.id===b.id)))throw Error('动作列表已变化，请重新检查误差');
 const baseline=N.snapshot(next),compare=N.audit(baseline,baseline.characterRig.meshes.filter(m=>ids.includes(m.layerId))),originalCount=meshes[0].weights.length;
 for(const m of meshes)M.pin(m,selected.vertices);
 let added=0;
 if(kind==='refine'){
  const domain={vertices:sourceMesh.vertices,triangles:selected.faces.flat()},coords=selected.vertices.map(i=>vertex(sourceMesh,i)),xs=coords.map(p=>p.x),ys=coords.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  // Edge-intersection probes can lie microns from existing vertices. Seed
  // face interiors instead, avoiding thin support triangles and float32 folds.
  added=M.fillGroup(meshes,{document:next,spacing,maxVertices:Math.min(M.budget(next,meshes),originalCount+128),features:selected.faces.slice(0,64).map(face=>({x:face.reduce((v,i)=>v+sourceMesh.vertices[i*2],0)/3,y:face.reduce((v,i)=>v+sourceMesh.vertices[i*2+1],0)/3})),region:{kind:'box',x,y,width,height},accept(m,index){return !!U.locate(domain,vertex(m,index));}});
  for(const m of meshes)M.pin(m,Array.from({length:m.weights.length-originalCount},(_,i)=>originalCount+i));
 }
 C.validate(next);const report=compare(next,meshes);N.assert(report,{maxError:.001,maxBoundaryError:0,maxWeightError:0});
 return {document:next,ids:[...ids],layerId,kind,added,protected:meshes[0].topology.pins.length,regionVertices:selected.vertices.length,regionFaces:selected.faces.length,beforeVertices:current.characterRig.meshes.find(m=>m.layerId===layerId).weights.length,sourceVertices:originalCount,afterVertices:meshes[0].weights.length,report};
}
return {choose,region,plan,key};
});
