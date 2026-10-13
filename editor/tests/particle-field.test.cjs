const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js');
function samples(p,time,doc={layers:[]}){const values=new Float64Array(256*7),count=C.sampleInto(p,time,doc,0,values);return Array.from({length:count},(_,i)=>values.slice(i*7,i*7+7));}
test('sustained Glimmer covers artwork and a bounded outer fringe without distant particles',()=>{
 const p=M.particlePreset('glimmer');C.validateParticles(p);assert.equal(p.trajectory,'field');
 let inner=0,outer=0,large=0,small=0;
 for(const t of [.3,.9,2.28,100,3600,86400])for(const q of samples(p,t)){
  assert.ok(Math.abs(q[0])<=.5+p.radius+1e-10);assert.ok(Math.abs(q[1])<=.75+p.radius+1e-10);
  if(q[4]>.1){if(Math.abs(q[0])>.5||Math.abs(q[1])>.75)outer++;else inner++;}
  if(q[3]>p.size)large++;else small++;
 }
 assert.ok(inner>outer&&outer>10);assert.ok(large>0&&small>large);
 const a=samples(p,.3),b=samples(p,.31);assert.ok(a.some((q,i)=>Math.abs(q[5]-b[i][5])>.002));
 assert.deepEqual(samples(p,.3),a);
});
test('field obeys small named rectangles, ellipses and points, and radius zero stays inside',()=>{
 for(const shape of ['rect','ellipse','point'])for(const radius of [0,.03,.2]){
  const region={...C.regionDefaults,id:'zone',name:'Zone',shape,u:.3,v:.4,width:.2,height:.25};
  const doc={layers:[],emissionRegions:[region]},p=C.particles({...M.particlePreset('glimmer'),radius,count:256,speed:2,emitter:{target:'card',regionId:'zone',side:'front'}});
  const hx=(shape==='point'?0:.1)+radius,hy=(shape==='point'?0:.1875)+radius;
  for(const t of [0,.1,1,12,100,86400])for(const q of samples(p,t,doc)){
   assert.ok(Array.from(q).every(Number.isFinite));assert.ok(Math.abs(q[0]+.2)<=hx+1e-9);assert.ok(Math.abs(q[1]-.15)<=hy+1e-9);
   if(shape!=='rect'&&hx&&hy)assert.ok(((q[0]+.2)/hx)**2+((q[1]-.15)/hy)**2<=1+1e-8);
   assert.ok(q[4]>=0&&q[4]<=p.opacity);assert.ok(Math.abs(q[5])<=Math.PI+1e-9);
  }
  assert.equal(C.sampleInto(p,1,doc,Math.PI,new Float64Array(256*7)),0);
  assert.equal(C.sampleInto(p,1,{layers:[]},0,new Float64Array(256*7)),0);
 }
});
test('field wraps only while invisible, and layer transforms carry the full field',()=>{
 const p=C.particles({...M.particlePreset('glimmer'),spread:0,speed:.2,emitter:{target:'card',shape:'rect',direction:'up'}});
 const before=samples(p,0),after=samples(p,.0001);
 for(let i=0;i<before.length;i++)assert.ok(Math.hypot(before[i][0]-after[i][0],before[i][1]-after[i][1])<.001);
 // Check actual discontinuities over a cycle, rather than assuming random seed timings.
 let jumps=0,previous=samples(p,0);
 for(let t=.01;t<20;t+=.01){const next=samples(p,t);for(let i=0;i<next.length;i++)if(Math.hypot(next[i][0]-previous[i][0],next[i][1]-previous[i][1])>.5){jumps++;assert.ok(next[i][4]<.002&&previous[i][4]<.002);}previous=next;}
 assert.ok(jumps>0);
 const doc={layers:[{id:'source',kind:'image',visible:true,x:120,y:-40,scale:.7,rotation:30}],emissionRegions:[]};
 const bound=C.particles({...p,emitter:{...p.emitter,target:'layer',layerId:'source'}}),resolved=C.resolveEmitter(bound,doc),local=samples(p,2),mapped=samples(bound,2,doc);
 for(let i=0;i<local.length;i++){const q=C.mapEmitterPoint(resolved,local[i][0],local[i][1],p.z);assert.ok(Math.abs(mapped[i][0]-q.x)<1e-9);assert.ok(Math.abs(mapped[i][1]-q.y)<1e-9);}
});
