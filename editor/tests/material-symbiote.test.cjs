const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../renderer/component-model.js'),K=require('../renderer/finish-catalog.js'),M=require('../renderer/cosmetics-model.js'),R=require('../renderer/runtime-model.js'),W=require('../renderer/workshop-model.js');
const S=require('../renderer/spatial-model.js');

test('replacement chooses one original backdrop without editing the layered artwork or covering a baseplate',()=>{
 const d={layers:[{id:'near',kind:'image',visible:true,spatial:{role:'near'}},{id:'base',kind:'image',role:'baseplate',visible:true},{id:'hidden',kind:'background',visible:false},{id:'mid',kind:'image',spatial:{role:'mid'}},{id:'original',kind:'background',visible:true}]};
 const before=JSON.stringify(d),m=K.value('material-symbiote-black');
 assert.equal(S.replacementBackground(d,m),'original');assert.equal(JSON.stringify(d),before);
 for(const value of [{...m,backgroundMode:'overlay'},{...m,enabled:false},{...m,style:'ink'},{...m,target:'back'}])assert.equal(S.replacementBackground(d,value),null);
 assert.equal(S.replacementBackground({layers:[{id:'near',kind:'image',spatial:{role:'near'}},{id:'far',kind:'image',spatial:{role:'far'}}]},m),'far');
 assert.equal(S.replacementBackground({layers:[{id:'mid',kind:'image',spatial:{role:'mid'}}]},m),'mid');
 assert.equal(S.replacementBackground({layers:[{id:'base',kind:'image',role:'baseplate'}]},m),null);
});

test('six connective finishes retain original art, independent back and editable images through publication',()=>{
 for(const color of ['black','red','purple','green','white','yellow']){
  const d=R.ensure({schema:'card-atelier/1',id:'web-card',name:'Web',layers:[{id:'bg',kind:'background',src:'original-art',visible:true},{id:'hero',kind:'foreground',visible:true}],masks:{}});
  d.backScene={material:C.material({enabled:true,style:'gold'}),document:{layers:[{id:'back-art'}]}};
  d.componentScenes={material:{document:{layers:[{id:'etching',src:'original-transparent-layer'}]}}};
  const layers=JSON.stringify(d.layers),back=JSON.stringify(d.backScene);
  K.apply(d,'material-symbiote-'+color);C.validateMaterial(d.material);
  assert.equal(d.material.style,'symbiote');assert.equal(d.material.target,'background');assert.equal(d.material.backgroundMode,'replace');
  assert.equal(JSON.stringify(d.layers),layers);assert.equal(JSON.stringify(d.backScene),back);
  assert.equal(d.componentScenes.material.document.layers[0].id,'etching');
  const published=W.publish(W.create(d,'web-workshop','card'),{kind:'material',name:color,value:W.capture(d,'material')});
  const bound=W.bind(published.workshop,'material',published.resourceId,published.version,['card']);
  const reopened=W.resolve(JSON.parse(JSON.stringify(bound)));
  assert.deepEqual(reopened.material,d.material);assert.equal(M.dynamic(reopened),true);
  reopened.material.speed=0;assert.equal(M.dynamic(reopened),false);
 }
 assert.equal(C.materialStyles.indexOf('bananas'),23);assert.equal(C.materialStyles.indexOf('symbiote'),24);
 const green=K.value('material-symbiote-green'),white=K.value('material-symbiote-white');
 assert.ok(parseInt(green.color.slice(1,3),16)>parseInt(green.color.slice(3,5),16));
 assert.ok(parseInt(green.accent.slice(3,5),16)>parseInt(green.accent.slice(1,3),16));
 assert.ok(parseInt(white.color.slice(1,3),16)>parseInt(white.accent.slice(1,3),16));
});
