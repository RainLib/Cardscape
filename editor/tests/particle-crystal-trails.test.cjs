const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),B=require('../renderer/particle-batch.js');
const doc={layers:[]};
function frame(p,time,age=time,budget=256,context=doc,facing=0){const out=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(p,time,context,facing,out,visuals,budget,age);return {count,samples:out.slice(0,count*7),visuals:visuals.slice(0,count)};}
test('Neon Trails runs once, becomes empty, replays deterministically and retains the shared budget',()=>{
 const p=M.particlePreset('trails');C.validateParticles(p);assert.equal(p.reveal.only,true);assert.equal(p.palette,'rainbow');
 for(const budget of [0,1,8,48,128,256]){for(const time of [0,.4,1.599]){const f=frame(p,time,time,budget);assert.ok(f.count<=budget);assert.ok(f.visuals.every(v=>v===3));}assert.equal(frame(p,1.6,1.6,budget).count,0);}
 for(const time of [5,100,86400])assert.equal(frame(p,time).count,0);
 assert.deepEqual(frame(p,100,0),frame(p,0));assert.equal(frame(p,.4,.4,256,doc,Math.PI).count,0);
 const disabled=C.particles({...p,reveal:{...p.reveal,enabled:false}});assert.equal(frame(disabled,10).count,28);
});
test('Gold Diamonds reveals real crystals, then retains bounded independent idle crystals',()=>{
 const p=M.particlePreset('diamond');C.validateParticles(p);assert.equal(p.blend,'normal');assert.equal(p.reveal.visual,'source');assert.equal(p.reveal.stretch,1);
 const birth=frame(p,0),idle=frame(p,.7);assert.equal(birth.count,88);assert.equal(birth.visuals.filter(v=>v===7).length,56);assert.equal(idle.count,32);assert.ok(idle.visuals.every(v=>v===-1));
 const vertices=new Float32Array(256*6*B.stride);assert.equal(B.pack(birth.samples,birth.count,vertices,birth.visuals),88*6*10);
 for(const time of [0,.3,1.1,10,100,86400]){const f=frame(p,time,3);assert.equal(f.count,32);for(let i=0;i<f.count;i++){const a=f.samples.slice(i*7,i*7+7);assert.ok(a.every(Number.isFinite));if(a[4]>.01){assert.ok(Math.abs(a[0])<.5+p.radius*3.5);assert.ok(Math.abs(a[1])<.75+p.radius*3.5);}assert.ok(a[3]>0&&a[3]<.08);}}
 assert.equal(B.visuals.indexOf('diamond'),7);assert.equal(B.visuals.indexOf('sprite'),9);assert.equal(vertices.byteLength,61440);
});
test('new reveal settings round trip, preserve old behavior, validate AI input and follow named sources',()=>{
 const commands=require('../renderer/editor-commands.js'),old=C.particles({enabled:true,reveal:{enabled:true}});assert.equal(old.reveal.visual,'streak');assert.equal(old.reveal.only,false);
 for(const value of [{visual:'gem'},{only:'true'}])assert.throws(()=>C.validateParticles(C.particles({...old,reveal:{...old.reveal,...value}})));
 assert.doesNotThrow(()=>commands.validate([{op:'particles',reveal:{enabled:true,visual:'source',only:true}}]));
 const p=M.particlePreset('diamond'),restored=C.particles(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored,p);
 const region={id:'ring',name:'Ring',shape:'ellipse',u:.3,v:.4,width:.2,height:.25,direction:'up',angle:0,layerId:''};
 const named=C.particles({...p,emitter:{target:'card',regionId:'ring',side:'front'}});assert.equal(frame(named,.2,.2,128,doc).count,0);assert.ok(frame(named,.2,.2,128,{...doc,emissionRegions:[region]}).count>0);
});
test('Neon Trails has delayed short rays, measured fast and slow populations, and a bounded tail',()=>{
 const p=M.particlePreset('trails'),early=frame(p,.15),middle=frame(p,1),later=frame(p,1.2);
 const speed={early:[],late:[]};
 for(let i=0;i<middle.count;i++){
  const k=i*7,late=i%5===0;
  assert.equal(early.samples[k+4]===0,late);
  assert.ok(middle.samples[k+4]>0);
  if(late)assert.ok(middle.samples[k+3]*2*.22<.015); // Late white core below 3.33px at the 222px reference card width.
  const a=middle.samples[k+5];
  const end=f=>f.samples[k]*Math.cos(a)+f.samples[k+1]*Math.sin(a)+f.samples[k+3]*p.reveal.stretch;
  const velocity=(end(later)-end(middle))/.2;
  speed[late?'late':'early'].push(velocity);
  assert.ok(velocity>0);
 }
 for(const [cohort,bounds] of Object.entries({early:[1.3,1.7],late:[.4,.7]})){
  speed[cohort].sort((a,b)=>a-b);const median=speed[cohort][Math.floor(speed[cohort].length/2)];
  assert.ok(median>bounds[0]&&median<bounds[1],`${cohort}: ${median}`);
 }
 for(const stagger of [0,.8])for(const age of [0,.05,.7,1.599]){
  const value=C.particles({...p,reveal:{...p.reveal,stagger}}),f=frame(value,age);
  assert.ok(f.samples.every(Number.isFinite));
  for(let i=0;i<f.count;i++)assert.ok(f.samples[i*7+3]>0&&f.samples[i*7+4]>=0&&f.samples[i*7+4]<=1);
 }
 const old=C.particles({...p,reveal:{...p.reveal,profile:'burst',travel:.5}});
 assert.deepEqual(frame(old,.4),frame(C.particles({...old,reveal:{...old.reveal,stagger:.8}}),.4));
 const commands=require('../renderer/editor-commands.js');
 assert.doesNotThrow(()=>commands.validate([{op:'particles',reveal:{enabled:true,profile:'trails',stagger:.5,travel:2.6}}]));
 for(const bad of [{profile:'random'},{stagger:-.1},{stagger:.81},{travel:3.01}])assert.throws(()=>C.validateParticles(C.particles({...p,reveal:{...p.reveal,...bad}})));
 assert.deepEqual(C.particles(JSON.parse(JSON.stringify(p))),p);
});
test('projected crystal and white-core trail functions are shared by WebGL and Godot',()=>{
 const gd=fs.readFileSync(require.resolve('../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8');
 const shared=s=>s.slice(s.indexOf('// Shared faceted gold crystal:'),s.indexOf('// Shared bubble surface:'));
 assert.equal(shared(B.fragment),shared(gd));assert.match(shared(B.fragment),/cross\(b-a,c-a\)/);assert.match(shared(B.fragment),/i<4/);assert.match(B.fragment,/particleSpeed\*20/);assert.match(gd,/particle_speed\*20/);
 assert.equal(B.stride,10);assert.equal(B.visuals.length,26);
});
