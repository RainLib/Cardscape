const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),B=require('../renderer/particle-batch.js');
const p=M.particlePreset('glimmer'),doc={layers:[]};
function frame(time,budget=256,age=time,value=p,context=doc,facing=0){const samples=new Float64Array(256*7),visuals=new Float32Array(256);const count=C.sampleCompositionInto(value,time,context,facing,samples,visuals,budget,age);return {samples:samples.slice(0,count*7),visuals:visuals.slice(0,count),count};}
test('Glimmer has one radial reveal followed by sustained chips; idle lifetime never retriggers it',()=>{
 C.validateParticles(p);assert.equal(p.visual,'shard');assert.equal(p.placement,'front');
 const start=frame(0),mid=frame(.09),end=frame(.24);assert.equal(start.count,100);assert.equal(start.visuals.filter(v=>v===3).length,44);assert.equal(end.count,56);assert.ok(end.visuals.every(v=>v===-1));
 for(let i=p.count;i<start.count;i++){assert.ok(start.samples[i*7+4]>mid.samples[i*7+4]);assert.ok(start.samples[i*7+3]>mid.samples[i*7+3]);}
 for(const t of [p.lifetime,100,86400])assert.equal(frame(t).count,56);
 const replay=frame(100,256,0);assert.equal(replay.count,100);assert.deepEqual(replay.samples.slice(p.count*7),start.samples.slice(p.count*7));
 assert.deepEqual(frame(.09),mid);assert.equal(C.particleVisuals.indexOf('sprite'),9);
});
test('burst and idle share the fixed budget and one quad buffer, even at one instance',()=>{
 for(const budget of [0,1,8,16,32,128,256]){const f=frame(.1,budget);assert.ok(f.count<=budget);if(budget)assert.ok(f.visuals.includes(3));const vertices=new Float32Array(256*6*B.stride),n=B.pack(f.samples,f.count,vertices,f.visuals);assert.equal(n,f.count*6*B.stride);for(let i=0;i<f.count;i++)for(let v=0;v<6;v++)assert.equal(vertices[(i*6+v)*B.stride+7],f.visuals[i]);}
 assert.equal(B.stride,10);assert.equal(B.visuals.indexOf('shard'),18);
});
test('reveals follow named transformed sources and disappear on the unselected side or missing source',()=>{
 const q=C.particles({...p,emitter:C.emitter({target:'card',regionId:'small',side:'front'})}),d={layers:[],emissionRegions:[{id:'small',name:'Small',shape:'rect',u:.3,v:.4,width:.2,height:.25,direction:'outward',angle:0,layerId:''}]};
 for(const t of [0,.12,.23]){const f=frame(t,256,t,q,d);for(let i=0;i<f.count;i++){assert.ok(Math.abs(f.samples[i*7]+.2)<=.1+p.reveal.travel);assert.ok(Math.abs(f.samples[i*7+1]-.15)<=.1875+p.reveal.travel);}}
 assert.equal(frame(0,256,0,q,d,Math.PI).count,0);assert.equal(frame(0,256,0,q,doc).count,0);
 assert.equal(M.particlePreset('tone',p).reveal.enabled,false);
});
test('AI accepts bounded reveal settings and rejects malformed values',()=>{
 const commands=require('../renderer/editor-commands.js');
 for(const r of [{duration:0},{duration:3},{count:129},{size:.1},{travel:3.01},{stretch:13},{enabled:'true'}])assert.throws(()=>C.validateParticles(C.particles({...p,reveal:{...p.reveal,...r}})));
 assert.doesNotThrow(()=>commands.validate([{op:'particles',reveal:{enabled:true,duration:.24}}]));
});
