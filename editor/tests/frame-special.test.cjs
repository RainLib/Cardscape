const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../dist/renderer/frame-model.js'),K=require('../dist/renderer/finish-catalog.js'),R=require('../dist/renderer/runtime-model.js'),W=require('../dist/renderer/workshop-model.js'),M=require('../dist/renderer/cosmetics-model.js');
test('special rim finishes preserve legacy indices, rigid geometry and independent component edits',()=>{
 const legacy=['flat','metal','glow','cosmic','distressed','web','candy','ice','snow','wrapping','fire','fire-iridescent','chains','glyphs','refraction','overloaded'];
 assert.deepEqual(F.finishes.slice(0,16),legacy);
 for(const id of ['frame-distressed-copper','frame-distressed-rainbow','frame-neon-nights']){
  const d=R.ensure({schema:'card-atelier/1',id:'special',name:'Special',layers:[{id:'frame',kind:'frame',visible:true},{id:'art',kind:'background',src:'art-original'}],masks:{motion:'mask-original'}});d.backScene={document:{layers:[{id:'back',src:'back-original'}]}};
  const before=JSON.stringify({layers:d.layers,masks:d.masks,back:d.backScene});K.apply(d,id);F.validate(d);
  assert.equal(JSON.stringify({layers:d.layers,masks:d.masks,back:d.backScene}),before);
  assert.equal(d.frameStyle.shape,'rect');assert.equal(d.frameStyle.animation,'none');
  assert.equal(F.hasAura(d.frameStyle),id==='frame-neon-nights');const onlyFrame=R.ensure({schema:'card-atelier/1',layers:[{id:'f',kind:'frame',visible:true}],masks:{}});onlyFrame.effects={cape:false,flow:false};onlyFrame.armor={enabled:false};K.apply(onlyFrame,id);assert.equal(M.dynamic(onlyFrame),id==='frame-neon-nights');onlyFrame.frameStyle.animationSpeed=0;assert.equal(M.dynamic(onlyFrame),false);
  assert.deepEqual(F.geometry(d.frameStyle),F.geometry({...d.frameStyle,finish:'metal'}));
  const publication=W.publish(W.create(d,'specials','a'),{kind:'frame',name:id,value:W.capture(d,'frame')});
  const reopened=W.resolve(JSON.parse(JSON.stringify(W.bind(publication.workshop,'frame',publication.resourceId,publication.version,['a']))));assert.deepEqual(reopened.frameStyle,d.frameStyle);
 }
 const gd=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_surface.gdshader'),'utf8');const shared=s=>s.slice(s.indexOf('float finishHash('),s.indexOf('\nvec4 rimAura('));assert.equal(shared(gd),shared(R.fragment));
});
