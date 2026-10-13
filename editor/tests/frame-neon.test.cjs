const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const K=require('../renderer/finish-catalog.js'),F=require('../renderer/frame-model.js'),C=require('../renderer/cosmetics-model.js'),R=require('../renderer/runtime-model.js'),U=require('../renderer/preview-update-model.js'),W=require('../renderer/workshop-model.js');
test('neon recipes preserve authored card data and need no additional textures or mesh topology',()=>{
 for(const color of ['blue','red','white','yellow','green','purple']){
  const old=R.ensure({id:'card',schema:'card-atelier/1',previewMode:'authored',width:1024,height:1536,layers:[{id:'hero',kind:'foreground',src:'hero.png'},{id:'frame',kind:'frame'}],masks:{emission:'mask.png'}}),d=structuredClone(old);
  K.apply(d,'frame-neon-'+color);F.validate(d);assert.equal(d.frameStyle.width,42);assert.equal(d.frameStyle.animation,'none');assert.equal(C.dynamic({...d,effects:{cape:false,flow:false},armor:{enabled:false}},true),false);
  assert.deepEqual(d.layers,old.layers);assert.deepEqual(d.masks,old.masks);assert.deepEqual(U.plan(old,d).images,[]);assert.equal(U.plan(old,d).geometry,false);
  const geometry=F.geometry(d.frameStyle),original=F.geometry({...d.frameStyle,finish:'metal'});
  for(const part of ['rim','rear','sides'])assert.deepEqual(geometry[part],original[part]);assert.equal(geometry.aura.indices.length/3,16);
  assert.equal(F.auraInset(d.frameStyle),98);assert.equal(F.auraInset({...d.frameStyle,finish:'metal'}),0);
  assert.equal(geometry.aura.positions.length,original.aura.positions.length);assert.deepEqual(geometry.aura.indices,original.aura.indices);
 }
});
test('a saved custom neon width stays unchanged across publish, bind and reopen',()=>{
 const style={...K.find('frame-neon-blue').recipe,width:27},d=R.ensure({id:'card',schema:'card-atelier/1',name:'Custom neon',layers:[{id:'frame',kind:'frame'}],masks:{},frameStyle:style});
 const published=W.publish(W.create(d,'workshop','card'),{id:'frame',kind:'frame',name:'Neon custom',value:W.capture(d,'frame')});
 const bound=W.bind(published.workshop,'frame',published.resourceId,published.version,['card']);
 assert.deepEqual(W.resolve(JSON.parse(JSON.stringify(bound))).frameStyle,style);
});
test('WebGL and Godot share the calibrated procedural functions',()=>{
 const a=R.fragment.indexOf('// Shared procedural finish'),b=R.fragment.indexOf('\nvoid ',a),shared=R.fragment.slice(a,b);
 assert.ok(fs.readFileSync('../sdk/godot/addons/cardscape/card_surface.gdshader','utf8').includes(shared));
});
