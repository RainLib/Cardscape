const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),B=require('../renderer/particle-batch.js'),K=require('../renderer/finish-catalog.js'),W=require('../renderer/workshop-model.js'),R=require('../renderer/runtime-model.js'),F=require('../renderer/frame-model.js');
function samples(p,time,doc={layers:[]},budget=256,facing=0){const data=new Float64Array(256*7);return {data,count:C.sampleInto(p,time,doc,facing,data,budget)};}
// Locate observable size resets without duplicating the sampler's lifetime seeds.
function births(p){
 const found=[],step=p.lifetime/1024;let previous=samples(p,0);
 for(let n=1;n<=1230&&found.filter(Number.isFinite).length<previous.count;n++){
  const time=n*step,current=samples(p,time);
  for(let i=0;i<current.count;i++)if(found[i]===undefined&&current.data[i*7+3]<previous.data[i*7+3]*.7){
   let lo=time-step,hi=time;const threshold=previous.data[i*7+3]*.7;
   for(let k=0;k<30;k++){const mid=(lo+hi)/2;if(samples(p,mid).data[i*7+3]<threshold)hi=mid;else lo=mid;}
   found[i]=(lo+hi)/2;
  }
  previous=current;
 }
 assert.equal(found.filter(Number.isFinite).length,previous.count,'every instance completes an observable cycle');return found;
}
test('Adamantium is an editable foreground emblem; reusable publication preserves source layers and masks',()=>{
 const d=R.ensure({id:'hero',schema:'card-atelier/1',layers:[{id:'art',kind:'background',src:'data:image/png;base64,YQ==',visible:true}],masks:{emission:'retain'},cosmetics:M.config()});
 const layers=JSON.stringify(d.layers);K.apply(d,'particles-adamantium');C.validateParticles(d.particles);
 assert.equal(d.particles.visual,'adamantium');assert.equal(d.particles.count,40);assert.equal(d.particles.blend,'normal');assert.equal(d.particles.palette,'solid');assert.equal(d.particles.placement,'front');assert.equal(d.particles.color,'#ffb729');assert.equal(d.particles.reveal.enabled,false);assert.equal(JSON.stringify(d.layers),layers);assert.equal(d.masks.emission,'retain');
 const w=W.create(d,'emblems','card'),pub=W.publish(w,{kind:'particles',name:'Adamantium',value:W.capture(d,'particles')});const next=W.resolve(JSON.parse(JSON.stringify(W.bind(pub.workshop,'particles',pub.resourceId,pub.version,['card']))));assert.deepEqual(next.particles,d.particles);assert.equal(JSON.stringify(next.layers),layers);
 const bound=M.particlePreset('adamantium',{emitter:{target:'layer',layerId:'art',regionId:'local'}});assert.equal(bound.emitter.regionId,'local');assert.equal(bound.emitter.layerId,'art');
});
test('emblems expand from the inner band; resets are hidden and outward travel stays bounded',()=>{
 const p=M.particlePreset('adamantium'),contour=C.haloPath(C.emitter(p.emitter),F.defaults.corner/1024);
 const distance=(x,y)=>Math.min(...contour.segments.map(s=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.size*s.size)));return Math.hypot(x-s.x-s.dx*t,y-s.y-s.dy*t);}));
 let inside=0,outside=0;
 for(const time of [0,.4,.8,1.2,1.6,2,100,86400]){const a=samples(p,time),b=samples(p,time+.001);assert.equal(a.count,40);assert.deepEqual(a,samples(p,time));
  for(let i=0;i<a.count;i++){const k=i*7;assert.ok(Number.isFinite(a.data[k]));assert.ok(distance(a.data[k],a.data[k+1])<.43);assert.ok(Math.abs(a.data[k])<.5+p.radius&&Math.abs(a.data[k+1])<.75+p.radius);assert.ok(a.data[k+3]>0&&a.data[k+3]<p.size*1.96);assert.ok(a.data[k+4]>=0&&a.data[k+4]<=1);assert.ok(Math.abs(a.data[k+5])<=.221);if(a.data[k+4]>.01&&b.data[k+4]>.01){assert.ok(Math.hypot(a.data[k]-b.data[k],a.data[k+1]-b.data[k+1])<.001);assert.ok(Math.hypot(b.data[k],b.data[k+1])+1e-10>=Math.hypot(a.data[k],a.data[k+1]));assert.ok(b.data[k+3]>=a.data[k+3]);assert.ok(Math.abs(a.data[k]*b.data[k+1]-a.data[k+1]*b.data[k])<1e-8);}
   if(Math.abs(a.data[k])<.5&&Math.abs(a.data[k+1])<.75)inside++;else outside++;
  }
 }
 assert.ok(inside>0&&outside>0);for(const [i,birth] of births(p).entries()){assert.ok(samples(p,birth-.000001).data[i*7+4]<.000001);assert.ok(samples(p,birth+.000001).data[i*7+4]<.000001);}
 for(const budget of [0,1,8,24,96,256])assert.equal(samples(p,1,{layers:[]},budget).count,Math.min(40,budget));assert.equal(samples(p,1,{layers:[]},256,Math.PI).count,0);
});
test('emission binds to alternate back assets without changing the fixed batch format',()=>{
 const p=M.particlePreset('adamantium',{emitter:{target:'back',regionId:'edge',side:'back'}}),doc={layers:[],backScene:{document:{layers:[],emissionRegions:[{...C.regionDefaults,id:'edge',shape:'ellipse',u:.3,v:.4,width:.2,height:.25}]}}};
 assert.equal(samples(p,.7,doc,256,0).count,0);const a=samples(p,.7,doc,256,Math.PI);assert.equal(a.count,40);const buffer=new Float32Array(256*6*B.stride);assert.equal(B.pack(a.data,a.count,buffer),2400);assert.equal(buffer.byteLength,61440);
});
test('independent emblem sizes avoid a synchronized whole-field breathing pulse',()=>{
 for(const seed of [1,7,101,65535]){
  const p=M.particlePreset('adamantium',{seed}),coverage=[];
  for(let step=0;step<=100;step++){
   const a=samples(p,p.lifetime*step/100);let weight=0;
   for(let i=0;i<a.count;i++)weight+=a.data[i*7+3]**2*a.data[i*7+4];
   coverage.push(weight);
  }
  assert.ok(Math.max(...coverage)/Math.min(...coverage)<1.8);
 }
});
test('each emblem grows progressively slower while fully visible',()=>{
 for(const seed of [1,7,101,65535]){
  const p=M.particlePreset('adamantium',{seed}),initial=samples(p,0),birthTimes=births(p),growth=[];
  for(let i=0;i<initial.count;i++){
   const birth=birthTimes[i];
   const phases=[.10,.25,.40],frames=phases.map(phase=>samples(p,birth+phase*p.lifetime));
   const sizes=frames.map(frame=>frame.data[i*7+3]),early=sizes[1]-sizes[0],late=sizes[2]-sizes[1];
   assert.ok(late>0&&early>late,'growth continues while its rate decreases');
   assert.ok(frames[2].data[i*7+4]>.99,'growth is observable while fully visible');
   if(i%5<2)growth.push(early);
  }
  assert.ok(Math.max(...growth)>Math.min(...growth)*1.6,'readable emblems have independently different growth amounts');
 }
});
test('a small quality budget retains both readable emblems and the tiny companion population',()=>{
 const p=M.particlePreset('adamantium');
 for(const time of [.1,.2,.3,.7]){
  const a=samples(p,time,{layers:[]},8),sizes=Array.from({length:a.count},(_,i)=>a.data[i*7+3]);
  assert.equal(a.count,8);assert.ok(Math.max(...sizes)>.025);assert.ok(Math.min(...sizes)<.006);
 }
});
test('intermediate fade values persist while emblems keep moving, and deaths are staggered',()=>{
 const p=M.particlePreset('adamantium'),start=births(p),deaths=[];
 for(let i=0;i<p.count;i++){
  let previous=samples(p,start[i]+p.lifetime*.25),firstFade=null,lastFade=null;
  for(let age=.275;age<=1.225;age+=.025){
   const time=start[i]+age*p.lifetime,current=samples(p,time),k=i*7;
   if(current.data[k+3]<previous.data[k+3]*.7){deaths.push(time-start[i]);break;}
   if(current.data[k+4]>.15&&current.data[k+4]<.85){
    firstFade??=time;lastFade=time;
    assert.ok(current.data[k+4]<=previous.data[k+4]);
    assert.ok(Math.hypot(current.data[k],current.data[k+1])+1e-10>=Math.hypot(previous.data[k],previous.data[k+1]));
   }
   previous=current;
  }
  assert.ok(lastFade-firstFade>=p.lifetime*.12,'fade has an observable intermediate interval');
 }
 assert.equal(deaths.length,p.count);assert.ok(Math.max(...deaths)>Math.min(...deaths)*1.15,'different instances have different cycle lengths');
});
test('old visual indexes remain stable and both engines share the same curved multicolor glyph',()=>{
 assert.deepEqual(C.particleVisuals,B.visuals);assert.equal(B.visuals.indexOf('sprite'),9);assert.equal(B.visuals.indexOf('starcore'),24);assert.equal(B.visuals.indexOf('adamantium'),25);
 const shader=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8');const shared=s=>s.slice(s.indexOf('// Shared Adamantium'),s.indexOf('// Original P01'));assert.equal(shared(B.fragment),shared(shader));assert.match(B.fragment,/else if\(kind<24\.5\)/);
});
