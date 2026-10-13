const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),K=require('../renderer/finish-catalog.js'),B=require('../renderer/particle-batch.js'),F=require('../renderer/frame-model.js');
const p=M.particlePreset('cosmic'),doc={layers:[],frameStyle:F.defaults},rim=C.haloPath(C.emitter(p.emitter),F.defaults.corner/1024);
function distance(x,y){let d=Infinity;for(const s of rim.segments){const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.size*s.size)));d=Math.min(d,Math.hypot(x-s.x-s.dx*t,y-s.y-s.dy*t));}return d;}
function frame(time,value=p,context=doc,budget=256,facing=0){const data=new Float64Array(256*7);return {data,n:C.sampleInto(value,time,context,facing,data,budget)};}
test('Cosmic has distinct bounded clouds and thin diagonal comets, not mixed discs or distant emitters',()=>{
 assert.equal(K.value('particles-cosmic').visual,'cosmic');assert.equal(p.placement,'behind');assert.equal(M.particlePreset('cosmic',{color:'#ffc000',palette:'gold'}).color,'#9261df');assert.equal(M.particlePreset('cosmic',{palette:'gold'}).palette,'solid');assert.equal(p.reveal.enabled,false);
 let clouds=0,comets=0;const a=frame(.7),b=frame(.701);
 for(let i=0;i<a.n;i++){const k=i*7,r=a.data[k+6];if(r>.78){comets++;assert.ok(a.data[k+3]<.012);assert.ok(a.data[k+5]<-.3&&a.data[k+5]>-.8);}else{clouds++;assert.ok(a.data[k+3]>.05);assert.ok(a.data[k+4]>.15);}
  assert.ok(Math.hypot(a.data[k]-b.data[k],a.data[k+1]-b.data[k+1])<.001);
 }
 assert.ok(clouds>comets&&comets>5);
 for(const time of [0,1,5,100,86400]){const a=frame(time);for(let i=0;i<a.n;i++){const k=i*7;assert.ok(distance(a.data[k],a.data[k+1])<=p.radius+.000001);assert.ok(a.data[k+4]>=0&&a.data[k+4]<=p.opacity);assert.ok(Number.isFinite(a.data[k+5]));}assert.deepEqual(a,frame(time));}
});
test('Cosmic honors named region, orientation, hidden source, side and global budget',()=>{
 const d={layers:[],emissionRegions:[{...C.regionDefaults,id:'small',name:'Small',shape:'ellipse',u:.3,v:.4,width:.2,height:.25,direction:'up'}]},q=M.particlePreset('cosmic',{emitter:{target:'card',regionId:'small',side:'front'}});
 for(const limit of [0,1,8,48,128,256]){const a=frame(100,q,d,limit);assert.equal(a.n,Math.min(q.count,limit));for(let i=0;i<a.n;i++){const k=i*7;assert.ok(Math.abs(a.data[k]+.2)<=.1+q.radius+.00001);assert.ok(Math.abs(a.data[k+1]-.15)<=.1875+q.radius+.00001);if(a.data[k+6]>.78)assert.ok(Math.abs(a.data[k+5]-Math.PI/2)<1e-10);}}
 assert.equal(frame(1,q,d,256,Math.PI).n,0);assert.equal(frame(1,q,doc).n,0);
 const linked=M.particlePreset('cosmic',{emitter:{target:'layer',layerId:'source',side:'front'}});
 assert.equal(frame(1,linked,{layers:[{id:'source',visible:false}]}).n,0);
 for(const trajectory of ['halo','field','float','outward'])C.validateParticles({...q,trajectory});
});
test('Cosmic shares shader surface and stable buffer across WebGL and Godot without changing legacy indexes',()=>{
 assert.equal(C.particleVisuals.indexOf('sprite'),9);assert.equal(C.particleVisuals.indexOf('shard'),18);assert.equal(C.particleVisuals.indexOf('cosmic'),19);assert.deepEqual(C.particleVisuals,B.visuals);
 const gd=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8'),extract=s=>s.slice(s.indexOf('// Shared Cosmic surface'),s.indexOf('\nvoid ',s.indexOf('// Shared Cosmic surface'))).trim();assert.equal(extract(B.fragment),extract(gd));
 const a=frame(1),vertices=new Float32Array(256*6*B.stride);assert.equal(B.pack(a.data,a.n,vertices),a.n*6*B.stride);assert.equal(vertices.byteLength,61440);
});
