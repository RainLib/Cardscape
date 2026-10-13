const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../renderer/component-model.js'),K=require('../renderer/finish-catalog.js'),M=require('../renderer/cosmetics-model.js'),R=require('../renderer/runtime-model.js'),W=require('../renderer/workshop-model.js');

test('reference surfaces preserve editable art, nested images, independent back and emission binding through publication',()=>{
 for(const id of ['material-circuits','material-frosted','material-wakandanglass','material-purple-rays','material-rainbow-rays']){
  const d=R.ensure({schema:'card-atelier/1',id:'surface-card',name:'Surface',layers:[{id:'background',kind:'background',visible:true,src:'original-bg'},{id:'hero',kind:'foreground',visible:true,src:'original-hero'}],masks:{}});
  d.backScene={material:C.material({enabled:true,style:'gold'}),document:{layers:[{id:'back-art'}]}};
  d.componentScenes={material:{document:{layers:[{id:'grain',src:'editable-material-image'}]}}};
  d.particles=C.particles({enabled:true,emitter:{target:'layer',layerId:'hero',regionId:'weapon'}});
  const original=JSON.stringify(d.layers),back=JSON.stringify(d.backScene),particles=JSON.stringify(d.particles);
  K.apply(d,id);C.validateMaterial(d.material);
  assert.equal(JSON.stringify(d.layers),original);assert.equal(JSON.stringify(d.backScene),back);assert.equal(JSON.stringify(d.particles),particles);
  assert.equal(d.componentScenes.material.document.layers[0].id,'grain');
  const pub=W.publish(W.create(d,'surface-workshop','card'),{kind:'material',name:id,value:W.capture(d,'material')});
  const resolved=W.resolve(JSON.parse(JSON.stringify(W.bind(pub.workshop,'material',pub.resourceId,pub.version,['card']))));
  assert.deepEqual(resolved.material,d.material);assert.equal(M.dynamic(resolved),true);
 }
 assert.equal(K.value('material-circuits').target,'background');assert.equal(K.value('material-circuits').backgroundMode,'overlay');
 assert.equal(K.value('material-wakandanglass').target,'artwork');assert.equal(K.value('material-frosted').backgroundMode,'overlay');
 for(const id of ['material-rays','material-purple-rays','material-rainbow-rays'])assert.equal(K.value(id).backgroundMode,'replace');
 assert.equal(C.materialStyles.indexOf('symbiote'),24);assert.deepEqual(C.materialStyles.slice(25,28),['circuits','frosted','raysrainbow']);
});

test('three web rims keep rigid cut corners and no outer aura while retaining custom source scenes',()=>{
 const F=require('../renderer/frame-model.js');
 for(const id of ['frame-web-black','frame-web-red','frame-web-pink']){
  const v=K.value(id,{style:F.defaults,document:{layers:[{id:'custom-frame',src:'frame-art'}]}});
  F.validate({frameStyle:v.style});assert.equal(v.style.finish,'web');assert.equal(v.style.shape,'rect');assert.equal(v.style.corner,48);
  assert.equal(F.hasAura(v.style),false);assert.equal(v.document.layers[0].src,'frame-art');
 }
});
