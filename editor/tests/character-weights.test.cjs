const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../renderer/character-weight-tools.js'),C=require('../renderer/character-animation-model.js'),A=C.advanced;
const {fixture}=require('./fixtures/character-animation.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
function normalized(ws){assert.ok(ws.length>0&&ws.length<=4);near(ws.reduce((s,w)=>s+w.weight,0),1);assert.ok(ws.every(w=>w.weight>0&&w.weight<=1));}
test('weight replacement preserves locked values, limits four influences, and cannot erase the sole influence',()=>{
 const old=[{boneId:'locked',weight:.3},{boneId:'b',weight:.2},{boneId:'c',weight:.2},{boneId:'d',weight:.3}],locked=new Set(['locked']);
 const next=T.setWeight(old,'new',.4,locked);normalized(next);near(next.find(w=>w.boneId==='locked').weight,.3);near(next.find(w=>w.boneId==='new').weight,.4);assert.equal(next.length,4);assert.deepEqual(old[0],{boneId:'locked',weight:.3});
 assert.deepEqual(T.setWeight(old,'locked',1,locked),old);assert.deepEqual(T.setWeight([{boneId:'only',weight:1}],'only',0),[{boneId:'only',weight:1}]);
 const capped=T.setWeight(old,'new',1,locked);near(capped.find(w=>w.boneId==='new').weight,.7);normalized(capped);
});
test('painting has radial falloff and supports add, remove and replace without touching UV or locked weights',()=>{
 const m=A.grid('body','root',4,4),uv=[...m.uv],source=[...m.vertices];m.weights=m.weights.map(()=>[{boneId:'root',weight:.2},{boneId:'shoulder',weight:.8}]);
 const settings={radius:350,strength:1,value:.7,mode:'replace',locked:new Set()};T.paint(m,'shoulder',[{x:512,y:768}],settings);near(m.weights[12].find(w=>w.boneId==='shoulder').weight,.7);near(m.weights[0].find(w=>w.boneId==='shoulder').weight,.8);
 T.paint(m,'elbow',[{x:512,y:768}],{...settings,mode:'add',strength:.5,locked:new Set(['root'])});near(m.weights[12].find(w=>w.boneId==='root').weight,.3);near(m.weights[12].find(w=>w.boneId==='elbow').weight,.5);
 T.paint(m,'elbow',[{x:512,y:768}],{...settings,mode:'remove',strength:.25});near(m.weights[12].find(w=>w.boneId==='elbow').weight,.25);m.weights.forEach(normalized);assert.deepEqual(m.uv,uv);assert.deepEqual(m.vertices,source);
});
test('smoothing uses triangle connectivity and does not bridge disconnected mesh islands',()=>{
 const m={vertices:[0,0,1,0,0,1,0,0,1,0,0,1],triangles:[0,1,2,3,4,5],weights:[[{boneId:'a',weight:1}],[{boneId:'b',weight:1}],[{boneId:'b',weight:1}],[{boneId:'c',weight:1}],[{boneId:'c',weight:1}],[{boneId:'c',weight:1}]]};T.smooth(m);near(m.weights[0].find(w=>w.boneId==='a').weight,1/3);assert.deepEqual(m.weights[3],[{boneId:'c',weight:1}]);m.weights.forEach(normalized);
});
test('automatic binding respects chosen influences and locks, with registered layer transforms',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',3,3);layer.x=30;layer.y=-20;layer.scale=1.2;layer.rotation=25;
 T.auto(doc,layer,m,['shoulder','elbow']);assert.ok(m.weights.every(ws=>ws.every(w=>['shoulder','elbow'].includes(w.boneId))));m.weights.forEach(normalized);
 m.weights[0]=[{boneId:'root',weight:.35},{boneId:'shoulder',weight:.65}];T.auto(doc,layer,m,['shoulder','elbow'],new Set(['root']));near(m.weights[0].find(w=>w.boneId==='root').weight,.35);m.weights.forEach(normalized);
 const p=T.vertexPoints(doc,layer,m)[5],source=T.sourcePoint(doc,layer,p);near(source.x,m.vertices[10]);near(source.y,m.vertices[11]);
});
test('dragging joints converts through a rotated and scaled parent, and bone picking has a screen-space radius',()=>{
 const doc=fixture();doc.characterRig.bones[0].rotation=32;doc.characterRig.bones[0].scale=1.4;C.validate(doc);T.moveJoint(doc,'elbow',{x:700,y:410});const p=C.point(C.compile(doc.characterRig).rest.get('elbow'),0,0);near(p.x,700);near(p.y,410);assert.equal(T.pick(doc,{x:709,y:410},1),'elbow');assert.equal(T.pick(doc,{x:709,y:410},2),null);
 T.moveJoint(doc,'root',{x:500,y:600});near(doc.characterRig.bones[0].x,500);near(doc.characterRig.bones[0].y,600);
});
test('painted weights change actual bone deformation and remain valid after native import',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',2,2);doc.characterRig.meshes=[m];const pose=C.sample(doc,doc.actions[2],doc.actions[2].duration/2,{seek:true}),base=require('../renderer/runtime-model.js').placement(doc,layer),before=C.geometry(doc,layer,pose,base).positions;
 T.paint(m,'elbow',[{x:512,y:768}],{radius:100,strength:1,mode:'replace',value:1});C.validate(doc);const after=C.geometry(doc,layer,pose,base).positions;assert.ok(Math.hypot(after[12]-before[12],after[13]-before[13])>.01);m.weights.forEach(normalized);
 const I=require('../renderer/character-animation-import.js'),next=I.createRegistry().convert('cardscape',I.pack(doc),doc);assert.deepEqual(next.characterRig.meshes[0].weights,m.weights);
});
