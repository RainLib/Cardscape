/* Editor-only, self-owned motion-aware vertex removal. UVs provide a common
 * surface coordinate even when the atlas and rest mesh use different spaces.
 * Survivors retain their weights, bind positions and every sparse FFD key. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-mesh-tools.js'),require('./character-animation-model.js'),require('./runtime-model.js'));else root.CardCharacterMeshReduction=factory(root.CardCharacterMeshTools,root.CardCharacterAnimation,root.CardRuntime);})(typeof window==='object'?window:globalThis,(U,C,R)=>{
'use strict';
const EPS=1e-8,pixelEpsilon=.0002;
const uv=(m,i)=>({x:m.uv[i*2],y:m.uv[i*2+1]});
const edgeKey=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function topology(m){
 const faces=[],edges=new Map(),active=new Set(m.triangles),points=[...active].map(i=>uv(m,i));
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),size=Math.max(1,Math.sqrt(m.triangles.length/3)),sx=Math.max(1e-6,(Math.max(...points.map(p=>p.x))-left)/size),sy=Math.max(1e-6,(Math.max(...points.map(p=>p.y))-top)/size),cells=new Map(),edgeCells=new Map();
 const cell=p=>[Math.floor((p.x-left)/sx),Math.floor((p.y-top)/sy)];
 function index(map,item,ps){const a=cell({x:Math.min(...ps.map(p=>p.x))-EPS,y:Math.min(...ps.map(p=>p.y))-EPS}),b=cell({x:Math.max(...ps.map(p=>p.x))+EPS,y:Math.max(...ps.map(p=>p.y))+EPS});for(let y=a[1];y<=b[1];y++)for(let x=a[0];x<=b[0];x++){const key=x+':'+y;if(!map.has(key))map.set(key,[]);map.get(key).push(item);}}
 for(let j=0;j<m.triangles.length;j+=3){const ids=m.triangles.slice(j,j+3),ps=ids.map(i=>uv(m,i));if(Math.abs(cross(...ps))<1e-14)throw Error('UV 三角形退化，无法可靠检查动画误差');const face={ids,points:ps};faces.push(face);index(cells,face,ps);for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,{a,b,count:0,p:uv(m,a),q:uv(m,b)});edges.get(key).count++;}}
 const boundary=[...edges.values()].filter(e=>e.count===1);for(const e of edges.values())index(edgeCells,e,[e.p,e.q]);
 function locate(p){const [x,y]=cell(p);for(const f of cells.get(x+':'+y)||[]){const values=U.baryUV(p,...f.points);if(values?.every(v=>v>=-EPS))return {ids:f.ids,values,missing:false};}let result=null,best=Infinity;for(const e of boundary){const dx=e.q.x-e.p.x,dy=e.q.y-e.p.y,t=Math.max(0,Math.min(1,((p.x-e.p.x)*dx+(p.y-e.p.y)*dy)/(dx*dx+dy*dy))),distance=(p.x-e.p.x-dx*t)**2+(p.y-e.p.y-dy*t)**2;if(distance<best){best=distance;result={ids:[e.a,e.b],values:[1-t,t],missing:true};}}if(!result)throw Error('网格缺少有效轮廓，无法比较误差');return result;}
 function nearbyEdges(p,q){const a=cell({x:Math.min(p.x,q.x)-EPS,y:Math.min(p.y,q.y)-EPS}),b=cell({x:Math.max(p.x,q.x)+EPS,y:Math.max(p.y,q.y)+EPS}),result=new Set();for(let y=a[1];y<=b[1];y++)for(let x=a[0];x<=b[0];x++)for(const e of edgeCells.get(x+':'+y)||[])result.add(e);return result;}
 return {faces,edges,active,locate,nearbyEdges};
}
function probes(a,b,ma,mb){
 const result=new Map(),add=p=>result.set(Math.round(p.x*1e10)+':'+Math.round(p.y*1e10),p);
 for(const [t,m]of [[a,ma],[b,mb]]){for(const i of t.active)add(uv(m,i));for(const e of t.edges.values())add({x:(e.p.x+e.q.x)/2,y:(e.p.y+e.q.y)/2});for(const f of t.faces)add({x:f.points.reduce((v,p)=>v+p.x,0)/3,y:f.points.reduce((v,p)=>v+p.y,0)/3});}
 // The intersection vertices of the old/new triangle overlay expose thin FFD
 // creases that a vertex-only comparison would miss.
 for(const e of b.edges.values())for(const f of a.nearbyEdges(e.p,e.q)){const den=(e.q.x-e.p.x)*(f.q.y-f.p.y)-(e.q.y-e.p.y)*(f.q.x-f.p.x);if(Math.abs(den)<1e-16)continue;const dx=f.p.x-e.p.x,dy=f.p.y-e.p.y,t=(dx*(f.q.y-f.p.y)-dy*(f.q.x-f.p.x))/den,u=(dx*(e.q.y-e.p.y)-dy*(e.q.x-e.p.x))/den;if(t>EPS&&t<1-EPS&&u>EPS&&u<1-EPS)add({x:e.p.x+(e.q.x-e.p.x)*t,y:e.p.y+(e.q.y-e.p.y)*t});}
 const originals=new Map([...a.active].map(i=>{const p=uv(ma,i);return [Math.round(p.x*1e10)+':'+Math.round(p.y*1e10),i];}));
 return [...result.values()].map(p=>({uv:[p.x,p.y],vertex:originals.get(Math.round(p.x*1e10)+':'+Math.round(p.y*1e10)),a:a.locate(p),b:b.locate(p)}));
}
function times(doc,steps){
 const result=[{actionId:null,seconds:0,name:'初始姿势'}];
 for(const action of doc.actions||[])if(action.id!=='flip'||['boneTracks','ikTracks','expressionTracks','deformTracks'].some(k=>Object.keys(action[k]||{}).length)||(doc.characterRig.constraints||[]).length||(doc.characterRig.expressions||[]).some(e=>e.value)){
  const ts=new Set(Array.from({length:steps+1},(_,i)=>i/steps));
  for(const field of ['boneTracks','ikTracks','expressionTracks','deformTracks','layerTracks'])for(const tracks of Object.values(action[field]||{}))for(const frames of Object.values(tracks)){for(let j=0;j<frames.length;j++){const f=frames[j];ts.add(f.at);if(f.at>0)ts.add(Math.max(0,f.at-1e-6));if(j)ts.add((frames[j-1].at+f.at)/2);}}
  for(const t of [...ts].sort((a,b)=>a-b))result.push({actionId:action.id,seconds:t*action.duration,name:action.name});
 }
 return result;
}
const posed=(doc,t)=>t.actionId?C.sample(doc,doc.actions.find(a=>a.id===t.actionId),t.seconds,{seek:true}):C.rest(doc);
const interpolate=(array,location,axis,map)=>location.ids.reduce((v,i,k)=>v+array[(map?map[i]:i)*3+axis]*location.values[k],0);
function address(m,location,p){let vertex=null,distance=Infinity;for(const i of new Set(m.triangles)){const q=uv(m,i),d=(q.x-p[0])**2+(q.y-p[1])**2;if(d<distance){distance=d;vertex=i;}}return {vertex,exact:distance<1e-16,face:[...location.ids],barycentric:[...location.values],outside:location.missing};}
function site(entry,m,s,t,error){return {layer:entry.layer.name,layerId:m.layerId,action:t.name,actionId:t.actionId,seconds:t.seconds,error,uv:s.uv,before:address(entry.mesh,s.a,s.uv),after:address(m,s.b,s.uv)};}
function weightField(m,location){const out=new Map();location.ids.forEach((i,k)=>{for(const w of m.weights[i])out.set(w.boneId,(out.get(w.boneId)||0)+w.weight*location.values[k]);});return out;}
function settings(options={}){const out={maxError:.75,maxBoundaryError:.5,maxWeightError:.05,...options};for(const [key,max]of [['maxError',1024],['maxBoundaryError',1024],['maxWeightError',1]])if(!Number.isFinite(out[key])||out[key]<0||out[key]>max)throw Error('请输入有效的动画、轮廓和权重误差阈值');return out;}
function passes(r,options={}){const s=settings(options);return !r.folds&&r.maxPositionError<=s.maxError+pixelEpsilon&&r.maxMotionError<=s.maxError+pixelEpsilon&&r.maxBoundaryError<=s.maxBoundaryError+pixelEpsilon&&r.maxWeightError<=s.maxWeightError+1e-8;}
function describe(r){return `位置 ${r.maxPositionError.toFixed(4)} px · 运动 ${r.maxMotionError.toFixed(4)} px · 轮廓 ${r.maxBoundaryError.toFixed(4)} px · 权重 ${(r.maxWeightError*100).toFixed(3)}% · ${r.frames} 个姿势 · ${r.folds} 翻面`+(r.worst?` · 最大误差：${r.worst.layer} / ${r.worst.action} ${r.worst.seconds.toFixed(3)}s`:'');}
function assert(r,options){if(!passes(r,options))throw Error('拓扑变化超过误差阈值，已取消：'+describe(r));}
function audit(doc,meshes,{steps=24}={}){
 if(!Number.isInteger(steps)||steps<1||steps>240)throw Error('动作检查采样数无效');
 const snapshots=meshes.map(m=>structuredClone(m)),poses=times(doc,steps),frames=poses.map(t=>posed(doc,t));
 const entries=snapshots.map(m=>{const layer=doc.layers.find(l=>l.id===m.layerId),base=R.placement(doc,layer),source={characterRig:{meshes:[m]}};return {mesh:m,layer,base,topology:topology(m),frames:frames.map(p=>C.geometry(source,layer,p,base).positions)};});
 // `survivors` is only used by vertex removal: unchanged samples can reuse the
 // original poses exactly. New vertices/rebuilds use the actual new FFD tracks.
 return function compare(current,nextMeshes,{survivors=null,stopAt=null}={}){
  const r={maxPositionError:0,maxMotionError:0,maxBoundaryError:0,maxWeightError:0,rmsError:0,frames:poses.length,probes:0,folds:0,beforeVertices:snapshots.reduce((v,m)=>v+m.weights.length,0),afterVertices:nextMeshes.reduce((v,m)=>v+m.weights.length,0),beforeTriangles:snapshots.reduce((v,m)=>v+m.triangles.length/3,0),afterTriangles:nextMeshes.reduce((v,m)=>v+m.triangles.length/3,0),complete:true,worst:null};let squares=0,count=0;
  const fail=()=>{if(stopAt&&!passes(r,stopAt)){r.complete=false;return true;}return false;};
  for(const entry of entries){const m=nextMeshes.find(m=>m.layerId===entry.mesh.layerId);if(!m)throw Error('动画检查找不到编辑后的网格');const map=survivors?.get(m.layerId),newTopology=topology(m),samples=probes(entry.topology,newTopology,entry.mesh,m),scale=1024*entry.base.scale,arrays=map?entry.frames:poses.map(t=>C.geometry({characterRig:{meshes:[m]}},entry.layer,posed(current,t),entry.base).positions);
   r.probes+=samples.length;
   for(const s of samples){const aw=weightField(entry.mesh,s.a),bw=weightField(m,s.b);let error=0;for(const id of new Set([...aw.keys(),...bw.keys()]))error+=Math.abs((aw.get(id)||0)-(bw.get(id)||0));r.maxWeightError=Math.max(r.maxWeightError,error/2);const delta=[0,1,2].map(axis=>(interpolate(arrays[0],s.b,axis,map)-interpolate(entry.frames[0],s.a,axis))*scale);s.rest=delta;if(s.a.missing||s.b.missing)r.maxBoundaryError=Math.max(r.maxBoundaryError,Math.hypot(...delta));}
   if(fail())return r;
   for(let f=0;f<poses.length;f++){
    for(const s of samples){const delta=[0,1,2].map(axis=>(interpolate(arrays[f],s.b,axis,map)-interpolate(entry.frames[f],s.a,axis))*scale),error=Math.hypot(...delta),motion=Math.hypot(...delta.map((v,k)=>v-s.rest[k]));if(!r.worstMotion||motion>r.maxMotionError){r.maxMotionError=motion;r.worstMotion=site(entry,m,s,poses[f],motion);}if(!r.worst||error>r.maxPositionError){r.maxPositionError=error;r.worst=site(entry,m,s,poses[f],error);}if(s.vertex!==undefined){if(!r.worstVertex||error>r.worstVertex.error)r.worstVertex=site(entry,m,s,poses[f],error);if(!r.worstMotionVertex||motion>r.worstMotionVertex.error)r.worstMotionVertex=site(entry,m,s,poses[f],motion);}squares+=error*error;count++;}
    for(const face of newTopology.faces){const [a,b,c]=face.ids,idx=i=>map?map[i]:i,p=arrays[f],area=(p[idx(b)*3]-p[idx(a)*3])*(p[idx(c)*3+1]-p[idx(a)*3+1])-(p[idx(c)*3]-p[idx(a)*3])*(p[idx(b)*3+1]-p[idx(a)*3+1]),source=face.ids.map(i=>({x:m.vertices[i*2],y:m.vertices[i*2+1]}));if(cross(...source)*area>=-1e-14)r.folds++;if(cross(...source)*cross(...face.points)<=0)r.folds++;}
    if(fail())return r;
   }
  }
  r.rmsError=Math.sqrt(squares/Math.max(1,count));return r;
 };
}
function simplify(doc,meshes,options={}){
 const limits=settings(options),ratio=options.ratio??.5,allowBoundary=options.allowBoundary??false;
 if(!Number.isFinite(ratio)||ratio<.05||ratio>1)throw Error('减面保留比例应在 5%–100%');if(!meshes.length)throw Error('请先选择网格');
 const signature=JSON.stringify([meshes[0].vertices,meshes[0].uv,meshes[0].triangles]);if(meshes.some(m=>JSON.stringify([m.vertices,m.uv,m.triangles])!==signature))throw Error('同步减面需要相同拓扑');
 const original=meshes.map(m=>structuredClone(m)),restoreAnimation=meshes.map(m=>U.checkpointAnimation(m,doc)),compare=audit(doc,meshes,options),ids=meshes[0].weights.map((_,i)=>i),target=Math.max(3,Math.ceil(ids.length*ratio));let rejected=0,removed=0;
 const survivors=()=>new Map(meshes.map(m=>[m.layerId,ids]));
 try{
  for(let pass=0;pass<3&&ids.length>target;pass++){
   const first=meshes[0],pool=[];
   for(let i=0;i<ids.length;i++){if(meshes.some(m=>m.topology?.pins.includes(i)||m.topology?.edges.some(e=>e.includes(i))))continue;let plan;try{plan=U.deletion(first,i);}catch{continue;}if(plan.boundary&&!allowBoundary)continue;let area=0;for(let j=0;j<first.triangles.length;j+=3){const tri=first.triangles.slice(j,j+3);if(tri.includes(i))area+=Math.abs(cross(...tri.map(v=>uv(first,v))));}pool.push({id:ids[i],area,boundary:plan.boundary});}
   pool.sort((a,b)=>Number(a.boundary)-Number(b.boundary)||a.area-b.area||a.id-b.id);let changed=0;
   for(const candidate of pool){if(ids.length<=target)break;const index=ids.indexOf(candidate.id);if(index<0)continue;let plan;try{plan=U.deletion(meshes[0],index);}catch{rejected++;continue;}if(plan.boundary&&!allowBoundary)continue;
    const trial=meshes.map(m=>({...m,triangles:plan.triangles}));const report=compare(doc,trial,{survivors:survivors(),stopAt:limits});if(!passes(report,limits)){rejected++;continue;}
    for(const m of meshes)U.erase(m,index,{document:doc});ids.splice(index,1);removed++;changed++;options.onProgress?.({removed,remaining:ids.length,target});
   }
   if(!changed)break;
  }
  const report=compare(doc,meshes,{survivors:survivors()});assert(report,limits);return {...report,removed,rejected,target,reachedTarget:ids.length<=target,limits:{maxError:limits.maxError,maxBoundaryError:limits.maxBoundaryError,maxWeightError:limits.maxWeightError}};
 }catch(error){meshes.forEach((m,i)=>{for(const key of Object.keys(m))delete m[key];Object.assign(m,original[i]);});restoreAnimation.forEach(restore=>restore());throw error;}
}
// Review snapshots are editor-only and deliberately omit image payloads. The UI
// keeps registered textures for the captured revision; no review state is saved.
function snapshot(doc){return structuredClone({characterRig:doc.characterRig,actions:doc.actions,slots:doc.slots,layers:doc.layers.map(({src,...l})=>l)});}
function review(before,after,ids){
 const entries=ids.map(id=>{const a=before.characterRig.meshes.find(m=>m.layerId===id),b=after.characterRig.meshes.find(m=>m.layerId===id),layer=before.layers.find(l=>l.id===id);if(!a||!b||!layer)throw Error('比较快照缺少网格或图层');const ta=topology(a),tb=topology(b),samples=probes(ta,tb,a,b),base=R.placement(before,layer),entry={mesh:a,next:b,layer,base,samples};
  // Tessellate only the display heatmap. Audit extrema still use the full old /
  // new triangle overlay, including removed vertices and edge intersections.
  const heat=[],n=a.triangles.length>6000?1:3;
  for(const face of ta.faces){const node=(i,j)=>{const p={x:face.points[0].x+(face.points[1].x-face.points[0].x)*i/n+(face.points[2].x-face.points[0].x)*j/n,y:face.points[0].y+(face.points[1].y-face.points[0].y)*i/n+(face.points[2].y-face.points[0].y)*j/n};return {a:{ids:face.ids,values:[1-(i+j)/n,i/n,j/n]},b:tb.locate(p)};};for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){heat.push([node(i,j),node(i+1,j),node(i,j+1)]);if(i+j<n-1)heat.push([node(i+1,j),node(i+1,j+1),node(i,j+1)]);}}
  entry.locate=p=>{const q={x:p[0],y:p[1]};return {layerId:id,uv:p,before:address(a,ta.locate(q),p),after:address(b,tb.locate(q),p)};};entry.heat=heat;const restA=C.geometry(before,layer,C.rest(before),base).positions,restB=C.geometry(after,layer,C.rest(after),base).positions;for(const s of [...samples,...heat.flat()])s.rest=[0,1,2].map(k=>interpolate(restB,s.b,k)-interpolate(restA,s.a,k));return entry;
 });
 const actions=times(before,1).filter((t,i,a)=>a.findIndex(v=>v.actionId===t.actionId)===i).map(t=>({id:t.actionId,name:t.name,duration:before.actions.find(a=>a.id===t.actionId)?.duration||0}));
 function frame(actionId,seconds,layerId=ids[0]){const action=actions.find(a=>a.id===actionId);if(!action||!Number.isFinite(seconds))throw Error('比较动作或时刻无效');seconds=Math.max(0,Math.min(action.duration,seconds));const t={actionId,seconds,name:action.name},pa=posed(before,t),pb=posed(after,t),e=entries.find(e=>e.layer.id===layerId);if(!e)throw Error('比较图层不存在');const a=C.geometry(before,e.layer,pa,e.base).positions,b=C.geometry(after,e.layer,pb,e.base).positions,scale=1024*e.base.scale;
  const point=(p,l)=>{const x=interpolate(p,l,0)*1024,y=-interpolate(p,l,1)*1024,c=Math.cos(e.base.rotation),s=Math.sin(e.base.rotation);return {x:512+e.base.x+(x*c-y*s)*e.base.scale,y:768+e.base.y+(x*s+y*c)*e.base.scale};};
  const field=s=>{const delta=[0,1,2].map(k=>interpolate(b,s.b,k)-interpolate(a,s.a,k));return {error:Math.hypot(...delta)*scale,motionError:Math.hypot(...delta.map((v,k)=>v-s.rest[k]))*scale,beforePoint:point(a,s.a),afterPoint:point(b,s.b)};};
  const samples=e.samples.map(s=>({...field(s),uv:s.uv})),heat=e.heat.map(tri=>tri.map(field));let worst=0,worstMotion=0;for(let i=1;i<samples.length;i++){if(samples[i].error>samples[worst].error)worst=i;if(samples[i].motionError>samples[worstMotion].motionError)worstMotion=i;}
  return {actionId,seconds,layerId,samples,heat,worst:site(e,e.next,e.samples[worst],t,samples[worst].error),worstMotion:site(e,e.next,e.samples[worstMotion],t,samples[worstMotion].motionError),poses:[pa,pb]};
 }
 return {entries,actions,frame,before,after,locate(layerId,p){const entry=entries.find(e=>e.layer.id===layerId);if(!entry)throw Error('比较图层不存在');return entry.locate(p);}};
}
function heatColor(error,limit){const ratio=Math.min(1,Math.max(0,(error<=pixelEpsilon?0:error)/Math.max(pixelEpsilon,limit)));return `hsl(${(1-ratio)*220} 90% 55%)`;}
return {audit,simplify,settings,passes,assert,describe,snapshot,review,heatColor};
});
