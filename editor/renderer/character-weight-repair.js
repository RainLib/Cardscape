/* Local weight repair. FFD/binds/topology are immutable; all clips constrain
 * each coordinate step. Work runs in a cancellable worker on a disposable copy. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-animation-model.js'),require('./runtime-model.js'),require('./character-weight-tools.js'),require('./character-motion-audit.js'));else root.CardCharacterWeightRepair=factory(root.CardCharacterAnimation,root.CardRuntime,root.CardCharacterWeightTools,root.CardCharacterMotionAudit);})(typeof window==='object'?window:globalThis,(C,R,T,A)=>{
'use strict';
function repair(source,layerId,{locked=[],onProgress=()=>{}}={}){
 const doc=structuredClone(source),mesh=doc.characterRig?.meshes.find(m=>m.layerId===layerId),layer=doc.layers.find(l=>l.id===layerId);
 if(!mesh||!layer||layer.locked)throw Error('请选择并解锁当前蒙皮图层');
 const scoped={...doc,characterRig:{...doc.characterRig,meshes:[mesh]}},before=doc.actions.map(a=>A.audit(scoped,a,{collectIssues:true})),original=structuredClone(mesh.weights),fixed=new Set(locked);
 const issues=before.flatMap(r=>r.issues),region=[...new Set(issues.flatMap(i=>i.vertices))].sort((a,b)=>a-b),result={changed:false,before,after:before,vertices:[],region,weights:original,maxWeightDelta:0};
 if(!region.length)return {...result,reason:before.every(r=>r.ok)?'全部动作均通过，无需修正':'仅发现 IK 异常，请调整 IK 约束'};
 // Bound memory/work for large imports; cancellation never changes the card.
 const sampleCount=1+before.reduce((n,r)=>n+r.samples,0);
 if(region.length>128||region.length*sampleCount>500000)return {...result,reason:'问题区域过大，请先分区刷涂或手工调整，再检查修正'};
 const base=R.placement(doc,layer),frames=[{pose:C.rest(doc)}];
 for(const action of doc.actions)for(const seconds of A.sampleTimes(action))frames.push({pose:C.sample(doc,action,seconds,{seek:true})});
 for(const f of frames)f.points=Float64Array.from(C.geometry(scoped,layer,f.pose,base).positions);
 const faces=[];for(let j=0;j<mesh.triangles.length;j+=3){const ids=mesh.triangles.slice(j,j+3),[a,b,c]=ids,v=mesh.vertices,area=(v[b*2]-v[a*2])*(v[c*2+1]-v[a*2+1])-(v[c*2]-v[a*2])*(v[b*2+1]-v[a*2+1]);if(!Number.isFinite(area)||Math.abs(area)<1e-9)return {...result,reason:'源网格存在退化三角形，请先编辑拓扑'};faces.push({ids,factor:-1024*1024/area});}
 const ratio=(face,p)=>{const [a,b,c]=face.ids.map(i=>i*3);return ((p[b]-p[a])*(p[c+1]-p[a+1])-(p[c]-p[a])*(p[b+1]-p[a+1]))*face.factor;};
 const adjacent=T.neighbors(mesh),incident=region.map(i=>faces.filter(f=>f.ids.includes(i))),basis=new Map();
 // Healthy samples form hard constraints: a repair cannot create a new fault.
 for(const face of faces)face.floors=frames.map(f=>{const r=ratio(face,f.points);return r>=.1?Math.min(r,.1005):null;});
 const blend=(a,b,t)=>{const ids=new Set([...a,...b].map(w=>w.boneId));return [...ids].map(boneId=>({boneId,weight:fixed.has(boneId)?a.find(w=>w.boneId===boneId)?.weight||0:(a.find(w=>w.boneId===boneId)?.weight||0)*(1-t)+(b.find(w=>w.boneId===boneId)?.weight||0)*t})).filter(w=>w.weight>1e-10);};
 function pointsFor(i,weights){const cache=basis.get(i);return frames.map((f,k)=>{let x=0,y=0;for(const w of weights){const p=cache.get(w.boneId)[k];x+=p[0]*w.weight;y+=p[1]*w.weight;}return [x,y];});}
 function apply(i,weights,points){mesh.weights[i]=weights;frames.forEach((f,k)=>{f.points[i*3]=points[k][0];f.points[i*3+1]=points[k][1];});}
 function direction(i,faces,target){const points=pointsFor(i,target),lines=[];let hi=1;
  for(const face of faces)for(let k=0;k<frames.length;k++){const p=frames[k].points,r=ratio(face,p),x=p[i*3],y=p[i*3+1];p[i*3]=points[k][0];p[i*3+1]=points[k][1];const slope=ratio(face,p)-r;p[i*3]=x;p[i*3+1]=y;if(!Number.isFinite(r)||!Number.isFinite(slope))return null;const floor=face.floors[k];if(floor!==null&&slope<0)hi=Math.min(hi,Math.max(0,(r-floor)/-slope));lines.push([r,slope]);}
  if(hi<1e-10)return null;
  const loss=t=>lines.reduce((sum,[r,slope])=>sum+Math.max(0,.102-r-slope*t)**2,0),initial=loss(0);
  let lo=0,upper=hi;for(let n=0;n<32;n++){const a=(lo*2+upper)/3,b=(lo+upper*2)/3;if(loss(a)<=loss(b))upper=b;else lo=a;}
  let t=(lo+upper)/2,value=loss(t);if(initial-value<1e-12)return null;
  // Stop at the first safe point along the smoothing direction, retaining detail.
  if(value<1e-12){let low=0,high=t;for(let n=0;n<30;n++){const mid=(low+high)/2;if(loss(mid)<1e-12)high=mid;else low=mid;}t=high;value=loss(t);}
  const weights=blend(mesh.weights[i],target,t),delta=weights.reduce((s,w)=>s+(w.weight-(mesh.weights[i].find(a=>a.boneId===w.boneId)?.weight||0))**2,0);
  return {i,weights,points:pointsFor(i,weights),gain:initial-value,delta};
 }
 onProgress({stage:'prepare'});
 for(let index=0;index<region.length;index++){const i=region[index],pool=new Set(original[i].map(w=>w.boneId)),near=new Map();for(const j of adjacent[i])for(const w of original[j])near.set(w.boneId,(near.get(w.boneId)||0)+w.weight);for(const [id]of [...near].sort((a,b)=>b[1]-a[1]))if(pool.size<4&&!fixed.has(id))pool.add(id);
  const cache=new Map();for(const id of pool){const old=mesh.weights[i];mesh.weights[i]=[{boneId:id,weight:1}];cache.set(id,frames.map(f=>{const p=C.geometry(scoped,layer,f.pose,base).positions;return [p[i*3],p[i*3+1]];}));mesh.weights[i]=old;}basis.set(i,cache);
 }
 for(let pass=0;pass<16;pass++){let best=null;
  for(let index=0;index<region.length;index++){const i=region[index],pool=basis.get(i),mean=new Map();for(const j of adjacent[i]){const d=Math.hypot(mesh.vertices[i*2]-mesh.vertices[j*2],mesh.vertices[i*2+1]-mesh.vertices[j*2+1]),factor=1/Math.max(1,d*d);for(const w of original[j])if(pool.has(w.boneId))mean.set(w.boneId,(mean.get(w.boneId)||0)+w.weight*factor);}
   const targets=[T.normalized([...mean].map(([boneId,weight])=>({boneId,weight})),fixed,original[i]),...[...pool.keys()].filter(id=>!fixed.has(id)).map(boneId=>T.normalized([{boneId,weight:1}],fixed,original[i]))];
   for(const target of targets){const candidate=direction(i,incident[index],target);if(candidate&&(!best||candidate.gain>best.gain+1e-10||Math.abs(candidate.gain-best.gain)<1e-10&&candidate.delta<best.delta))best=candidate;}
  }
  if(!best)break;apply(best.i,best.weights,best.points);onProgress({stage:'smooth',pass:pass+1});
  if(faces.every(face=>frames.every(f=>ratio(face,f.points)>=.1005)))break;
 }
 onProgress({stage:'verify'});
 const after=doc.actions.map(a=>A.audit(scoped,a,{collectIssues:true}));
 // Float32 runtime geometry is authoritative, rather than the optimizer's cache.
 const rest=C.geometry(scoped,layer,C.rest(doc),base).positions,oldRest=C.geometry({...scoped,characterRig:{...scoped.characterRig,meshes:[{...mesh,weights:original}]}},layer,C.rest(doc),base).positions;
 if(after.some(r=>r.flippedTriangles||r.compressedTriangles)||faces.some(f=>ratio(f,oldRest)>=.1&&ratio(f,rest)<.1))return {...result,reason:'锁定或现有绑定限制了修正；候选未全部通过，工程未修改，请手工调整权重或支撑网格'};
 const vertices=region.filter(i=>JSON.stringify(mesh.weights[i])!==JSON.stringify(original[i]));let maxWeightDelta=0;for(const i of vertices)for(const id of new Set([...original[i],...mesh.weights[i]].map(w=>w.boneId)))maxWeightDelta=Math.max(maxWeightDelta,Math.abs((original[i].find(w=>w.boneId===id)?.weight||0)-(mesh.weights[i].find(w=>w.boneId===id)?.weight||0)));
 return {...result,changed:!!vertices.length,after,vertices,weights:mesh.weights,maxWeightDelta,reason:after.every(r=>r.ok)?'全部动作采样通过；网格、绑定与 FFD 保留':'翻面与压缩采样通过；现有 IK 异常需调整约束'};
}
return {repair};
});
