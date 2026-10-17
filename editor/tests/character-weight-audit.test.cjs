const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../renderer/character-animation-model.js'),{fixture}=require('./fixtures/character-animation.cjs');
function run(document,layerId){const output=[],context=vm.createContext({structuredClone,Float32Array,Float64Array,Uint8Array,Map,Set,Math,postMessage:value=>output.push(value)});context.self=context;context.importScripts=(...names)=>names.forEach(name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer',name),'utf8'),context,{filename:name}));vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/character-weight-audit-worker.js'),'utf8'),context);context.onmessage({data:{document,layerId}});return output.at(-1);}
test('weight audit worker checks all actions on the affected mesh without editing weights or keys',()=>{
 const d=fixture();d.characterRig.meshes=[C.advanced.grid('body','root',1,1)];d.actions=[{id:'move',name:'Move',event:'trigger',duration:1,loop:false,motion:1,emission:1,bend:0,boneTracks:{elbow:{rotation:[{at:0,value:0},{at:1,value:150}]}}}];C.validate(d);
 const before=structuredClone(d);assert.equal(run(d,'body').reports[0].ok,true);assert.deepEqual(d,before);
 d.characterRig.meshes[0].weights[0]=[{boneId:'elbow',weight:1}];const painted=structuredClone(d),result=run(d,'body');assert.ok(result.reports[0].flippedTriangles>0);assert.equal(result.reports[0].firstIssue.layerId,'body');assert.deepEqual(d,painted);
 const other={...structuredClone(d.characterRig.meshes[0]),layerId:'weapon'};d.characterRig.meshes.push(other);d.characterRig.meshes[0].weights[0]=[{boneId:'root',weight:1}];assert.equal(run(d,'body').reports[0].ok,true);assert.equal(run(d,'weapon').reports[0].ok,false);assert.match(run(d,'missing').error,/没有蒙皮网格/);
});
test('a late weight audit cannot replace feedback for a newer document revision',()=>{
 const d=fixture(),layer=d.layers.find(l=>l.id==='body');d.characterRig.meshes=[C.advanced.grid('body','root',1,1)];let state={document:d,documentToken:'one',revision:1,layer,busy:false},worker;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',hidden:false,after(){}});return nodes.get(id);};
 const window={cardEditorHost:{state:()=>state},CardCharacterMeshReduction:{snapshot:structuredClone}},document={getElementById:node,createElement:()=>node('root')};
 const context=vm.createContext({window,document,Worker:class{constructor(){worker=this;}terminate(){this.terminated=true;}postMessage(value){this.input=value;}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/character-weight-audit.js'),'utf8'),context);
 window.atelierWeightAudit.run('body');state={...state,revision:2};worker.onmessage({data:{reports:[{ok:true,samples:61}]}});assert.equal(node('root').dataset.report,undefined);assert.match(node('weight-audit-status').textContent,/旧检查结果已丢弃/);assert.equal(worker.terminated,true);
 window.atelierWeightAudit.run('body');worker.onmessage({data:{reports:[{ok:true,samples:61}]}});assert.match(node('weight-audit-status').textContent,/61 个采样/);assert.equal(node('root').dataset.ok,'true');state={...state,layer:{id:'weapon'}};window.atelierWeightAudit.refresh();assert.equal(node('root').dataset.report,undefined);assert.equal(node('weight-audit-locate').hidden,true);
});
function controller(){
 const d=fixture(),layer=d.layers.find(l=>l.id==='body');d.characterRig.meshes=[C.advanced.grid('body','root',1,1)];let state={document:d,documentToken:'one',revision:1,layer,busy:false},worker,applied=0;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},textContent:'',hidden:false,after(){}});return nodes.get(id);};
 const window={cardEditorHost:{state:()=>state},CardCharacterMeshReduction:{snapshot:structuredClone},atelierCharacterAdvanced:{weightLocks:()=>[],applyWeightRepair(){applied++;state={...state,document:structuredClone(d),revision:state.revision+1};}}},document={getElementById:node,createElement:()=>node('root')};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/character-weight-audit.js'),'utf8'),vm.createContext({window,document,Worker:class{constructor(){worker=this;}terminate(){this.terminated=true;}postMessage(value){this.input=value;}}}));
 const reports=[{ok:false,name:'Move',actionId:'move',samples:61,flippedTriangles:1,compressedTriangles:0,firstIssue:{seconds:.5,vertices:[0,1,2]}}];window.atelierWeightAudit.run('body');worker.onmessage({data:{reports}});
 return {node,window,get worker(){return worker;},get applied(){return applied;},setState:fn=>{state=fn(state);},start:()=>node('weight-audit-repair').onclick()};
}
const repaired={changed:true,vertices:[0],maxWeightDelta:.02,after:[{ok:true,samples:61}],reason:'全部动作采样通过'};
test('cancelled or stale weight repair never commits a late candidate',()=>{
 const c=controller();c.start();assert.equal(c.worker.input.mode,'repair');const worker=c.worker;c.node('weight-audit-cancel').onclick();worker.onmessage({data:{result:repaired}});assert.equal(c.applied,0);assert.equal(worker.terminated,true);assert.match(c.node('weight-audit-status').textContent,/已取消/);
 c.start();c.setState(s=>({...s,revision:2}));c.worker.onmessage({data:{result:repaired}});assert.equal(c.applied,0);assert.match(c.node('weight-audit-status').textContent,/旧检查结果已丢弃/);
});
test('a verified weight repair commits once, exposes comparison, and invalidates it after undo',()=>{
 const c=controller();c.start();const worker=c.worker;worker.onmessage({data:{progress:{stage:'verify'}}});assert.equal(c.applied,0);worker.onmessage({data:{result:repaired}});worker.onmessage({data:{result:repaired}});assert.equal(c.applied,1);assert.equal(c.node('weight-audit-compare').hidden,false);assert.equal(c.node('root').dataset.ok,'true');
 c.setState(s=>({...s,revision:s.revision+1}));c.window.atelierWeightAudit.refresh();assert.equal(c.node('weight-audit-compare').hidden,true);assert.equal(c.node('root').dataset.repair,undefined);
});
test('locked layers and unsuccessful weight repair leave the document unchanged',()=>{
 const c=controller();c.start();c.worker.onmessage({data:{result:{changed:false,reason:'无法安全修正'}}});assert.equal(c.applied,0);assert.equal(c.node('weight-audit-compare').hidden,true);c.setState(s=>({...s,layer:{...s.layer,locked:true}}));c.window.atelierWeightAudit.refresh();assert.equal(c.node('weight-audit-repair').disabled,true);c.start();assert.equal(c.applied,0);
});
