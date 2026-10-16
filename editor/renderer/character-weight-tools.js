/* Editor-only geometry and normalized weight tools. No runtime dependency. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./character-animation-model.js'));else root.CardCharacterWeightTools=factory(root.CardCharacterAnimation);})(typeof window==='object'?window:globalThis,C=>{
'use strict';
const palette=['#65d9c1','#ff9a62','#76adff','#ce92f5','#f2cf68','#ef83b2','#8cc96a','#84cadc'];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const color=i=>palette[i%palette.length];
function segments(doc){const rig=C.compile(doc.characterRig);return rig.order.map(b=>{const p=C.point(rig.rest.get(b.id),0,0),parent=b.parentId?C.point(rig.rest.get(b.parentId),0,0):p;return {id:b.id,p,parent};});}
function distance(p,a,b){const x=b.x-a.x,y=b.y-a.y,t=clamp(((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y||1));return Math.hypot(p.x-a.x-x*t,p.y-a.y-y*t);}
function pick(doc,p,zoom){const all=segments(doc);let best=null,distanceBest=12/zoom;for(const b of all){const d=Math.hypot(p.x-b.p.x,p.y-b.p.y);if(d<distanceBest){best=b.id;distanceBest=d;}}if(best)return best;for(const b of all){const d=distance(p,b.parent,b.p);if(d<8/zoom){best=b.id;break;}}return best;}
function moveJoint(doc,id,p){const b=doc.characterRig.bones.find(b=>b.id===id),rest=C.compile(doc.characterRig).rest,parent=b.parentId?rest.get(b.parentId):C.matrix(0,0);const q=C.point(C.inverse(parent),p.x,p.y);b.x=q.x;b.y=q.y;C.validate(doc);}
function sourceMatrix(doc,layer){const p=windowOrRuntime().placement(doc,layer);return C.matrix(512+p.x,768+p.y,p.rotation*180/Math.PI,p.scale);}
function windowOrRuntime(){return typeof window==='object'?window.CardRuntime:require('./runtime-model.js');}
function vertexPoints(doc,layer,mesh){const mat=sourceMatrix(doc,layer);return mesh.weights.map((_,i)=>C.point(mat,mesh.vertices[i*2]-512,mesh.vertices[i*2+1]-768));}
function sourcePoint(doc,layer,p){const q=C.point(C.inverse(sourceMatrix(doc,layer)),p.x,p.y);return {x:q.x+512,y:q.y+768};}
function normalized(values,locked=new Set(),old=[]){
 const fixed=old.filter(w=>locked.has(w.boneId)&&w.weight>0),remaining=clamp(1-fixed.reduce((s,w)=>s+w.weight,0));
 let free=values.filter(w=>!locked.has(w.boneId)&&w.weight>1e-8).sort((a,b)=>b.weight-a.weight).slice(0,4-fixed.length),sum=free.reduce((s,w)=>s+w.weight,0);
 if(!sum&&remaining>1e-8)return old.map(w=>({...w}));
 return [...fixed.map(w=>({...w})),...free.map(w=>({boneId:w.boneId,weight:w.weight/sum*remaining}))].filter(w=>w.weight>1e-8);
}
function setWeight(old,boneId,value,locked=new Set()){
 if(locked.has(boneId))return old.map(w=>({...w}));const fixed=old.filter(w=>locked.has(w.boneId)),available=clamp(1-fixed.reduce((s,w)=>s+w.weight,0));value=clamp(value,0,available);
 let others=old.filter(w=>w.boneId!==boneId&&!locked.has(w.boneId)&&w.weight>1e-8).sort((a,b)=>b.weight-a.weight).slice(0,4-fixed.length-(value>1e-8?1:0)),sum=others.reduce((s,w)=>s+w.weight,0);
 if(!sum&&value<available-1e-8)return old.map(w=>({...w}));
 const next=[...fixed.map(w=>({...w})),...others.map(w=>({boneId:w.boneId,weight:w.weight/sum*(available-value)}))];if(value>1e-8)next.push({boneId,weight:value});return next.filter(w=>w.weight>1e-8);
}
function neighbors(mesh){const result=mesh.weights.map(()=>new Set());for(let j=0;j<mesh.triangles.length;j+=3){const tri=mesh.triangles.slice(j,j+3);for(const a of tri)for(const b of tri)if(a!==b)result[a].add(b);}return result;}
function paint(mesh,boneId,centers,{radius=60,strength=.2,value=1,mode='add',locked=new Set(),adjacency=neighbors(mesh)}={}){
 if(!Number.isFinite(radius)||radius<=0||!['add','remove','replace','smooth'].includes(mode)||![strength,value].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('权重笔刷参数无效');
 let changed=0;for(const p of centers){const previous=mesh.weights.map(ws=>ws.map(w=>({...w})));for(let i=0;i<mesh.weights.length;i++){
  const d=Math.hypot(mesh.vertices[i*2]-p.x,mesh.vertices[i*2+1]-p.y);if(d>=radius)continue;const f=(1-d/radius)**2*strength,old=previous[i].find(w=>w.boneId===boneId)?.weight||0;
  const adjacent=[...adjacency[i]],average=adjacent.length?adjacent.reduce((s,j)=>s+(previous[j].find(w=>w.boneId===boneId)?.weight||0),0)/adjacent.length:old;
  const target=mode==='replace'?old+(value-old)*f:mode==='smooth'?old+(average-old)*f:clamp(old+(mode==='remove'?-f:f));
  const next=setWeight(previous[i],boneId,target,locked);if(JSON.stringify(next)!==JSON.stringify(mesh.weights[i])){mesh.weights[i]=next;changed++;}
 }}return changed;
}
function auto(doc,layer,mesh,boneIds,locked=new Set()){
 const bones=segments(doc).filter(b=>boneIds.includes(b.id));if(!bones.length)throw Error('请选择参与初绑的骨骼');const points=vertexPoints(doc,layer,mesh);
 for(let i=0;i<mesh.weights.length;i++){const values=bones.map(b=>({boneId:b.id,weight:1/(distance(points[i],b.parent,b.p)**2+256)}));mesh.weights[i]=normalized(values,locked,mesh.weights[i]);}
}
function smooth(mesh,locked=new Set()){
 const adjacent=neighbors(mesh),old=mesh.weights.map(ws=>ws.map(w=>({...w})));
 for(let i=0;i<old.length;i++){const values=new Map();for(const j of [i,...adjacent[i]])for(const w of old[j])values.set(w.boneId,(values.get(w.boneId)||0)+w.weight);mesh.weights[i]=normalized([...values].map(([boneId,weight])=>({boneId,weight})),locked,old[i]);}
}
return {color,segments,distance,pick,moveJoint,vertexPoints,sourcePoint,normalized,setWeight,neighbors,paint,auto,smooth};
});
