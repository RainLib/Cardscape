const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../dist/renderer/component-model.js'),K=require('../dist/renderer/finish-catalog.js'),M=require('../dist/renderer/cosmetics-model.js'),F=require('../dist/renderer/frame-model.js'),R=require('../dist/renderer/runtime-model.js'),W=require('../dist/renderer/workshop-model.js');
const context={layers:[],frameStyle:F.defaults},p=M.particlePreset('krackle');
function sample(t,config=p,doc=context){const output=new Float64Array(256*7),count=C.sampleInto(config,t,doc,0,output);return {count,output};}
test('Krackle births stagger within near-rim clusters without visible rebirth jumps',()=>{
 const a=sample(.7),b=sample(.701);let near=0,variation=0;
 for(let i=0;i<p.count;i++){const k=i*7;if(a.output[k+4]>.02&&b.output[k+4]>.02)assert.ok(Math.hypot(a.output[k]-b.output[k],a.output[k+1]-b.output[k+1])<.0001);if(i%3&&Math.hypot(a.output[k]-a.output[k-7],a.output[k+1]-a.output[k-6])<.08)near++;if(i%3&&Math.abs(a.output[k+4]-a.output[k-3])>.02)variation++;}
 assert.ok(near>35);assert.ok(variation>15);
 for(let group=0;group<p.count/3;group++){
  const h=x=>{const v=Math.sin((x+1)*127.1+p.seed*311.7)*43758.5453;return v-Math.floor(v);},birth=(1-h(group+201))*p.lifetime;
  for(const t of [birth-1e-6,birth+1e-6])for(let child=0;child<3;child++)assert.ok(sample(t).output[(group*3+child)*7+4]<1e-7);
 }
 for(const t of [0,.7,100,86400]){const {count,output}=sample(t);assert.equal(count,72);assert.deepEqual(output,sample(t).output);for(let i=0;i<count;i++){const k=i*7;assert.ok(output[k+3]>0&&output[k+3]<p.size*1.3);assert.ok(output[k+4]>=0&&output[k+4]<=1);assert.ok(Math.abs(output[k])<.5+p.radius*1.1);assert.ok(Math.abs(output[k+1])<.75+p.radius*1.1);}}
});
test('observed distressed palettes and prism replacement remain independent reusable editable components',()=>{
 for(const color of ['grey','purple','pink','orange','gold','green']){
  const id='frame-distressed-'+color,d=R.ensure({schema:'card-atelier/1',id:'detail',name:'Detail',layers:[{id:'frame',kind:'frame',visible:true},{id:'art',kind:'background',src:'original'}],masks:{motion:'original-mask'}});d.backScene={document:{layers:[{id:'back',src:'independent'}]}};
  const original=JSON.stringify({layers:d.layers,masks:d.masks,back:d.backScene});K.apply(d,id);F.validate(d);assert.equal(d.frameStyle.finish,'distressed');assert.equal(d.frameStyle.animation,'none');assert.equal(F.hasAura(d.frameStyle),false);
  assert.equal(JSON.stringify({layers:d.layers,masks:d.masks,back:d.backScene}),original);
  const published=W.publish(W.create(d,'details','a'),{kind:'frame',name:id,value:W.capture(d,'frame')});const reopened=W.resolve(JSON.parse(JSON.stringify(W.bind(published.workshop,'frame',published.resourceId,published.version,['a']))));assert.deepEqual(reopened.frameStyle,d.frameStyle);
 }
 const v=K.value('material-prism-replacement');assert.equal(v.style,'prism');assert.equal(v.backgroundMode,'replace');assert.equal(v.strength,1);assert.equal(K.value('material-prism').backgroundMode,'overlay');
 assert.equal(F.finishes.indexOf('distressed'),4);assert.equal(C.materialStyles.indexOf('prism'),3);assert.equal(C.particleVisuals.indexOf('krackle'),2);
 const shader=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_surface.gdshader'),'utf8'),block=s=>s.slice(s.indexOf('float finishHash('),s.indexOf('\nvec4 rimAura('));assert.equal(block(shader),block(R.fragment));
});
