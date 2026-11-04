const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../dist/renderer/runtime-model.js'),F=require('../dist/renderer/frame-model.js'),A=require('../dist/renderer/character-animation-model.js');
const {irregular}=require('./fixtures/irregular-card.cjs');
test('concave card outlines and multiple windows share pixel registration and closed side geometry',()=>{
 const doc=irregular();R.validate(doc);const s=F.resolve(doc),g=F.geometry(s),data=F.contourUniforms(s);
 assert.equal(data.counts[0],9);assert.equal(data.counts[1],18);
 assert.equal(F.contains(s,0,0),false);assert.equal(F.contains(s,512,740),true);assert.equal(F.contains(s,512,400,s.width),true);assert.equal(F.contains(s,512,1100,s.width),true);assert.equal(F.contains(s,512,740,s.width),false);
 assert.equal(g.sides.indices.length/3,36);assert.ok(g.rim.indices.length/3>2,'true bevel cap replaces the flat clipping quad');
 for(const mesh of [g.rim,g.rear,g.sides]){assert.ok(mesh.positions.every(Number.isFinite));assert.equal(mesh.weights.length,mesh.positions.length/3*4);assert.ok(mesh.indices.every(i=>i<mesh.positions.length/3));}
 assert.deepEqual(s.contour,doc.frameStyle.contour);assert.equal(F.hasAura(s),false);
});
test('bad contours fail atomically: crossing, touching, outside windows and bounded complexity',()=>{
 const doc=irregular(),original=JSON.stringify(doc);
 for(const change of [c=>c.windows.push(c.windows[0]),c=>c.windows[0][0]=[0,0],c=>c.windows[0]=[[200,200],[800,600],[800,200],[200,600]],c=>c.outline[0]=[NaN,0],c=>c.outline[0]=c.outline[1],c=>c.windows[0]=Array.from({length:61},(_,i)=>[512+100*Math.cos(i),500+100*Math.sin(i)])]){
  const next=structuredClone(doc);change(next.frameStyle.contour);assert.throws(()=>R.validate(next),/轮廓|窗口/);
 }
 assert.equal(JSON.stringify(doc),original);
});
test('draw order seeks deterministically, loops, preserves unrelated slots and validates references',()=>{
 const d=irregular(),base=[...d.layers].reverse(),a=d.actions[0],order=t=>R.orderedLayers(base,a,R.action(d,a.id,t).progress).map(l=>l.id);
 assert.ok(order(.9).indexOf('body')<order(.9).indexOf('forearm'));assert.ok(order(1).indexOf('body')>order(1).indexOf('forearm'));assert.deepEqual(order(2.2),order(.2));assert.deepEqual(order(1.8),order(1.1));
 for(const frame of [{at:.2,layers:['missing']},{at:.2,layers:['body','body']},{at:.2,layers:['frame']},{at:2,layers:[]}]){const bad=structuredClone(d);bad.actions[0].drawOrder=[frame];assert.throws(()=>R.validate(bad),/层序/);}
 for(const v of [NaN,-1,3,'1']){const bad=structuredClone(d);bad.actions[0].transitionDuration=v;assert.throws(()=>R.validate(bad),/过渡/);}
});
test('transitions mix local channels, maintain exact endpoints and allow continuous interruption',()=>{
 const d=irregular(),from=R.snapshotAction(d,d.actions[0],.3),to=R.snapshotAction(d,d.actions[1],.2),mid=R.blendActions(from,to,.5);
 for(const [w,expected] of [[0,from],[1,to]]){const mixed=R.blendActions(from,to,w);const a=A.sample(d,mixed,0),b=A.sample(d,expected,0);for(const [id,p]of a.bones)assert.deepEqual(p,b.bones.get(id));}
 assert.equal(R.action({actions:[mid]},mid.id,0).x,44);assert.equal(A.local(mid,'elbow',0).rotation,-18);
 const frozen=R.snapshotAction(d,mid,0),interrupted=R.blendActions(frozen,from,0);assert.deepEqual(A.local(interrupted,'elbow',0),A.local(mid,'elbow',0));
 const rig=A.compile(d.characterRig),pose=A.sample(d,mid,0),root=pose.bones.get('shoulder').world,tip=pose.bones.get('elbow').world;assert.ok(Math.abs(Math.hypot(tip[4]-root[4],tip[5]-root[5])-160)<1e-9);
 assert.ok(rig.order.length>0);
});
test('FFD transitions preserve sparse vertex indices while fading missing tracks to rest',()=>{
 const d=irregular();d.characterRig.meshes=[{layerId:'body',vertices:[0,0,10,0,0,10],uv:[0,0,1,0,0,1],triangles:[0,1,2],weights:Array.from({length:3},()=>[{boneId:'root',weight:1}]),morphs:[]}];
 d.actions[0].deformTracks={body:{root:[{at:0,deltas:[2,12,-8]}]}};
 const from=R.snapshotAction(d,d.actions[0],.2),to=R.snapshotAction(d,d.actions[1],.2),mid=R.blendActions(from,to,.5),pose=A.sample(d,mid,0);
 assert.deepEqual(Array.from(pose.deforms.get('body').get('root')),[0,0,0,0,6,-4]);
 assert.deepEqual(A.sample(d,R.blendActions(from,to,0),0).deforms,A.sample(d,d.actions[0],.2).deforms);
});
