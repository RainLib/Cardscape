const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../dist/renderer/component-model.js'),K=require('../dist/renderer/finish-catalog.js'),F=require('../dist/renderer/frame-model.js'),M=require('../dist/renderer/cosmetics-model.js'),B=require('../dist/renderer/particle-batch.js'),R=require('../dist/renderer/runtime-model.js');
const original=K.entries.filter(e=>e.referenceStatus==='original'),frame=K.value('original-frame-f01').style,p=K.value('original-particles-p01');
const doc={layers:[{id:'backdrop',kind:'background',src:'original.png'},{id:'hero',kind:'foreground',src:'hero.png'}],masks:{motion:'keep'},frameStyle:frame};
function distance(path,x,y){return Math.min(...path.segments.map(s=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.size*s.size)));return Math.hypot(x-s.x-s.dx*t,y-s.y-s.dy*t);}));}
test('original recipes retain source assets and retain separate implementations',()=>{
 assert.equal(original.length,5);assert.deepEqual(original.filter(e=>!e.artwork).map(e=>e.designId),['F01','F02','P01','B05']);
 for(const e of original.filter(e=>!e.artwork)){const d=structuredClone(doc),before=JSON.stringify([d.layers,d.masks]);K.apply(d,e.id);assert.equal(JSON.stringify([d.layers,d.masks]),before);const restored=JSON.parse(JSON.stringify(d));if(e.kind==='material')C.validateMaterial(restored.material);if(e.kind==='particles')C.validateParticles(restored.particles);if(e.kind==='frame')F.validate(restored.frameStyle);}
});
test('original frame remains flat, uses the existing rigid mesh and drives its own clock',()=>{
 for(const style of [frame,K.value('original-frame-f02').style]){
  assert.deepEqual(F.geometry(style).rim.positions,F.geometry({...style,finish:'metal'}).rim.positions);
  assert.equal(F.hasAura(style),false);assert.equal(M.dynamic({layers:[{kind:'frame'}],frameStyle:style},true),true);
  assert.equal(M.dynamic({layers:[{kind:'frame'}],frameStyle:{...style,animationSpeed:0}},true),false);
 }
});
test('authored originals detach edited frame bindings while independent back previews leave them intact',async()=>{
 const W=require('../dist/renderer/workshop-model.js'),storage=require('../dist/electron/workshop-storage.cjs');
 let w=W.create(R.ensure({...structuredClone(doc),name:'Original test',back:'data:image/png;base64,AAAA'}),'original-workshop','original-card');
 const published=W.publish(w,{id:'shared-frame',kind:'frame',value:{schema:'card-frame/1',style:F.resolve({})}});
 w=W.bind(published.workshop,'frame',published.resourceId,published.version,['original-card']);
 const sharedBefore=JSON.stringify(w.resources),d=W.resolve(w);K.apply(d,'original-frame-f02');
 const before=JSON.stringify(d);W.preview(d,w,{back:'default'});assert.equal(JSON.stringify(d),before);
 const saved=storage.unpack(await W.encode(W.commit(w,d)));
 assert.equal(W.card(saved).bindings.frame,undefined);assert.equal(W.resolve(saved).frameStyle.finish,'twin-aurora');
 assert.equal(JSON.stringify(saved.resources),sharedBefore);assert.equal(W.resolve(w).frameStyle.finish,'metal');
});
test('starcore emission stays at the chosen cut-corner contour and honors quality limits',()=>{
 const path=C.haloPath(C.emitter(p.emitter),frame.corner/1024,p.radius);
 for(const t of [0,.7,100,86400])for(const limit of [0,8,48,128]){
  const data=new Float64Array(256*7),n=C.sampleInto(p,t,doc,0,data,limit);assert.equal(n,Math.min(p.count,limit));
  for(let i=0;i<n;i++){const k=i*7;assert.ok(distance(path,data[k],data[k+1])<=p.radius*1.02);assert.ok(data[k+4]>=0&&data[k+4]<=p.opacity);assert.ok(data[k+3]>0&&data[k+3]<p.size);}
 }
 assert.equal(C.sampleInto(p,1,doc,Math.PI,new Float64Array(256*7)),0);
 const data=new Float64Array(256*7);C.sampleInto(p,.7,doc,0,data);const sizes=Array.from({length:32},(_,i)=>data[i*7+3]);assert.ok(Math.max(...sizes)>Math.min(...sizes)*3);
});
test('cluster relocation is invisible and continuous through the birth boundary',()=>{
 const data=new Float64Array(256*7);C.sampleInto(p,0,doc,0,data);const seed=data[6];
 // Locate a cycle boundary numerically; the samples on either side must be invisible.
 let boundary=0,prior=C.sample(p,0,doc)[0];
 for(let t=.01;t<=p.lifetime+.01;t+=.01){const q=C.sample(p,t,doc)[0];if(Math.hypot(q.x-prior.x,q.y-prior.y)>.1){boundary=t;break;}prior=q;}
 assert.ok(boundary>0,`birth not found ${seed}`);
 let lo=boundary-.01,hi=boundary;const origin=C.sample(p,lo,doc)[0];
 for(let i=0;i<30;i++){const mid=(lo+hi)/2,q=C.sample(p,mid,doc)[0];if(Math.hypot(q.x-origin.x,q.y-origin.y)>.1)hi=mid;else lo=mid;}
 for(const t of [lo,hi])for(const q of C.sample(p,t,doc).slice(0,4))assert.ok(q.alpha<1e-8);
 const a=C.sample(p,.7,doc),b=C.sample(p,.701,doc);for(let i=0;i<a.length;i++)if(a[i].alpha>.01&&b[i].alpha>.01)assert.ok(Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y)<.001);
});
test('shared quad format and shader functions remain consistent in Godot',()=>{
 assert.deepEqual(B.visuals,C.particleVisuals);assert.equal(B.stride,10);
 const gd=fs.readFileSync('../sdk/godot/addons/cardscape/card_particles.gdshader','utf8'),star=B.fragment.slice(B.fragment.indexOf('// Original P01:'),B.fragment.indexOf('\nvoid main(){',B.fragment.indexOf('// Original P01:')));assert.ok(gd.includes(star));
 const surface=fs.readFileSync('../sdk/godot/addons/cardscape/card_surface.gdshader','utf8'),a=R.fragment.indexOf('// Shared procedural'),b=R.fragment.indexOf('\nvoid ',a);assert.ok(surface.includes(R.fragment.slice(a,b)));
 const globals=new Set([...surface.matchAll(/(?:uniform|varying)\s+\w+\s+(\w+)/g)].map(m=>m[1]));
 for(const local of R.fragment.slice(a,b).matchAll(/(?:vec[234]|float|bool)\s+(\w+)\s*[=;,]/g))assert.ok(!globals.has(local[1]),`shared local shadows Godot global ${local[1]}`);
});
