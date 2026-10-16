/* Self-owned 2D skinning, two-link IK and additive facial morphs.
 * Rest vertices and morph deltas are source pixels; IK targets are registered
 * card pixels. Rendering adapters keep the source UVs and painter order. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardCharacterAdvanced=api;})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const finite=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const pair=(v,min,max)=>Array.isArray(v)&&v.length===2&&v.every(n=>finite(n,min,max));
const angle=m=>Math.atan2(m[1],m[0]),point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const wrap=r=>Math.atan2(Math.sin(r),Math.cos(r)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ikTracks={x:{name:'IK · 目标 X',min:-4096,max:4096,step:.001,unit:'px',default:0},y:{name:'IK · 目标 Y',min:-4096,max:4096,step:.001,unit:'px',default:0},mix:{name:'IK · 约束权重',min:0,max:1,step:.001,unit:'×',default:1}};
const expressionTracks={value:{name:'表情 · 权重',min:0,max:1,step:.001,unit:'×',default:0}};

function validate(doc,compiled){
 const rig=doc.characterRig;if(!rig)return;
 const bones=new Map(rig.bones.map(b=>[b.id,b])),constraints=rig.constraints||[],expressions=rig.expressions||[],meshes=rig.meshes||[];
 if(!Array.isArray(constraints)||constraints.length>16||!Array.isArray(expressions)||expressions.length>32||!Array.isArray(meshes)||meshes.length>32)throw Error('人物高级绑定数量超限');
 const ids=new Set(),driven=new Set(),ancestor=(a,b)=>{for(let p=b;p;p=bones.get(p)?.parentId)if(p===a)return true;return false;};
 for(const c of constraints){
  if(!fields(c,['id','name','rootId','tipId','end','target','bend','mix'])||!validId(c.id)||ids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||!bones.has(c.rootId)||bones.get(c.tipId)?.parentId!==c.rootId||!pair(c.end,-4096,4096)||Math.hypot(...c.end)<.001||!pair(c.target,-4096,4096)||![1,-1].includes(c.bend)||!finite(c.mix,0,1))throw Error('IK 必须是有效的两节父子骨骼链');
  const tip=bones.get(c.tipId);if(Math.hypot(tip.x,tip.y)<.001||driven.has(c.rootId)||driven.has(c.tipId))throw Error('IK 骨骼不能零长度或被重复驱动');
  for(const id of [c.rootId,c.tipId])for(const other of driven)if(ancestor(id,other)||ancestor(other,id))throw Error('当前两节 IK 不支持相互包含的骨骼链，请使用独立分支');
  ids.add(c.id);driven.add(c.rootId);driven.add(c.tipId);
 }
 const expressionIds=new Set();
 for(const e of expressions){if(!fields(e,['id','name','value'])||!validId(e.id)||expressionIds.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>100||!finite(e.value,0,1))throw Error('表情控制器无效');expressionIds.add(e.id);}
 const layers=new Set();let totalVertices=0;
 for(const m of meshes){
  const layer=doc.layers.find(l=>l.id===m?.layerId),n=m?.vertices?.length/2;
  if(!fields(m,['layerId','vertices','uv','triangles','weights','morphs','depths','topology'])||!layer||!['image','foreground'].includes(layer.kind)||layer.previewReference||layers.has(m.layerId)||!Array.isArray(m.vertices)||!Number.isInteger(n)||n<3||n>4096||(totalVertices+=n)>16384||m.vertices.some(v=>!finite(v,-4096,4096))||!Array.isArray(m.uv)||m.uv.length!==n*2||m.uv.some(v=>!finite(v,0,1))||!Array.isArray(m.triangles)||m.triangles.length<3||m.triangles.length%3||m.triangles.length>24576||m.triangles.some(v=>!Number.isInteger(v)||v<0||v>=n)||!Array.isArray(m.weights)||m.weights.length!==n||!Array.isArray(m.morphs)||m.morphs.length>32||m.depths!==undefined&&(!Array.isArray(m.depths)||m.depths.length!==n||m.depths.some(v=>!finite(v,-.25,.25))))throw Error('人物蒙皮网格无效或超限');
  if(m.topology!==undefined){const r=m.topology,index=i=>Number.isInteger(i)&&i>=0&&i<n;if(!fields(r,['pins','edges'])||!Array.isArray(r.pins)||r.pins.length>n||!r.pins.every(index)||new Set(r.pins).size!==r.pins.length||!Array.isArray(r.edges)||r.edges.length>8192)throw Error('网格关键点或约束边无效');const actual=new Set(),seen=new Set();for(let j=0;j<m.triangles.length;j+=3)for(let k=0;k<3;k++){const a=m.triangles[j+k],b=m.triangles[j+(k+1)%3];actual.add(Math.min(a,b)+':'+Math.max(a,b));}for(const e of r.edges){if(!Array.isArray(e)||e.length!==2||!e.every(index)||e[0]===e[1])throw Error('网格约束边索引无效');const id=Math.min(...e)+':'+Math.max(...e);if(!actual.has(id)||seen.has(id))throw Error('约束边必须是网格中的唯一连边');seen.add(id);}}
  for(const weights of m.weights){let sum=0;const seen=new Set();if(!Array.isArray(weights)||!weights.length||weights.length>4)throw Error('每顶点需要 1–4 个骨骼权重');for(const w of weights){if(!fields(w,['boneId','weight'])||!bones.has(w.boneId)||seen.has(w.boneId)||!finite(w.weight,0,1))throw Error('蒙皮骨骼权重无效');sum+=w.weight;seen.add(w.boneId);}if(Math.abs(sum-1)>.00001)throw Error('蒙皮顶点权重之和必须为 1');}
  for(let i=0;i<m.triangles.length;i+=3){const [a,b,c]=m.triangles.slice(i,i+3).map(v=>v*2);if(Math.abs((m.vertices[b]-m.vertices[a])*(m.vertices[c+1]-m.vertices[a+1])-(m.vertices[c]-m.vertices[a])*(m.vertices[b+1]-m.vertices[a+1]))<.000001)throw Error('蒙皮网格包含退化三角形');}
  const morphIds=new Set();for(const morph of m.morphs){if(!fields(morph,['expressionId','deltas'])||!expressionIds.has(morph.expressionId)||morphIds.has(morph.expressionId)||!Array.isArray(morph.deltas)||morph.deltas.length%3||morph.deltas.length>n*3)throw Error('表情形变目标无效');const seen=new Set();for(let i=0;i<morph.deltas.length;i+=3){const index=morph.deltas[i];if(!Number.isInteger(index)||index<0||index>=n||seen.has(index)||!finite(morph.deltas[i+1],-512,512)||!finite(morph.deltas[i+2],-512,512))throw Error('表情顶点偏移无效');seen.add(index);}morphIds.add(morph.expressionId);}
  layers.add(m.layerId);
 }
 for(const action of doc.actions||[]){
  for(const [field,targets,specs] of [['ikTracks',ids,ikTracks],['expressionTracks',expressionIds,expressionTracks]]){
   if(action[field]===undefined)continue;if(!fields(action[field],[...targets]))throw Error('人物动画引用了不存在的控制器');
   for(const values of Object.values(action[field])){if(!fields(values,Object.keys(specs)))throw Error('人物控制轨道无效');for(const [key,frames] of Object.entries(values)){const s=specs[key];if(!Array.isArray(frames)||!frames.length||frames.length>64)throw Error('人物控制关键帧无效');let last=-1;for(const f of frames){if(!fields(f,['at','value','ease'])||!finite(f.at,0,1)||f.at<=last||!finite(f.value,s.min,s.max)||!['linear','smooth','hold'].includes(f.ease||'linear'))throw Error('人物控制关键帧无效');last=f.at;}}}
  }
 }
}

// Analytic two-link solver. No stretching; unreachable targets clamp to the
// annulus. Local rotation changes preserve all descendant hierarchy transforms.
function solve(compiled,action,t,locals,build,sampleTrack){
 const diagnostics=new Map();let world=build();
 for(const c of compiled.constraints||[]){
  const values=action?.ikTracks?.[c.id]||{},target=[sampleTrack(values.x,t,c.target[0]),sampleTrack(values.y,t,c.target[1])],mix=sampleTrack(values.mix,t,c.mix);
  const root=world.get(c.rootId),tip=world.get(c.tipId),start=[root[4],root[5]],elbow=[tip[4],tip[5]],end=point(tip,...c.end),l1=Math.hypot(elbow[0]-start[0],elbow[1]-start[1]),l2=Math.hypot(end[0]-elbow[0],end[1]-elbow[1]);
  if(mix>0&&l1>.000001&&l2>.000001){
   const dx=target[0]-start[0],dy=target[1]-start[1],distance=Math.hypot(dx,dy),reach=clamp(distance,Math.abs(l1-l2)+.000001,l1+l2-.000001),aim=distance>.000001?Math.atan2(dy,dx):Math.atan2(elbow[1]-start[1],elbow[0]-start[0]);
   const theta=aim-c.bend*Math.acos(clamp((reach*reach+l1*l1-l2*l2)/(2*reach*l1),-1,1));
   const wantedRoot=angle(root)+wrap(theta-Math.atan2(elbow[1]-start[1],elbow[0]-start[0]));
   const desiredElbow=[start[0]+Math.cos(theta)*l1,start[1]+Math.sin(theta)*l1],clampedTarget=[start[0]+Math.cos(aim)*reach,start[1]+Math.sin(aim)*reach];
   const wantedTip=Math.atan2(clampedTarget[1]-desiredElbow[1],clampedTarget[0]-desiredElbow[0])-Math.atan2(c.end[1],c.end[0]);
   locals.get(c.rootId).rotation+=wrap(wantedRoot-angle(root))*180/Math.PI*mix;world=build();
   locals.get(c.tipId).rotation+=wrap(wantedTip-angle(world.get(c.tipId)))*180/Math.PI*mix;world=build();
  }
  const actual=point(world.get(c.tipId),...c.end);diagnostics.set(c.id,{target,actual,error:Math.hypot(actual[0]-target[0],actual[1]-target[1]),reachable:Math.hypot(target[0]-start[0],target[1]-start[1])<=l1+l2+.00001&&Math.hypot(target[0]-start[0],target[1]-start[1])>=Math.abs(l1-l2)-.00001,mix});
 }
 return {world,diagnostics};
}

function expressions(rig,action,t,sampleTrack){return new Map((rig.expressions||[]).map(e=>[e.id,sampleTrack(action?.expressionTracks?.[e.id]?.value,t,e.value)]));}

// Morph before skinning. Return positions in the layer's ORIGINAL local space;
// the renderer then applies its original placement exactly once. UV is immutable.
function geometry(doc,layer,pose,base){
 const mesh=doc.characterRig?.meshes?.find(m=>m.layerId===layer?.id);if(!mesh||!pose)return null;
 const vertices=Float64Array.from(mesh.vertices),r=base.rotation||0,c=Math.cos(r)*base.scale,s=Math.sin(r)*base.scale,tx=512+base.x,ty=768+base.y,det=c*c+s*s;
 for(const morph of mesh.morphs){const value=pose.expressions.get(morph.expressionId)||0;if(!value)continue;for(let j=0;j<morph.deltas.length;j+=3){const i=morph.deltas[j]*2;vertices[i]+=morph.deltas[j+1]*value;vertices[i+1]+=morph.deltas[j+2]*value;}}
 const positions=new Float32Array(vertices.length/2*3);
 for(let i=0;i<vertices.length/2;i++){
  const x=vertices[i*2]-512,y=vertices[i*2+1]-768,px=c*x-s*y+tx,py=s*x+c*y+ty;let dx=0,dy=0;
  for(const w of mesh.weights[i]){const m=pose.bones.get(w.boneId).matrix,p=point(m,px,py);dx+=p[0]*w.weight;dy+=p[1]*w.weight;}
  const localX=(c*(dx-tx)+s*(dy-ty))/det,localY=(-s*(dx-tx)+c*(dy-ty))/det;
  positions[i*3]=localX/1024;positions[i*3+1]=-localY/1024;positions[i*3+2]=mesh.depths?.[i]||0;
 }
 return {positions,uv:mesh.uv,indices:mesh.triangles,source:mesh};
}

function checksum(positions){let hash=2166136261;const bytes=new Uint8Array(positions.buffer,positions.byteOffset,positions.byteLength);for(const value of bytes)hash=Math.imul(hash^value,16777619);return (hash>>>0).toString(16);}
function grid(layerId,boneId,columns=12,rows=18){
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>63||rows>63||(columns+1)*(rows+1)>4096)throw Error('网格细分超出范围');
 const vertices=[],uv=[],triangles=[],weights=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){vertices.push(x/columns*1024,y/rows*1536);uv.push(x/columns,y/rows);weights.push([{boneId,weight:1}]);}
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x;triangles.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2);}
 return {layerId,vertices,uv,triangles,weights,morphs:[]};
}
function weights(mesh,index,boneId,value){
 if(!Number.isInteger(index)||index<0||index>=mesh.weights.length||!finite(value,0,1))throw Error('顶点或权重无效');
 const old=mesh.weights[index],others=old.filter(w=>w.boneId!==boneId),sum=others.reduce((s,w)=>s+w.weight,0);
 if(value<1&&!sum)throw Error('请先为该顶点选择第二个骨骼；单骨骼权重必须为 1');
 const next=others.map(w=>({...w,weight:w.weight/sum*(1-value)})).filter(w=>w.weight>.000001);if(value>0)next.push({boneId,weight:value});if(next.length>4)throw Error('每顶点最多 4 个骨骼');mesh.weights[index]=next;
}
function morph(mesh,expressionId,center,radius,delta){
 if(!pair(center,-4096,4096)||!pair(delta,-512,512)||!finite(radius,1,1024))throw Error('表情笔刷参数无效');
 const deltas=[];for(let i=0;i<mesh.vertices.length/2;i++){const distance=Math.hypot(mesh.vertices[i*2]-center[0],mesh.vertices[i*2+1]-center[1]);if(distance>=radius)continue;const f=(1-distance/radius)**2;deltas.push(i,delta[0]*f,delta[1]*f);}
 const current=mesh.morphs.find(m=>m.expressionId===expressionId);if(current)current.deltas=deltas;else mesh.morphs.push({expressionId,deltas});
}
return {validate,solve,expressions,geometry,grid,weights,morph,checksum,ikTracks,expressionTracks};
});
