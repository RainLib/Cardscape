const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),K=require('../renderer/finish-catalog.js'),B=require('../renderer/particle-batch.js'),F=require('../renderer/frame-model.js');
const p=M.particlePreset('wakanda'),doc={layers:[],frameStyle:F.defaults};
function samples(time,value=p,context=doc,limit=256,facing=0){const data=new Float64Array(256*7);return {data,count:C.sampleInto(value,time,context,facing,data,limit)};}
test('Tech halo has outline, shaft and node sizes without turning into ordinary hexagons or Cosmic comets',()=>{
 assert.equal(K.entries.filter(e=>e.name==='紫色科技光环').length,1);const value=K.value('particles-purple-wakandan-tech',{palette:'gold',reveal:{enabled:true}});assert.equal(value.visual,'wakanda');assert.equal(value.palette,'solid');assert.equal(value.color,'#b44df0');assert.equal(value.reveal.enabled,false);
 const groups=[0,0,0],a=samples(.7),b=samples(.701);assert.equal(a.count,52);
 for(let i=0;i<a.count;i++){const k=i*7,r=a.data[k+6];groups[r<.58?0:r<.82?1:2]++;if(r>=.58&&r<.82)assert.ok(Math.abs(Math.abs(a.data[k+5])-Math.PI/3)<1e-12);else assert.equal(a.data[k+5],0);assert.ok(a.data[k+3]>0&&a.data[k+3]<.08);assert.ok(a.data[k+4]>=0&&a.data[k+4]<=p.opacity);assert.ok(Math.hypot(a.data[k]-b.data[k],a.data[k+1]-b.data[k+1])<.001);if(r<.58)assert.ok(a.data[k+3]>.032);else if(r<.82)assert.ok(a.data[k+3]<.02);else assert.ok(a.data[k+3]>.02);}
 assert.ok(groups[0]>=25&&groups[1]>=10&&groups[2]>=8);assert.equal(K.value('particles-gold-wakandan-tech').visual,'tech');
});
test('Tech halo stays near its source, honors regions and budgets, and remains deterministic after a day',()=>{
 const rim=C.haloPath(C.emitter(p.emitter),F.defaults.corner/1024);
 function distance(x,y){return Math.min(...rim.segments.map(s=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/(s.size*s.size)));return Math.hypot(x-s.x-s.dx*t,y-s.y-s.dy*t);}));}
 for(const time of [0,.7,5,100,86400]){const a=samples(time);assert.deepEqual(a,samples(time));for(let i=0;i<a.count;i++){const k=i*7;assert.ok(distance(a.data[k],a.data[k+1])<p.radius*1.31);}}
 const context={layers:[],emissionRegions:[{...C.regionDefaults,id:'small',name:'Small',shape:'ellipse',u:.3,v:.4,width:.2,height:.25}]},value=M.particlePreset('wakanda',{emitter:{target:'card',regionId:'small',side:'front'}});
 for(const limit of [0,1,8,48,128,256]){const a=samples(100,value,context,limit);assert.equal(a.count,Math.min(52,limit));for(let i=0;i<a.count;i++){const k=i*7;assert.ok(Math.abs(a.data[k]+.2)<.1+p.radius);assert.ok(Math.abs(a.data[k+1]-.15)<.1875+p.radius*1.31);}}
 assert.equal(samples(1,value,doc).count,0);assert.equal(samples(1,value,context,256,Math.PI).count,0);C.validateParticles(value);
});
test('Tech silhouette is shared by GPU renderers with stable legacy indexes and fixed storage',()=>{
 assert.deepEqual(C.particleVisuals,B.visuals);for(const [id,index] of [['sprite',9],['tech',12],['shard',18],['cosmic',19],['wakanda',20]])assert.equal(B.visuals.indexOf(id),index);
 const shader=fs.readFileSync(path.join(__dirname,'../../sdk/godot/addons/cardscape/card_particles.gdshader'),'utf8'),shape=s=>s.slice(s.indexOf('// Shared Wakandan'),s.indexOf('\nvoid ',s.indexOf('// Shared Wakandan')));assert.equal(shape(B.fragment),shape(shader));
 assert.match(B.vertex,/kind>18.5&&kind<19.5/);assert.match(B.fragment,/else if\(kind<19.5\)/);
 const a=samples(1),buffer=new Float32Array(256*6*B.stride);assert.equal(B.pack(a.data,a.count,buffer),52*6*10);assert.equal(buffer.byteLength,61440);
});
