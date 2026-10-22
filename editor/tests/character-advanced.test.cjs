const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/renderer/character-animation-model.js'),A=C.advanced;
const near=(a,b,eps=.0001)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const action=()=>({id:'move',name:'动作',event:'trigger',duration:2,loop:false,motion:1,emission:1,bend:0});
function chain(){return {layers:[{id:'arm',kind:'image',visible:true}],actions:[action()],characterRig:{schema:C.schema,bones:[{id:'root',name:'肩',parentId:null,x:200,y:300,rotation:0,scale:1},{id:'tip',name:'肘',parentId:'root',x:100,y:0,rotation:0,scale:1}],bindings:[{layerId:'arm',boneId:'tip'}],constraints:[{id:'aim',name:'瞄准',rootId:'root',tipId:'tip',end:[80,0],target:[330,340],bend:1,mix:1}],meshes:[],expressions:[]}};}
test('two-link IK reaches the target, preserves both link lengths and supports both bend sides',()=>{
 for(const bend of [-1,1]){const doc=chain();doc.characterRig.constraints[0].bend=bend;C.validate(doc);const pose=C.sample(doc,doc.actions[0],0),a=pose.bones.get('root').world,b=pose.bones.get('tip').world,end=C.point(b,80,0);near(end.x,330);near(end.y,340);near(Math.hypot(b[4]-a[4],b[5]-a[5]),100);near(Math.hypot(end.x-b[4],end.y-b[5]),80);near(pose.ik.get('aim').error,0);assert.equal(pose.ik.get('aim').reachable,true);}
});
test('unreachable and origin IK targets clamp without stretching or NaN',()=>{
 for(const target of [[200,300],[2000,2000],[200.000001,300.000001]]){const doc=chain();doc.characterRig.constraints[0].target=target;C.validate(doc);const pose=C.sample(doc,doc.actions[0],0),tip=pose.bones.get('tip').world,root=pose.bones.get('root').world,end=C.point(tip,80,0);assert.ok([...pose.bones.values()].every(b=>b.matrix.every(Number.isFinite)));near(Math.hypot(tip[4]-root[4],tip[5]-root[5]),100);near(Math.hypot(end.x-tip[4],end.y-tip[5]),80);assert.equal(pose.ik.get('aim').reachable,false);}
});
test('animated IK targets and mix blend from FK, with rotated/scaled parents and nonhorizontal endpoints',()=>{
 const doc=chain(),rig=doc.characterRig;rig.bones.unshift({id:'parent',name:'人物',parentId:null,x:10,y:20,rotation:25,scale:1.2});rig.bones[1].parentId='parent';rig.bones[2].rotation=20;rig.constraints[0].end=[60,30];rig.constraints[0].target=[260,430];
 let a=C.controlKeyframe(doc,doc.actions[0],'ik','aim','x',0,240,'linear');a=C.controlKeyframe(doc,a,'ik','aim','x',2,300,'linear');doc.actions[0]=a;C.validate(doc);
 const p=C.sample(doc,a,1,{seek:true});near(p.ik.get('aim').actual[0],270);near(p.ik.get('aim').actual[1],430);
 rig.constraints[0].mix=0;const fk=C.sample(doc,a,1);const before=structuredClone(doc);assert.notDeepEqual(fk.bones.get('tip').matrix,p.bones.get('tip').matrix);assert.deepEqual(doc,before);
});
test('skinning preserves registered rest placement and fixed UV, then bends weighted vertices',()=>{
 const doc=chain();doc.characterRig.constraints=[];const mesh=A.grid('arm','root',2,2);doc.characterRig.meshes=[mesh];A.weights(mesh,4,'tip',.5);doc.actions[0].boneTracks={tip:{rotation:[{at:0,value:0},{at:1,value:90}]}};C.validate(doc);
 const base={x:20,y:-40,rotation:.2,scale:.9},rest=C.geometry(doc,doc.layers[0],C.sample(doc,doc.actions[0],0),base),end=C.geometry(doc,doc.layers[0],C.sample(doc,doc.actions[0],2),base);
 near(rest.positions[0],-.5);near(rest.positions[1],.75);near(rest.positions[4*3],0);assert.notEqual(end.positions[4*3],rest.positions[4*3]);assert.equal(end.uv,mesh.uv);assert.equal(end.indices,mesh.triangles);assert.equal(mesh.vertices[8],512);near(mesh.weights[4].reduce((s,w)=>s+w.weight,0),1);
});
test('facial controls combine independently before skinning and animate with holds and smooth curves',()=>{
 const doc=chain();doc.characterRig.constraints=[];doc.characterRig.expressions=[{id:'blink',name:'左眼',value:0},{id:'smile',name:'嘴角',value:.25}];const mesh=A.grid('arm','root',2,2);doc.characterRig.meshes=[mesh];mesh.morphs=[{expressionId:'blink',deltas:[4,0,20]},{expressionId:'smile',deltas:[4,12,-8]}];
 let a=C.controlKeyframe(doc,doc.actions[0],'expression','blink','value',0,1,'hold');a=C.controlKeyframe(doc,a,'expression','blink','value',2,0);doc.actions[0]=a;C.validate(doc);
 const pose=C.sample(doc,a,1),geometry=C.geometry(doc,doc.layers[0],pose,{x:0,y:0,rotation:0,scale:1});near(geometry.positions[12],3/1024);near(geometry.positions[13],-18/1024);near(pose.expressions.get('blink'),1);near(C.sample(doc,a,2).expressions.get('blink'),0);
});
test('malformed weights, mesh topology, morphs and conflicting IK fail before authoring commits',()=>{
 for(const mutate of [d=>d.characterRig.meshes[0].weights[0]=[{boneId:'root',weight:.2}],d=>d.characterRig.meshes[0].weights[0]=[{boneId:'missing',weight:1}],d=>d.characterRig.meshes[0].triangles[0]=999,d=>d.characterRig.meshes[0].vertices[0]=NaN,d=>d.characterRig.meshes[0].morphs=[{expressionId:'missing',deltas:[0,1,2]}],d=>d.characterRig.constraints.push({...d.characterRig.constraints[0],id:'other'}),d=>d.characterRig.constraints[0].end=[0,0],d=>d.actions[0].expressionTracks={missing:{value:[{at:0,value:1}]}}]){const doc=chain();doc.characterRig.meshes=[A.grid('arm','root',2,2)];mutate(doc);assert.throws(()=>C.validate(doc));}
});
test('removal cannot leave dangling skin weights or IK constraints',()=>{const doc=chain();assert.throws(()=>C.removeBone(doc,'tip'));doc.characterRig.constraints=[];doc.characterRig.meshes=[A.grid('arm','tip',2,2)];assert.throws(()=>C.removeBone(doc,'tip'));});
test('IK accepts independent branches but rejects nested chains that invalidate an earlier solve',()=>{
 const doc=chain();doc.characterRig.bones.push({id:'other',name:'另一肩',parentId:null,x:500,y:300,rotation:0,scale:1},{id:'other-tip',name:'另一肘',parentId:'other',x:100,y:0,rotation:0,scale:1});doc.characterRig.constraints.push({id:'other-aim',name:'另一目标',rootId:'other',tipId:'other-tip',end:[80,0],target:[630,340],bend:-1,mix:1});C.validate(doc);
 doc.characterRig.bones.find(b=>b.id==='other').parentId='tip';assert.throws(()=>C.validate(doc),/独立分支/);
});
test('native adapters round-trip advanced controls and clear replaced advanced tracks',()=>{
 const I=require('../dist/renderer/character-animation-import.js'),doc=require('./fixtures/character-animation.cjs').fixture();doc.characterRig.expressions=[{id:'smile',name:'微笑',value:0}];doc.actions[0].expressionTracks={smile:{value:[{at:0,value:0},{at:1,value:1}]}};C.validate(doc);const packed=I.pack(doc);assert.ok(packed.actions.some(a=>a.expressionTracks));const old=structuredClone(doc);old.actions.push({...action(),id:'retained',expressionTracks:{smile:{value:[{at:0,value:1}]}}});const next=I.createRegistry().convert('cardscape',packed,old);assert.equal(next.actions.find(a=>a.id==='retained').expressionTracks,undefined);assert.deepEqual(next.characterRig,doc.characterRig);
});
