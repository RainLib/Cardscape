const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../dist/renderer/character-weight-tools.js'),C=require('../dist/renderer/character-animation-model.js'),A=C.advanced;
const {fixture}=require('./fixtures/character-animation.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
function normalized(ws){assert.ok(ws.length>0&&ws.length<=4);near(ws.reduce((s,w)=>s+w.weight,0),1);assert.ok(ws.every(w=>w.weight>0&&w.weight<=1));}
test('weight replacement preserves locked values, limits four influences, and cannot erase the sole influence',()=>{
 const old=[{boneId:'locked',weight:.3},{boneId:'b',weight:.2},{boneId:'c',weight:.2},{boneId:'d',weight:.3}],locked=new Set(['locked']);
 const next=T.setWeight(old,'new',.4,locked);normalized(next);near(next.find(w=>w.boneId==='locked').weight,.3);near(next.find(w=>w.boneId==='new').weight,.4);assert.equal(next.length,4);assert.deepEqual(old[0],{boneId:'locked',weight:.3});
 assert.deepEqual(T.setWeight(old,'locked',1,locked),old);assert.deepEqual(T.setWeight([{boneId:'only',weight:1}],'only',0),[{boneId:'only',weight:1}]);
 const capped=T.setWeight(old,'new',1,locked);near(capped.find(w=>w.boneId==='new').weight,.7);normalized(capped);
});
test('painting has radial falloff and supports add, remove and replace without touching UV or locked weights',()=>{
 const m=A.grid('body','root',4,4),uv=[...m.uv],source=[...m.vertices];m.weights=m.weights.map(()=>[{boneId:'root',weight:.2},{boneId:'shoulder',weight:.8}]);
 const settings={radius:350,strength:1,value:.7,mode:'replace',locked:new Set()};T.paint(m,'shoulder',[{x:512,y:768}],settings);near(m.weights[12].find(w=>w.boneId==='shoulder').weight,.7);near(m.weights[0].find(w=>w.boneId==='shoulder').weight,.8);
 T.paint(m,'elbow',[{x:512,y:768}],{...settings,mode:'add',strength:.5,locked:new Set(['root'])});near(m.weights[12].find(w=>w.boneId==='root').weight,.3);near(m.weights[12].find(w=>w.boneId==='elbow').weight,.5);
 T.paint(m,'elbow',[{x:512,y:768}],{...settings,mode:'remove',strength:.25});near(m.weights[12].find(w=>w.boneId==='elbow').weight,.25);m.weights.forEach(normalized);assert.deepEqual(m.uv,uv);assert.deepEqual(m.vertices,source);
});
test('smoothing uses triangle connectivity and does not bridge disconnected mesh islands',()=>{
 const m={vertices:[0,0,1,0,0,1,0,0,1,0,0,1],triangles:[0,1,2,3,4,5],weights:[[{boneId:'a',weight:1}],[{boneId:'b',weight:1}],[{boneId:'b',weight:1}],[{boneId:'c',weight:1}],[{boneId:'c',weight:1}],[{boneId:'c',weight:1}]]};T.smooth(m);near(m.weights[0].find(w=>w.boneId==='a').weight,1/3);assert.deepEqual(m.weights[3],[{boneId:'c',weight:1}]);m.weights.forEach(normalized);
});
test('automatic binding respects chosen influences and locks, with registered layer transforms',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',3,3);layer.x=30;layer.y=-20;layer.scale=1.2;layer.rotation=25;
 T.auto(doc,layer,m,['shoulder','elbow']);assert.ok(m.weights.every(ws=>ws.every(w=>['shoulder','elbow'].includes(w.boneId))));m.weights.forEach(normalized);
 m.weights[0]=[{boneId:'root',weight:.35},{boneId:'shoulder',weight:.65}];T.auto(doc,layer,m,['shoulder','elbow'],new Set(['root']));near(m.weights[0].find(w=>w.boneId==='root').weight,.35);m.weights.forEach(normalized);
 const p=T.vertexPoints(doc,layer,m)[5],source=T.sourcePoint(doc,layer,p);near(source.x,m.vertices[10]);near(source.y,m.vertices[11]);
});

test('weight editor coordinates match runtime placement with slots, rotation, pivot and animated skinning',()=>{
 const R=require('../dist/renderer/runtime-model.js'),doc=fixture(),layer=doc.layers.find(l=>l.id==='forearm'),mesh=A.grid('forearm','root',2,2);
 Object.assign(layer,{x:27,y:-18,rotation:31,scale:.8,pivot:{u:.3,v:.7},slotId:'registered'});
 doc.slots=[{id:'registered',name:'Registered',u:.42,v:.63,rotation:-17,scale:1.25,z:.08,clip:false,effect:'none',strength:1,speed:1}];
 doc.characterRig.meshes=[mesh];mesh.weights=mesh.weights.map(()=>[{boneId:'elbow',weight:1}]);C.validate(doc);
 const base=R.placement(doc,layer),matrix=C.matrix(512+base.x,768+base.y,base.rotation*180/Math.PI,base.scale);
 const rest=T.vertexPoints(doc,layer,mesh);
 rest.forEach((p,i)=>{const expected=C.point(matrix,mesh.vertices[i*2]-512,mesh.vertices[i*2+1]-768);near(p.x,expected.x);near(p.y,expected.y);const source=T.sourcePoint(doc,layer,p);near(source.x,mesh.vertices[i*2]);near(source.y,mesh.vertices[i*2+1]);});
 const pose=C.sample(doc,doc.actions[2],doc.actions[2].duration/2,{seek:true}),geometry=C.geometry(doc,layer,pose,base),posed=T.vertexPoints(doc,layer,mesh,pose);
 posed.forEach((p,i)=>{const expected=C.point(matrix,geometry.positions[i*3]*1024,-geometry.positions[i*3+1]*1024);near(p.x,expected.x);near(p.y,expected.y);});
 assert.ok(posed.some((p,i)=>Math.hypot(p.x-rest[i].x,p.y-rest[i].y)>1));
});
test('dragging joints converts through a rotated and scaled parent, and bone picking has a screen-space radius',()=>{
 const doc=fixture();doc.characterRig.bones[0].rotation=32;doc.characterRig.bones[0].scale=1.4;C.validate(doc);T.moveJoint(doc,'elbow',{x:700,y:410});const p=C.point(C.compile(doc.characterRig).rest.get('elbow'),0,0);near(p.x,700);near(p.y,410);assert.equal(T.pick(doc,{x:709,y:410},1),'elbow');assert.equal(T.pick(doc,{x:709,y:410},2),null);
 T.moveJoint(doc,'root',{x:500,y:600});near(doc.characterRig.bones[0].x,500);near(doc.characterRig.bones[0].y,600);
});
test('painted weights change actual bone deformation and remain valid after native import',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',2,2);doc.characterRig.meshes=[m];const pose=C.sample(doc,doc.actions[2],doc.actions[2].duration/2,{seek:true}),base=require('../dist/renderer/runtime-model.js').placement(doc,layer),before=C.geometry(doc,layer,pose,base).positions;
 T.paint(m,'elbow',[{x:512,y:768}],{radius:100,strength:1,mode:'replace',value:1});C.validate(doc);const after=C.geometry(doc,layer,pose,base).positions;assert.ok(Math.hypot(after[12]-before[12],after[13]-before[13])>.01);m.weights.forEach(normalized);
 const I=require('../dist/renderer/character-animation-import.js'),next=I.createRegistry().convert('cardscape',I.pack(doc),doc);assert.deepEqual(next.characterRig.meshes[0].weights,m.weights);
});
test('pie sectors preserve influence proportions and identify the matching stable bone color',()=>{
 const ws=[{boneId:'root',weight:.6},{boneId:'elbow',weight:.4}],slices=T.slices(ws);near(slices[0].end-slices[0].start,Math.PI*1.2);near(slices[1].end,Math.PI*1.5);
 for(const s of slices){const angle=(s.start+s.end)/2;assert.equal(T.sector(ws,Math.cos(angle),Math.sin(angle)),s.boneId);}
 assert.equal(T.boneColor(fixture(),'root'),T.boneColor({characterRig:{bones:[]}},'root'));assert.notEqual(T.boneColor(fixture(),'root'),T.boneColor(fixture(),'elbow'));
});
test('posed picking and brush coordinates follow actual skinning through registered layer transforms',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',2,2);doc.characterRig.meshes=[m];layer.rotation=27;layer.scale=1.3;layer.x=22;layer.y=-31;m.weights=m.weights.map(()=>[{boneId:'elbow',weight:1}]);
 const pose=C.sample(doc,doc.actions[2],doc.actions[2].duration/2,{seek:true}),points=T.vertexPoints(doc,layer,m,pose),rest=T.vertexPoints(doc,layer,m),base=require('../dist/renderer/runtime-model.js').placement(doc,layer),g=C.geometry(doc,layer,pose,base);
 const expected=C.point(C.matrix(512+base.x,768+base.y,base.rotation*180/Math.PI,base.scale),g.positions[12]*1024,-g.positions[13]*1024);near(points[4].x,expected.x);near(points[4].y,expected.y);assert.ok(Math.hypot(rest[4].x-points[4].x,rest[4].y-points[4].y)>10);
 const before=structuredClone(m.weights),uv=[...m.uv];T.paint(m,'root',[points[4]],{points,selection:new Set([4]),radius:5000,strength:.4,feather:0});near(m.weights[4].find(w=>w.boneId==='root').weight,.4);for(let i=0;i<m.weights.length;i++)if(i!==4)assert.deepEqual(m.weights[i],before[i]);assert.deepEqual(m.uv,uv);
 assert.deepEqual(T.box(points,{x:points[4].x-.1,y:points[4].y-.1},{x:points[4].x+.1,y:points[4].y+.1}),new Set([4]));
});
test('screen decluttering always keeps selected pies and multi-selection summaries include zero influence',()=>{
 const points=[{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:40,y:40}],selected=new Set([0,1]);assert.deepEqual(T.displayVertices(points,[0,1,2,3],selected,1,14),[0,1,3]);assert.deepEqual(T.displayVertices(points,[0,1,2,3],selected,20,14),[0,1,2,3]);
 const summary=T.summary({weights:[[{boneId:'a',weight:1}],[{boneId:'b',weight:1}]]},new Set([0,1]));assert.deepEqual(summary.get('a'),{min:0,max:1,average:.5});
});
test('feather has a full-strength inner circle and a bounded outer circle while locks remain exact',()=>{
 near(T.falloff(0,100,.5),1);near(T.falloff(50,100,.5),1);near(T.falloff(75,100,.5),.25);near(T.falloff(100,100,.5),0);near(T.falloff(99,100,0),1);
 const m=A.grid('body','root',2,2);m.weights=m.weights.map(()=>[{boneId:'root',weight:.3},{boneId:'shoulder',weight:.7}]);T.paint(m,'elbow',[{x:512,y:768}],{radius:900,strength:1,feather:.5,locked:new Set(['root'])});near(m.weights[4].find(w=>w.boneId==='root').weight,.3);m.weights.forEach(normalized);
});
test('stroke resampling is independent of pointer event segmentation and ignores stationary events',()=>{
 const a=T.strokeSampler(60),b=T.strokeSampler(60),one=[...a.sample({x:0,y:0}),...a.sample({x:100,y:0})],many=[...b.sample({x:0,y:0}),...b.sample({x:17,y:0}),...b.sample({x:17,y:0}),...b.sample({x:61,y:0}),...b.sample({x:100,y:0})];assert.equal(one.length,many.length);one.forEach((p,i)=>{near(p.x,many[i].x);near(p.y,many[i].y);});
});
test('batch copy, paste, prune and smoothing preserve locks and unselected vertices',()=>{
 const m=A.grid('body','root',2,2),selection=new Set([1,2]),locked=new Set(['root']);m.weights=m.weights.map(()=>[{boneId:'root',weight:.3},{boneId:'shoulder',weight:.695},{boneId:'elbow',weight:.005}]);const before=structuredClone(m.weights);
 T.prune(m,.01,locked,selection);near(m.weights[1].find(w=>w.boneId==='root').weight,.3);assert.ok(!m.weights[1].some(w=>w.boneId==='elbow'));assert.deepEqual(m.weights[0],before[0]);
 const copied=T.copy(m,new Set([1]));T.paste(m,new Set([0,3,4]),copied,locked);assert.deepEqual(m.weights[0],m.weights[1]);assert.deepEqual(m.weights[5],before[5]);const snapshot=structuredClone(m);assert.throws(()=>T.paste(m,new Set([0,1,2]),[copied[0],copied[0]],locked));assert.deepEqual(m,snapshot);
 T.smooth(m,locked,new Set([4]));near(m.weights[4].find(w=>w.boneId==='root').weight,.3);assert.deepEqual(m.weights[5],before[5]);m.weights.forEach(normalized);
});
test('each bone owns its tip independently of parent links, source pixels and deformation',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),m=A.grid('body','root',2,2);doc.characterRig.meshes=[m];doc.characterRig.bones[0].rotation=34;doc.characterRig.bones[0].scale=1.2;C.validate(doc);const rest=C.compile(doc.characterRig).rest,origin=C.point(rest.get('elbow'),0,0),tip=C.point(rest.get('elbow'),120,40),pose=C.sample(doc,doc.actions[2],.5,{seek:true}),base=require('../dist/renderer/runtime-model.js').placement(doc,layer),before=C.geometry(doc,layer,pose,base).positions;
 T.moveTip(doc,'elbow',tip);const segment=T.segments(doc).find(s=>s.id==='elbow');near(segment.p.x,origin.x);near(segment.p.y,origin.y);near(segment.tip.x,tip.x);near(segment.tip.y,tip.y);near(doc.characterRig.bones[2].tip[0],120);near(doc.characterRig.bones[2].tip[1],40);assert.deepEqual(C.geometry(doc,layer,C.sample(doc,doc.actions[2],.5,{seek:true}),base).positions,before);
 const I=require('../dist/renderer/character-animation-import.js'),next=I.createRegistry().convert('cardscape',I.pack(doc),doc);assert.deepEqual(next.characterRig.bones[2].tip,doc.characterRig.bones[2].tip);doc.characterRig.bones[2].tip=[Infinity,0];assert.throws(()=>C.validate(doc));
});
test('triangle raster transforms map source UV corners exactly to posed mesh corners',()=>{
 const source=[{x:3,y:8},{x:100,y:15},{x:40,y:160}],target=[{x:12,y:-3},{x:85,y:41},{x:-50,y:155}],matrix=T.triangleTransform(source,target);source.forEach((p,i)=>{const q=C.point(matrix,p.x,p.y);near(q.x,target[i].x);near(q.y,target[i].y);});assert.equal(T.triangleTransform([source[0],source[0],source[1]],target),null);
});
test('weight test poses deform actual mesh positions and changing weights changes that deformation without recording animation',()=>{
 const doc=fixture(),layer=doc.layers.find(l=>l.id==='body'),mesh=A.grid('body','root',2,2);doc.characterRig.meshes=[mesh];const actions=structuredClone(doc.actions),draft=T.testAction(doc,doc.actions[0],'elbow',0,35),pose=C.sample(doc,draft,0,{seek:true}),base=require('../dist/renderer/runtime-model.js').placement(doc,layer),before=C.geometry(doc,layer,pose,base).positions;
 mesh.weights[4]=[{boneId:'elbow',weight:1}];const after=C.geometry(doc,layer,pose,base).positions;assert.ok(Math.hypot(after[12]-before[12],after[13]-before[13])>.05);assert.deepEqual(doc.actions,actions);assert.notDeepEqual(draft.boneTracks.elbow.rotation,doc.actions[0].boneTracks.elbow.rotation);
});
test('testing an IK-driven bone temporarily disables its constraint in the preview action only',()=>{
 const doc=fixture();doc.characterRig.constraints=[{id:'aim',name:'aim',rootId:'shoulder',tipId:'elbow',end:[100,0],target:[800,500],mix:1,bend:1}];C.validate(doc);const draft=T.testAction(doc,doc.actions[0],'elbow',0,-20);assert.equal(draft.ikTracks.aim.mix[0].value,0);assert.equal(doc.characterRig.constraints[0].mix,1);assert.equal(doc.actions[0].ikTracks,undefined);assert.throws(()=>T.testAction(doc,doc.actions[0],'missing',0,20));
});
