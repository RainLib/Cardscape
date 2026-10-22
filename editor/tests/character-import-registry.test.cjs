const test=require('node:test'),assert=require('node:assert/strict');
const registry=require('../dist/renderer/character-import-registry.js'),runtime=require('../dist/renderer/runtime-model.js');
const {fixture}=require('./fixtures/character-animation.cjs');
function source(){return {skeleton:{spine:'4.3.26',width:100,height:80,vendor:{keep:true}},bones:[{name:'root'}],slots:[{name:'body',bone:'root',attachment:'image'}],skins:[{name:'default',attachments:{body:{image:{width:100,height:80}}}}],animations:{move:{bones:{root:{rotate:[{value:0},{time:1,value:30}]}}}}};}

test('strict registry structurally decodes JSON, preserves extensions and validates the completed document once',()=>{
 const value=source(),d=fixture(),before=structuredClone(d);let calls=0;
 assert.equal(registry.decodeSpine(value),value);assert.equal(value.skeleton.vendor.keep,true);
 const imports=registry.createRegistry(next=>{calls++;runtime.validate(next);});
 const next=imports.convert('spine-json',JSON.stringify(value),d,{layerMap:{body:'body'}});
 assert.equal(calls,1);assert.equal(next.characterRig.bones[0].id,'sp-b0');assert.ok(next.actions.some(a=>a.id==='sp-action0'));assert.deepEqual(d,before);
});
test('damaged nested Spine coordinates, attachments and timelines are rejected before an adapter can be applied',()=>{
 const cases=[s=>{s.bones[0].x='1';},s=>{s.skins[0].attachments.body.image.vertices=['0'];},s=>{s.animations.move.bones.root.rotate[1].time='1';},s=>{s.skeleton.width='100';}];
 for(const corrupt of cases){const value=source();corrupt(value);assert.throws(()=>registry.decodeSpine(value),/格式无效/);}
 const legacy=source();legacy.skins={default:legacy.skins[0].attachments};assert.equal(registry.decodeSpine(legacy),legacy);legacy.skins.default.body.image.uvs=['0'];assert.throws(()=>registry.decodeSpine(legacy),/格式无效/);
});
test('validator failure or malformed adapter metadata leaves the current rig, actions and layers untouched',()=>{
 const d=fixture(),before=structuredClone(d),archive=registry.pack(d),imports=registry.createRegistry(()=>{throw Error('Rejected complete document');});
 assert.throws(()=>imports.convert('cardscape',archive,d),/Rejected complete document/);assert.deepEqual(d,before);
 for(const extra of [{actions:[{id:1}]},{unsupported:12},{layerOrder:['missing']},{newLayers:[{id:1}]}]){
  const custom=registry.createRegistry(runtime.validate);custom.register({id:'invalid',convert:()=>({...archive,...extra})});assert.throws(()=>custom.convert('invalid',{},d),/无效|顺序/);assert.deepEqual(d,before);
 }
});
