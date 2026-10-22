const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../dist/renderer/component-model.js'),M=require('../dist/renderer/cosmetics-model.js'),B=require('../dist/renderer/particle-batch.js'),K=require('../dist/renderer/finish-catalog.js'),W=require('../dist/renderer/workshop-model.js');
const p=M.particlePreset('bananas'),doc={layers:[]};
function sample(value,time,context=doc,limit=256,facing=0){const data=new Float64Array(256*7),count=C.sampleInto(value,time,context,facing,data,limit);return {count,data:data.slice(0,count*7)};}
test('banana presets publish and reopen without changing artwork or old authored settings',()=>{
 C.validateParticles(p);assert.equal(p.count,20);assert.equal(p.blend,'normal');assert.equal(p.trajectory,'halo');assert.equal(K.find('particles-bananas').recipe.color,p.color);
 const old=C.particles({enabled:true,visual:'banana',size:.065,speed:.028,lifetime:8,color:'#ffd35a'});assert.deepEqual(C.particles(JSON.parse(JSON.stringify(old))),old);
 let w=W.create({schema:'card-atelier/1',id:'banana',name:'Banana',layers:[],particles:p},'banana-qa','a');const r=W.publish(w,{kind:'particles',id:'banana',name:'Bananas',value:W.capture(W.resolve(w),'particles')});w=W.bind(r.workshop,'particles',r.resourceId,r.version,['a']);assert.deepEqual(W.resolve(JSON.parse(JSON.stringify(w))).particles,p);
});
test('banana births reset invisibly, grow independently, spin in both directions and stay bounded',()=>{
 const a=sample(p,.7),b=sample(p,.701);let clockwise=0,counterclockwise=0;
 for(let i=0;i<a.count;i++){
  const k=i*7,delta=((b.data[k+5]-a.data[k+5]+Math.PI*3)%(Math.PI*2))-Math.PI;
  if(delta>0)clockwise++;else counterclockwise++;assert.ok(Math.abs(delta)>.0002&&Math.abs(delta)<.0033);
  assert.ok(Math.hypot(b.data[k]-a.data[k],b.data[k+1]-a.data[k+1])<.0004);
  const birth=(1-a.data[k+6])*p.lifetime;for(const time of [birth-.000001,birth+.000001])assert.ok(sample(p,time).data[k+4]<.000001);
 }
 assert.ok(clockwise>3&&counterclockwise>3);
 for(let time=0;time<20;time+=.05){const s=sample(p,time);for(let i=0;i<s.count;i++){const k=i*7;if(s.data[k+4]>.01)assert.ok(Math.max(0,Math.abs(s.data[k])-.5,Math.abs(s.data[k+1])-.75)<p.radius*5.5);assert.ok(s.data[k+3]>0&&s.data[k+3]<=p.size*2.25);assert.ok(Math.abs(s.data[k+5])<=Math.PI);}}
 const stationary={...p,speed:0},u=sample(stationary,.7),v=sample(stationary,.701);for(let i=0;i<u.count;i++){const k=i*7;assert.equal(u.data[k],v.data[k]);assert.equal(u.data[k+1],v.data[k+1]);assert.equal(u.data[k+5],v.data[k+5]);}
});
test('banana direction, emission regions, side selection and fixed budgets remain usable',()=>{
 const right={...p,emitter:{...p.emitter,direction:'angle',angle:90}},a=sample(right,.7),b=sample(right,.701);for(let i=0;i<a.count;i++)assert.ok(b.data[i*7]>a.data[i*7]);
 for(const limit of [0,1,8,48,128,256])assert.equal(sample(p,100,doc,limit).count,Math.min(p.count,limit));assert.equal(sample(p,.7,doc,256,Math.PI).count,0);
 const value=M.particlePreset('bananas',{emitter:{target:'card',regionId:'small',direction:'up',side:'both'}});assert.equal(sample(value,.7).count,0);
 const context={layers:[],emissionRegions:[{...C.regionDefaults,id:'small',shape:'ellipse',u:.3,v:.4,width:.2,height:.25,direction:'up'}]};
 for(const radius of [0,.07,.2])for(const time of [0,.7,100,86400]){const s=sample({...value,radius},time,context);assert.ok(s.data.every(Number.isFinite));assert.deepEqual(s,sample({...value,radius},time,context));}
});
test('banana surface stays exactly shared with Godot and does not add textures or buffer storage',()=>{
 const sdk=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8'),shape=s=>s.slice(s.indexOf('// Shared illustrated banana:'),s.indexOf('// Shared Cosmic surface'));
 assert.equal(shape(B.fragment),shape(sdk));assert.deepEqual(B.visuals,C.particleVisuals);assert.equal(B.visuals.indexOf('banana'),13);assert.equal(B.stride,10);
 const at=sample(p,.7),packed=new Float32Array(256*6*B.stride);assert.equal(B.pack(at.data,at.count,packed),p.count*6*B.stride);assert.equal(packed.byteLength,61440);
});
