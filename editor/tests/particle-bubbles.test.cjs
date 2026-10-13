const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),B=require('../renderer/particle-batch.js'),K=require('../renderer/finish-catalog.js');
const doc={layers:[]},p=M.particlePreset('bubbles');
function sample(value,time,context=doc,limit=256,facing=0){const data=new Float64Array(256*7),count=C.sampleInto(value,time,context,facing,data,limit);return {count,data:data.slice(0,count*7)};}
test('bubble material and defaults remain reusable and never overwrite existing authored values',()=>{
 C.validateParticles(p);assert.equal(p.count,12);assert.equal(p.blend,'normal');assert.equal(p.emitter.direction,'up');assert.equal(K.find('particles-bubbles').recipe.color,p.color);
 const old=C.particles({visual:'bubble',enabled:true,size:.032,speed:.035,lifetime:8,blend:'add',color:'#d9f6ff'});
 assert.deepEqual(C.particles(JSON.parse(JSON.stringify(old))),old);
 const custom={target:'card',regionId:'effect',direction:'angle',angle:90,side:'both'};
 assert.deepEqual(M.particlePreset('bubbles',{emitter:custom}).emitter,C.emitter(custom));
});
test('bubbles rise continuously without size breathing or rotation; reset is hidden and zero speed is stationary',()=>{
 const a=sample(p,.7),b=sample(p,.701);
 for(let i=0;i<a.count;i++){
  const k=i*7;assert.ok((b.data[k+1]-a.data[k+1])*1000>.19);assert.ok((b.data[k+1]-a.data[k+1])*1000<.29);
  assert.equal(a.data[k+3],b.data[k+3]);assert.equal(a.data[k+5],0);
  const birth=(1-a.data[k+6])*p.lifetime;
  for(const time of [birth-.000001,birth+.000001])assert.ok(sample(p,time).data[k+4]<.000001);
 }
 const stationary={...p,speed:0};for(let i=0;i<p.count;i++){const k=i*7;const at=sample(stationary,.7),next=sample(stationary,.701);assert.equal(at.data[k],next.data[k]);assert.equal(at.data[k+1],next.data[k+1]);}
});
test('custom directions, emission regions, sides and particle budgets still apply',()=>{
 const right={...p,emitter:{...p.emitter,direction:'angle',angle:90}};
 const a=sample(right,.7),b=sample(right,.701);for(let i=0;i<a.count;i++)assert.ok((b.data[i*7]-a.data[i*7])*1000>.19);
 for(const limit of [0,1,8,48,128,256])assert.equal(sample(p,100,doc,limit).count,Math.min(p.count,limit));
 assert.equal(sample(p,.7,doc,256,Math.PI).count,0);
 const value=M.particlePreset('bubbles',{emitter:{target:'card',regionId:'region',direction:'up',side:'both'}});
 assert.equal(sample(value,.7).count,0);
 const context={layers:[],emissionRegions:[{...C.regionDefaults,id:'region',shape:'ellipse',u:.3,v:.4,width:.2,height:.25,direction:'up'}]};
 for(const radius of [0,.07,.2])for(const time of [0,.7,100,86400]){
  const s=sample({...value,radius},time,context);assert.equal(s.count,p.count);assert.ok(s.data.every(Number.isFinite));assert.deepEqual(s,sample({...value,radius},time,context));
 }
});
test('the bubble surface is exactly shared across WebGL and Godot without new textures or visual indexes',()=>{
 const sdk=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8');
 const shape=s=>s.slice(s.indexOf('// Shared bubble surface'),s.indexOf('// Shared Cosmic surface'));
 assert.equal(shape(B.fragment),shape(sdk));assert.deepEqual(B.visuals,C.particleVisuals);assert.equal(B.visuals.indexOf('bubble'),8);assert.equal(B.stride,10);
 const at=sample(p,.7),packed=new Float32Array(256*6*B.stride);assert.equal(B.pack(at.data,at.count,packed),p.count*6*B.stride);
});
