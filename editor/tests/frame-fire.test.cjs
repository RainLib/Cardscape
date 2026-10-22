const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../dist/renderer/frame-model.js'),K=require('../dist/renderer/finish-catalog.js'),R=require('../dist/renderer/runtime-model.js'),M=require('../dist/renderer/cosmetics-model.js'),W=require('../dist/renderer/workshop-model.js');

test('fire palettes publish and reload as independent rigid frames with original component layers and regions',()=>{
 for(const id of ['fire','fire-blue','fire-gold','fire-green','fire-pink','fire-purple','fire-rainbow','fire-red','fire-white']){
  const d=R.ensure({schema:'card-atelier/1',id:'fire-card',name:'Fire card',layers:[{id:'frame',kind:'frame',visible:true},{id:'background',kind:'background',visible:true}],masks:{}});
  d.componentScenes={frame:{schema:'card-frame/1',style:F.resolve(d),document:{layers:[{id:'ornament',name:'Ornament'}],emissionRegions:[{id:'edge',shape:'perimeter'}]}}};
  K.apply(d,'frame-'+id);F.validate(d);
  assert.equal(d.frameStyle.animation,'none');assert.equal(d.frameStyle.finish,id==='fire-rainbow'?'fire-iridescent':'fire');
  assert.equal(F.hasAura(d.frameStyle),true);assert.equal(d.componentScenes.frame.document.layers[0].id,'ornament');assert.equal(d.componentScenes.frame.document.emissionRegions[0].id,'edge');
  const published=W.publish(W.create(d,'fire-workshop','a'),{kind:'frame',id:'fire-frame',name:'Fire',value:W.capture(d,'frame')});
  const bound=W.bind(published.workshop,'frame',published.resourceId,published.version,['a']),reopened=W.resolve(JSON.parse(JSON.stringify(bound)));
  assert.deepEqual(reopened.frameStyle,d.frameStyle);assert.equal(M.dynamic(reopened),true);
  reopened.frameStyle.animationSpeed=0;assert.equal(M.dynamic(reopened),false);
  const geometry=F.geometry(d.frameStyle);
  assert.equal(geometry.aura.indices.length,48);
  const rimZ=geometry.rim.positions.filter((_,i)=>i%3===2);assert.equal(Math.max(...rimZ)-Math.min(...rimZ),3/1024);
  assert.equal(F.finishes.indexOf('fire'),10);assert.equal(F.finishes.indexOf('fire-iridescent'),11);
 }
});
