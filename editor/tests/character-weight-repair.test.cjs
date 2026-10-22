const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../dist/renderer/character-weight-repair.js'),A=require('../dist/renderer/character-motion-audit.js'),C=require('../dist/renderer/character-animation-model.js');
const real=require('./fixtures/spine-4.3.26-weight-fault.json');
function apply(d,r){const copy=structuredClone(d);copy.characterRig.meshes[0].weights=r.weights;return copy;}
test('real Spine 4.3.26 local repair fixes every clip while preserving exact FFD, binds and topology',()=>{
 const d=structuredClone(real),before=structuredClone(d),r=W.repair(d,'sp-img2');assert.deepEqual(d,before);assert.ok(r.changed);assert.equal(r.before.find(a=>a.name==='walk').flippedTriangles,20);assert.equal(r.before.find(a=>a.name==='walk').compressedTriangles,3);assert.ok(r.after.every(a=>a.ok));assert.equal(r.after.reduce((n,a)=>n+a.samples,0),214);assert.ok(r.vertices.length<=3);assert.ok(r.maxWeightDelta<.04);
 const next=apply(d,r);for(const i of r.vertices)assert.ok(r.region.includes(i));for(let i=0;i<r.weights.length;i++){if(!r.vertices.includes(i))assert.deepEqual(r.weights[i],d.characterRig.meshes[0].weights[i]);assert.ok(r.weights[i].length<=4);assert.ok(Math.abs(r.weights[i].reduce((n,w)=>n+w.weight,0)-1)<1e-10);}
 const stripped=structuredClone(next);stripped.characterRig.meshes[0].weights=d.characterRig.meshes[0].weights;assert.deepEqual(stripped,d);
 // Verify with the actual Float32 runtime at twice the authoring check frequency.
 assert.ok(next.actions.every(a=>A.audit(next,a,{fps:120}).ok));const again=W.repair(next,'sp-img2');assert.equal(again.changed,false);assert.deepEqual(again.weights,r.weights);
});
test('repair respects exact locked weights and refuses candidates if every influence is locked',()=>{
 const d=structuredClone(real),r=W.repair(d,'sp-img2',{locked:['sp-b19']});if(r.changed){for(let i=0;i<r.weights.length;i++)assert.equal(r.weights[i].find(w=>w.boneId==='sp-b19')?.weight,d.characterRig.meshes[0].weights[i].find(w=>w.boneId==='sp-b19')?.weight);assert.ok(r.after.every(a=>a.ok));}
 const all=d.characterRig.bones.map(b=>b.id),blocked=W.repair(d,'sp-img2',{locked:all});assert.equal(blocked.changed,false);assert.deepEqual(blocked.weights,d.characterRig.meshes[0].weights);assert.match(blocked.reason,/工程未修改/);
 d.layers[0].locked=true;assert.throws(()=>W.repair(d,'sp-img2'),/解锁/);
});
test('repair only touches fault triangles, including a disconnected island with one-bone weights',()=>{
 const {fixture}=require('./fixtures/character-animation.cjs'),d=fixture(),m=C.advanced.grid('body','root',2,2);d.characterRig.meshes=[m];d.actions=[{id:'a',name:'a',event:'trigger',duration:1,loop:false,motion:1,emission:1,bend:0,boneTracks:{elbow:{rotation:[{at:0,value:0},{at:1,value:150}]}}}];m.weights[0]=[{boneId:'elbow',weight:1}];
 const n=m.weights.length;m.vertices.push(1100,0,1200,0,1100,100);m.uv.push(0,0,1,0,0,1);m.weights.push(...Array.from({length:3},()=>[{boneId:'elbow',weight:1}]));m.triangles.push(n,n+2,n+1);
 const r=W.repair(d,'body');assert.ok(r.changed);assert.ok(r.after.every(a=>a.ok));assert.deepEqual(r.weights.slice(n),m.weights.slice(n));C.validate(apply(d,r));
});
