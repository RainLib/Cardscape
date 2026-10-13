const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js'),K=require('../renderer/finish-catalog.js'),F=require('../renderer/frame-model.js'),W=require('../renderer/workshop-model.js'),R=require('../renderer/runtime-model.js');
const e=C.emitter({target:'frame'}),rim={frameStyle:{...F.defaults},layers:[]};
const path=C.haloPath(e,F.defaults.corner/1024),scratch=new Float64Array(4);
function distance(q){let best=Infinity;for(const s of path.segments){const t=Math.max(0,Math.min(1,((q.x-s.x)*s.dx+(q.y-s.y)*s.dy)/(s.size*s.size)));best=Math.min(best,Math.hypot(q.x-s.x-s.dx*t,q.y-s.y-s.dy*t));}return best;}
test('halo stays near clipped rim for hours, independently of high speed and lifetime',()=>{
 for(const lifetime of [.3,12])for(const time of [0,.3,8,100,3600,86400]){
  const p=C.particles({enabled:true,trajectory:'halo',radius:.055,opacity:.6,count:256,lifetime,speed:2,spread:2,emitter:e});
  for(const q of C.sample(p,time,rim)){
   assert.ok(distance(q)<=p.radius+1e-10,`particle drifted ${distance(q)}`);
   assert.ok(q.alpha>=0&&q.alpha<=p.opacity);assert.equal(q.z,-.035);
  }
 }
});
test('rim uses arc length and crosses every corner and closing seam continuously',()=>{
 assert.ok(Math.abs(path.length-(5-8*F.defaults.corner/1024+4*Math.SQRT2*F.defaults.corner/1024))<1e-10);
 for(const s of path.segments){const u=s.start/path.length;C.haloPoint(path,u-1e-8,scratch);const before=scratch.slice();C.haloPoint(path,u+1e-8,scratch);assert.ok(Math.hypot(scratch[0]-before[0],scratch[1]-before[1])<1e-6);}
 const p=C.particles({enabled:true,trajectory:'halo',radius:.055,opacity:.6,emitter:e});
 const a=C.sample(p,6,rim),b=C.sample(p,6.00001,rim);for(let i=0;i<a.length;i++)assert.ok(Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y)<.0001);
});
test('soft halo preserves sprite, palette, named source and published version while applying a bounded local override',()=>{
 const p=C.particles({enabled:true,count:200,size:.08,speed:1,lifetime:2,visual:'sprite',sprite:'particles/sprite.png',palette:'gold',emitter:{target:'back',regionId:'socket',side:'back'}}),soft=C.softHalo(p);
 assert.equal(soft.sprite,p.sprite);assert.equal(soft.palette,'gold');assert.deepEqual(soft.emitter,p.emitter);assert.equal(soft.trajectory,'halo');assert.equal(p.count,200);
 const d=R.ensure({schema:'card-atelier/1',id:'a',name:'A',layers:[],masks:{},particles:soft});let w=W.create(d,'w','a');const out=W.publish(w,{kind:'particles',id:'flare',name:'Flare',value:soft});w=W.bind(out.workshop,'particles',out.resourceId,out.version,['a']);
 const reopened=W.resolve(JSON.parse(JSON.stringify(w)));assert.equal(reopened.particles.trajectory,'halo');assert.equal(reopened.particles.radius,.055);assert.equal(reopened.particles.opacity,.65);
});
test('new recipes combine large colored discs and small stars in one bounded emitter',()=>{
 assert.equal(K.find('particles-orbs').name,'纯色大圆点');const p=M.particlePreset('mixed'),data=new Float32Array(256*7),n=C.sampleInto(p,2,rim,0,data);let big=0,small=0;
 for(let i=0;i<n;i++){if(data[i*7+6]>.82){big++;assert.ok(data[i*7+3]>p.size);}else{small++;assert.ok(data[i*7+3]<=p.size+1e-7);}}
 assert.ok(big>0&&small>big);for(const id of Object.keys(M.presets)){const p=M.particlePreset(id);C.validateParticles(p);assert.equal(p.trajectory,M.presets[id].trajectory||'halo');assert.equal(p.emitter.target,M.presets[id].emitter?.target||'frame');}
});
test('Krackle creates overlapping clusters with short growth cycles and bounded travel',()=>{
 const p=M.particlePreset('krackle'),a=new Float64Array(256*7),b=new Float64Array(256*7);C.sampleInto(p,.3,rim,0,a);C.sampleInto(p,.8,rim,0,b);
 assert.equal(p.count,72);assert.equal(p.blend,'normal');let visible=0,changing=0,small=0,large=0,clusters=0;
 for(let i=0;i<p.count;i++){const k=i*7;if(b[k+4]>.25)visible++;if(Math.abs(a[k+3]-b[k+3])>.003)changing++;if(b[k+3]<.015)small++;if(b[k+3]>.04)large++;if(i%3&&Math.hypot(a[k]-a[k-7],a[k+1]-a[k-6])<.10)clusters++;assert.ok(distance({x:a[k],y:a[k+1]})<=p.radius+1e-6);}
 assert.ok(visible>30);assert.ok(changing>15);assert.ok(small>10&&large>0);assert.ok(clusters>20);
});
test('halo supports ellipse and small named regions; invalid radius and strength cannot be saved or applied by AI',async()=>{
 const d={emissionRegions:[{...C.regionDefaults,id:'small',name:'小区域',shape:'ellipse',width:.2,height:.2,u:.3,v:.4}]};const p=C.particles({enabled:true,trajectory:'halo',radius:.03,emitter:{target:'card',regionId:'small'}});
 for(const q of C.sample(p,123,d)){assert.ok(Math.abs(q.x+.2)<=.13);assert.ok(Math.abs(q.y-.15)<=.18);}
 for(const change of [{radius:.21},{radius:-1},{opacity:1.01},{trajectory:'unknown'}])assert.throws(()=>C.validateParticles({...p,...change}));
 const {prepareAuthoring}=require('../electron/authoring-service.cjs'),original=R.ensure({id:'a',layers:[{id:'body',kind:'foreground',visible:true}],masks:{}});
 const result=await prepareAuthoring({document:original,documentToken:'a',commands:[{op:'particles',enabled:true,trajectory:'halo',radius:.04,opacity:.75,visual:'mixed'}]},{validate:d=>{C.validate(d);return d;}});
 assert.equal(result.document.particles.trajectory,'halo');assert.equal(result.document.particles.visual,'mixed');assert.equal(original.particles,undefined);
});

test('foreground float particles stay within their named rectangle over long sessions and are one-sided',()=>{
 for(const id of ['pixels','hearts','leaves']){const p=M.particlePreset(id),data=new Float64Array(256*7);C.validateParticles(p);assert.equal(p.placement,'front');assert.ok(p.z>0);assert.equal(p.blend,'normal');const d={layers:[],emissionRegions:[{...C.regionDefaults,id:'small',name:'Small',shape:'rect',u:.3,v:.4,width:.2,height:.25}]};p.emitter={...p.emitter,regionId:'small'};
 for(const t of [0,.5,12,3600,86400]){const n=C.sampleInto(p,t,d,0,data);assert.equal(n,p.count);for(let i=0;i<n;i++){const k=i*7;assert.ok(Math.abs(data[k]+.2)<=.100001);assert.ok(Math.abs(data[k+1]-.15)<=.187501);assert.ok(data[k+4]>=0&&data[k+4]<=p.opacity);if(id==='pixels')assert.equal(data[k+5],0);}}assert.equal(C.sampleInto(p,1,d,Math.PI,data),0);
 }assert.equal(C.particles({}).placement,'behind');assert.throws(()=>C.validateParticles(C.particles({placement:'bad'})));assert.throws(()=>C.validateParticles(C.particles({z:.6})));
});

test('Tone uses bounded dot patches with stable orientation and keeps explicit region bindings',()=>{
 const p=M.particlePreset('tone',{emitter:{target:'frame',regionId:'small-rim',side:'front'}});
 assert.equal(p.visual,'tone');assert.equal(p.placement,'behind');assert.equal(p.blend,'normal');
 assert.equal(p.emitter.regionId,'small-rim');
 const doc={frameStyle:{corner:48},emissionRegions:[{id:'small-rim',name:'Rim',shape:'perimeter',u:.3,v:.4,width:.2,height:.25,direction:'outward',angle:0,layerId:''}]};
 for(const t of [0,.5,5,3600]){
  const data=new Float64Array(256*7),n=C.sampleInto(p,t,doc,0,data);
  assert.equal(n,p.count);
  for(let i=0;i<n;i++){const k=i*7;assert.ok(Math.abs(data[k]+.2)<=.1+p.radius+.00001);assert.ok(Math.abs(data[k+1]-.15)<=.1875+p.radius+.00001);assert.equal(data[k+5],Math.PI/2+.12);assert.ok(data[k+4]>=0&&data[k+4]<=p.opacity);}
  const again=new Float64Array(256*7);C.sampleInto(p,t,doc,0,again);assert.deepEqual(again,data);
 }
 assert.equal(C.particleVisuals.indexOf('sprite'),9);assert.equal(C.particleVisuals.indexOf('leaf'),16);
 assert.equal(C.sampleInto(p,1,doc,Math.PI,new Float64Array(256*7)),0);
});
