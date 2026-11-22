const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const C=require('../dist/renderer/character-animation-model.js'),R=require('../dist/renderer/runtime-model.js'),I=require('../dist/renderer/character-animation-import.js'),{fixture}=require('./fixtures/character-animation.cjs');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('a registered depth map samples the mesh UVs and ignores transparent neighbors', () => {
  const mesh = { uv: [0, 0, 0.5, 0, 1, 0, 0.5, 0.5, 1, 1] };
  const map = { width: 2, height: 2, data: new Uint8ClampedArray([
    0, 0, 0, 255, 255, 255, 255, 255,
    255, 255, 255, 0, 255, 255, 255, 0,
  ]) };
  const depths = C.advanced.depthsFromMap(mesh, map, 0.2);
  for (const [i, value] of [0, 0.1, 0.2, 0.1, 0].entries()) close(depths[i], value);
  assert.throws(() => C.advanced.depthsFromMap(mesh, map, 0.251), /浮雕幅度/);
  assert.throws(() => C.advanced.depthsFromMap(mesh, { ...map, width: 3 }, 0.2), /深度图/);
});
test('rest compensation preserves placed artwork, pivot, source coordinates and independent depth',()=>{
 const doc=fixture();doc.characterRig.bones[0].rotation=25;doc.characterRig.bones[0].scale=1.2;doc.layers[0].pivot={u:.3,v:.4};doc.layers[0].rotation=12;doc.layers[0].scale=.8;C.validate(doc);const before=structuredClone(doc),pose=C.sample(doc,null,0);
 for(const l of doc.layers){const base=R.placement(doc,l),posed=R.placement(doc,l,pose);for(const k of ['x','y','scale','rotation'])close(posed[k],base[k]);}assert.deepEqual(doc,before);
});
test('parent motion moves its children and a hand-bound weapon by the same rigid transform',()=>{
 const doc=fixture(),action={duration:1,loop:false,boneTracks:{shoulder:{rotation:[{at:0,value:90}]},elbow:{rotation:[{at:0,value:-30}]}}},pose=C.sample(doc,action,0),elbow=pose.bones.get('elbow');const p=C.point(elbow.world,0,0);close(p.x,616);close(p.y,800);close(elbow.rotation,Math.PI/3);assert.equal(pose.layers.get('weapon'),pose.layers.get('forearm'));assert.equal(pose.layers.has('background'),false);
});
test('all frames are deterministic, seek reaches a loop endpoint and opacity follows parents',()=>{
 const doc=fixture(),a={duration:2,loop:true,boneTracks:{root:{opacity:[{at:0,value:.5}]},elbow:{x:[{at:0,value:0},{at:1,value:40}],opacity:[{at:0,value:.4}]}}};close(C.sample(doc,a,2).bones.get('elbow').world[4],776);close(C.sample(doc,a,2,{seek:true}).bones.get('elbow').world[4],816);close(C.sample(doc,a,1).layers.get('weapon').opacity,.2);assert.deepEqual(C.sample(doc,a,1),C.sample(doc,a,5));
});
test('unbound split cloth follows the master while an explicit part binding wins',()=>{
 const doc=fixture();doc.layers.push({id:'cloth',kind:'image',splitSourceId:'body'});const pose=C.sample(doc,doc.actions[0],1);assert.equal(pose.layers.get('cloth'),pose.layers.get('body'));doc.characterRig.bindings.push({layerId:'cloth',boneId:'elbow'});C.validate(doc);assert.equal(C.sample(doc,doc.actions[0],1).layers.get('cloth').rotation,C.sample(doc,doc.actions[0],1).bones.get('elbow').rotation);
});
test('invalid hierarchy, unsupported deformation, missing bindings and malformed tracks are rejected',()=>{
 for(const edit of [d=>d.characterRig.bones[0].parentId='elbow',d=>d.characterRig.bones[1].parentId='missing',d=>d.characterRig.bones.push({...d.characterRig.bones[0]}),d=>d.characterRig.bindings[0].layerId='missing',d=>d.characterRig.bindings.push({...d.characterRig.bindings[0]}),d=>d.characterRig.bones[0].scale=0,d=>d.characterRig.bones[0].scaleX=2,d=>d.characterRig.bones[0].id='__proto__',d=>d.characterRig.bones[0].x=Infinity,d=>d.actions[0].boneTracks.unknown={x:[{at:0,value:0}]},d=>d.actions[0].boneTracks.elbow.rotation=[{at:.5,value:20},{at:.4,value:30}],d=>d.actions[0].boneTracks.elbow.ik=[{at:0,value:1}],d=>d.actions[0].boneTracks.elbow.rotation=Array.from({length:65},(_,i)=>({at:i/64,value:0}))]){const d=fixture();edit(d);assert.throws(()=>R.validate(d));}
 const d=fixture();delete d.characterRig;assert.throws(()=>R.validate(d),/绑定/);
});
test('creating a child uses source coordinates, bind respects locks and removal cleans all clips',()=>{
 const doc=fixture();C.addBone(doc,{id:'tip',name:'手',parentId:'elbow',x:880,y:640});C.validate(doc);close(doc.characterRig.bones.at(-1).x,104);close(doc.characterRig.bones.at(-1).y,0);doc.layers[0].locked=true;assert.throws(()=>C.bind(doc,'weapon','tip'),/解锁/);doc.layers[0].locked=false;C.bind(doc,'weapon','tip');doc.actions[0]=C.keyframe(doc.actions[0],'tip','rotation',1,45);assert.throws(()=>C.removeBone(doc,'root'),/子关节/);C.removeBone(doc,'tip');R.validate(doc);assert.equal(doc.actions[0].boneTracks.tip,undefined);assert.equal(doc.characterRig.bindings.some(b=>b.boneId==='tip'),false);
});
test('draft recording preserves other targets and rejects an overfull track before mutation',()=>{
 const a=fixture().actions[0],before=structuredClone(a),next=C.keyframe(a,'shoulder','rotation',2,30,'smooth');assert.deepEqual(a,before);assert.deepEqual(next.boneTracks.elbow,a.boneTracks.elbow);assert.equal(next.boneTracks.shoulder.rotation.length,3);const full=structuredClone(a);full.boneTracks.elbow.rotation=Array.from({length:64},(_,i)=>({at:i/63,value:0}));assert.throws(()=>C.keyframe(full,'elbow','rotation',.123,10),/64/);
});
test('native import normalizes into the self-owned contract and refuses unavailable or lossy adapters',()=>{
 const d=fixture(),registry=I.createRegistry(),pack=I.pack(d),next=registry.convert('cardscape',JSON.stringify(pack),d);assert.deepEqual(next.characterRig,d.characterRig);assert.deepEqual(next.actions,d.actions);assert.throws(()=>registry.convert('spine',{},d),/尚未安装/);registry.register({id:'future-fixture',convert:()=>({...pack,unsupported:['mesh skinning']})});assert.throws(()=>registry.convert('future-fixture',{},d),/不支持/);assert.throws(()=>registry.register({id:'cardscape',convert:()=>pack}),/重复/);pack.actions[0].duration=0;assert.throws(()=>registry.convert('cardscape',pack,d),/动作/);
});
test('real save, reopen, portable player and Godot export retain the same rig and samples',async()=>{
 const {createServices}=require('../dist/electron/services.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'native-character-')),svc=createServices({runtimeDir:dir});try{const d=fixture();await svc.invoke('save',{document:d});const opened=(await svc.invoke('open')).document;assert.deepEqual(opened.characterRig,d.characterRig);assert.deepEqual(C.sample(opened,opened.actions[0],1),C.sample(d,d.actions[0],1));const result=await svc.invoke('export',{document:d,front:d.layers.find(l=>l.id==='body').src}),manifest=JSON.parse(await fs.readFile(path.join(result.directory,'manifest.json'),'utf8'));assert.deepEqual(manifest.characterRig,d.characterRig);assert.deepEqual(manifest.actions,d.actions);assert.ok((await fs.stat(path.join(result.directory,'character-animation-model.js'))).size>0);assert.match(await fs.readFile(path.join(result.directory,'godot/library.tres'),'utf8'),/card-character-rig/);assert.ok((await fs.stat(path.join(result.directory,'godot/addons/cardscape/character_animation.gd'))).size>0);}finally{svc.close();await fs.rm(dir,{recursive:true,force:true});}
});
