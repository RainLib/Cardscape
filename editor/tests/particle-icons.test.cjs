const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),K=require('../renderer/finish-catalog.js'),B=require('../renderer/particle-batch.js'),F=require('../renderer/frame-model.js'),W=require('../renderer/workshop-model.js'),R=require('../renderer/runtime-model.js');
const profiles=[['flowers','flower',44,'rainbow'],['paws','paw',32,'rainbow'],['pizza','pizza',24,'solid']],context={layers:[],frameStyle:F.defaults};
function sample(p,time,doc=context,budget=256,facing=0){const data=new Float64Array(256*7);return {data,count:C.sampleInto(p,time,doc,facing,data,budget)};}
test('illustrated silhouettes have distinct palettes, preserve source art and survive reusable publication',()=>{
 for(const [id,visual,count,palette] of profiles){
  const d=R.ensure({schema:'card-atelier/1',id:'icons',name:'Icons',layers:[{id:'art',kind:'background',visible:true,src:'data:image/png;base64,YQ=='}],masks:{motion:'keep'},cosmetics:M.config()});
  d.particles=C.particles({emitter:{target:'card',regionId:'edge'},reveal:{enabled:true}});const before=JSON.stringify(d.layers);
  K.apply(d,'particles-'+id);C.validateParticles(d.particles);
  assert.equal(d.particles.visual,visual);assert.equal(d.particles.count,count);assert.equal(d.particles.palette,palette);assert.equal(d.particles.color,'#ffffff');assert.equal(d.particles.blend,'normal');assert.equal(d.particles.reveal.enabled,false);assert.equal(d.particles.emitter.regionId,'edge');assert.equal(JSON.stringify(d.layers),before);assert.equal(d.masks.motion,'keep');
  let w=W.create(d,'icon-workshop','a');const published=W.publish(w,{kind:'particles',id:'icons',name:id,value:W.capture(d,'particles')});w=W.bind(published.workshop,'particles',published.resourceId,published.version,['a']);
  const reopened=W.resolve(JSON.parse(JSON.stringify(w)));assert.equal(reopened.particles.visual,visual);assert.equal(reopened.particles.palette,palette);assert.equal(reopened.particles.emitter.regionId,'edge');assert.equal(JSON.stringify(reopened.layers),before);
 }
});
test('icon births fade before changing position; drift stays near the chosen contour and honors budgets',()=>{
 for(const [id,,count] of profiles){const p=M.particlePreset(id),path=C.haloPath(C.emitter(p.emitter),F.defaults.corner/1024);
  const distance=(x,y)=>Math.min(...path.segments.map(s=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.size*s.size)));return Math.hypot(x-s.x-s.dx*t,y-s.y-s.dy*t);}));
  for(const time of [0,.7,100,86400]){const a=sample(p,time);assert.equal(a.count,count);assert.deepEqual(a,sample(p,time));const sizes=[];
   for(let i=0;i<count;i++){const k=i*7;sizes.push(a.data[k+3]);assert.ok(distance(a.data[k],a.data[k+1])<Math.max(p.radius,.18*p.spread)+p.radius*.31);assert.ok(a.data[k+4]>=0&&a.data[k+4]<=1);assert.ok(Math.abs(a.data[k+5])<=Math.PI);assert.ok(a.data[k+3]>0&&a.data[k+3]<p.size*1.26);}
   assert.ok(Math.max(...sizes)>Math.min(...sizes)*3);
  }
  const a=sample(p,.7),b=sample(p,.701);for(let i=0;i<count;i++){const k=i*7;if(a.data[k+4]>.01&&b.data[k+4]>.01)assert.ok(Math.hypot(a.data[k]-b.data[k],a.data[k+1]-b.data[k+1])<.001);}
  for(let i=0;i<count;i++){const r=a.data[i*7+6],birth=(1-r)*p.lifetime;for(const time of [birth-.000001,birth+.000001])assert.ok(sample(p,time).data[i*7+4]<.000001);}
  for(const budget of [0,1,8,48,128,256])assert.equal(sample(p,100,context,budget).count,Math.min(count,budget));assert.equal(sample(p,1,context,256,Math.PI).count,0);
  const doc={layers:[],emissionRegions:[{...C.regionDefaults,id:'small',shape:'ellipse',u:.3,v:.4,width:.2,height:.25}]},value=M.particlePreset(id,{emitter:{target:'card',regionId:'small',side:'front'}});
  assert.equal(sample(value,1,context).count,0);for(const time of [0,1,100]){const s=sample(value,time,doc);for(let i=0;i<count;i++){const k=i*7;assert.ok(Math.abs(s.data[k]+.2)<.1+p.radius*1.31);assert.ok(Math.abs(s.data[k+1]-.15)<.1875+p.radius*1.31);}}
 }
});
test('new icon indexes append to fixed storage and share the exact shader shapes with Godot',()=>{
 assert.deepEqual(C.particleVisuals,B.visuals);for(const [visual,index] of [['sprite',9],['wakanda',20],['flower',21],['paw',22],['pizza',23]])assert.equal(B.visuals.indexOf(visual),index);
 const shader=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8'),shared=s=>s.slice(s.indexOf('// Shared illustrated'),s.indexOf('\nvoid ',s.indexOf('// Shared illustrated')));assert.equal(shared(B.fragment),shared(shader));
 assert.match(B.vertex,/kind>19.5&&kind<20.5&&style.z>=.58/);
 const p=M.particlePreset('flowers'),samples=sample(p,1),buffer=new Float32Array(256*6*B.stride);assert.equal(B.pack(samples.data,samples.count,buffer),44*6*10);assert.equal(buffer.byteLength,61440);
});
