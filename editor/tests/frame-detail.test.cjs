const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../renderer/frame-model.js'),K=require('../renderer/finish-catalog.js'),R=require('../renderer/runtime-model.js'),M=require('../renderer/cosmetics-model.js'),W=require('../renderer/workshop-model.js');

test('detail rims retain component art, independent back and rigid geometry through publish, apply and reopen',()=>{
 for(const [id,finish] of [['chains-silver','chains'],['glyphs-green','glyphs'],['refraction-rainbow','refraction'],['overloaded','overloaded'],['pax-2025','pax'],['brains','brains'],['candy-halloween','candy-halloween'],['halloween-stickers','halloween-stickers']]){
  const d=R.ensure({schema:'card-atelier/1',id:'detail-card',name:'Detail',layers:[{id:'frame',kind:'frame',visible:true},{id:'hero',kind:'foreground',src:'original-hero',visible:true}],masks:{}});
  d.componentScenes={frame:{style:F.resolve(d),document:{layers:[{id:'custom-frame',src:'original-frame-art'}],emissionRegions:[{id:'edge'}]}}};d.backScene={document:{layers:[{id:'back',src:'independent-back'}]}};
  const source=JSON.stringify(d.layers),back=JSON.stringify(d.backScene);K.apply(d,'frame-'+id);F.validate(d);
  assert.equal(d.frameStyle.finish,finish);assert.equal(d.frameStyle.animation,'none');assert.equal(d.frameStyle.shape,'rect');assert.equal(d.frameStyle.corner,48);
  assert.equal(JSON.stringify(d.layers),source);assert.equal(JSON.stringify(d.backScene),back);assert.equal(d.componentScenes.frame.document.layers[0].src,'original-frame-art');
  assert.equal(F.hasAura(d.frameStyle),!['chains','brains'].includes(finish));
  const pub=W.publish(W.create(d,'detail-workshop','card'),{kind:'frame',name:id,value:W.capture(d,'frame')});
  const reopened=W.resolve(JSON.parse(JSON.stringify(W.bind(pub.workshop,'frame',pub.resourceId,pub.version,['card']))));assert.deepEqual(reopened.frameStyle,d.frameStyle);
  const g=F.geometry(d.frameStyle);assert.equal(g.rim.indices.length,144);assert.equal(g.aura.indices.length,48);assert.equal(new Set(g.rim.positions.filter((_,i)=>i%3===2)).size,2);
 }
 assert.deepEqual(F.finishes.slice(10,16),['fire','fire-iridescent','chains','glyphs','refraction','overloaded']);
 assert.equal(F.finishes.indexOf('candy'),6);assert.equal(F.finishes.indexOf('candy-halloween'),23);
});

test('animated detail reflections request playback; zero speed freezes every detail rim',()=>{
 for(const id of ['chains-silver','glyphs-green','refraction-rainbow','overloaded','pax-2025','brains','candy-halloween','halloween-stickers']){
  const d=R.ensure({schema:'card-atelier/1',layers:[{id:'frame',kind:'frame',visible:true}],masks:{}});d.effects={cape:false,flow:false};d.armor={enabled:false};K.apply(d,'frame-'+id);
  assert.equal(M.dynamic(d),['glyphs-green','refraction-rainbow','pax-2025','brains','halloween-stickers'].includes(id));d.frameStyle.animationSpeed=0;assert.equal(M.dynamic(d),false);
 }
});

test('large border decorations reserve the same uncropped footprint in raster and 3D geometry',()=>{
 const Raster=require('../renderer/frame-raster.js'),style=K.value('frame-halloween-stickers').style;
 assert.deepEqual(Raster.bounds(style),{x:-144,y:-144,width:1312,height:1824});
 const geometry=F.geometry(style),left=Math.min(...geometry.aura.positions.filter((_,i)=>i%3===0));
 assert.equal(left,-.5-144/1024);
 assert.equal(F.auraPadding(K.value('frame-candy-halloween').style),88);
 assert.equal(F.finishes.indexOf('halloween-stickers'),24);
});
