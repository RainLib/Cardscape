const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../dist/renderer/character-mesh-authoring.js'),U=require('../dist/renderer/character-mesh-tools.js'),C=require('../dist/renderer/character-animation-model.js'),I=require('../dist/renderer/character-animation-import.js'),{fixture}=require('./fixtures/character-animation.cjs');
const at=(m,i)=>({x:m.vertices[i*2],y:m.vertices[i*2+1]}),edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
const area=m=>{let sum=0;for(let j=0;j<m.triangles.length;j+=3){const [a,b,c]=m.triangles.slice(j,j+3).map(i=>at(m,i)),v=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);assert.ok(v<-1e-7,'consistent winding / nondegenerate');sum-=v/2;}return sum;};
function grid(){const m=C.advanced.grid('body','root',3,3);m.weights=m.weights.map((_,i)=>[{boneId:'root',weight:1-m.uv[i*2]},{boneId:'elbow',weight:m.uv[i*2]}].filter(w=>w.weight));m.morphs=[{expressionId:'smile',deltas:m.weights.flatMap((_,i)=>[i,m.vertices[i*2]*.002,m.vertices[i*2+1]*.001])}];m.depths=m.weights.map((_,i)=>m.uv[i*2]*.1);return m;}
test('manual concave hull supports either winding, auto fill, pinned corners and crossing rejection',()=>{
 const p=[{x:40,y:40},{x:400,y:40},{x:400,y:220},{x:210,y:220},{x:210,y:600},{x:40,y:600}];
 for(const points of [p,[...p].reverse()]){const m=M.outline(points,{spacing:50,maxVertices:200});assert.ok(m.weights.length>points.length);assert.deepEqual(m.vertices.slice(0,p.length*2),points.flatMap(p=>[p.x,p.y]));assert.equal(m.topology.pins.length,p.length);assert.ok(Math.abs(area(m)-(360*180+170*380))<1e-6);assert.equal(U.locate(m,{x:330,y:400}),null);}
 assert.throws(()=>M.outline([{x:0,y:0},{x:200,y:200},{x:200,y:0},{x:0,y:200}]),/交叉/);assert.throws(()=>M.outline([{x:0,y:0},{x:0,y:0},{x:20,y:20}]),/重合/);assert.throws(()=>M.outline([{x:0,y:0},{x:10,y:10}]),/3–1024/);
});
test('incremental automatic fill preserves every existing sample and pinned point',()=>{
 const m=grid();M.pin(m,[5,10]);M.connect(m,1,14);const old=structuredClone(m),n=m.weights.length,count=M.fill(m,{spacing:110,maxVertices:160});assert.ok(count>0);assert.deepEqual(m.vertices.slice(0,n*2),old.vertices);assert.deepEqual(m.uv.slice(0,n*2),old.uv);assert.deepEqual(m.weights.slice(0,n),old.weights);assert.deepEqual(m.depths.slice(0,n),old.depths);assert.deepEqual(m.morphs[0].deltas.slice(0,old.morphs[0].deltas.length),old.morphs[0].deltas);assert.ok(Math.abs(area(m)-1024*1536)<1e-5);for(const e of m.topology.edges)assert.ok(M.edges(m).has(edge(...e)));for(const i of old.topology.pins)assert.ok(m.topology.pins.includes(i));
 for(let i=n;i<m.weights.length;i++){assert.ok(Math.abs(m.weights[i].reduce((s,w)=>s+w.weight,0)-1)<1e-8);assert.ok(Math.abs(m.depths[i]-m.uv[i*2]*.1)<1e-8);}
});
test('circle and box refinement add points only inside their regions and honor the shared capacity',()=>{
 for(const region of [{kind:'circle',x:520,y:720,radius:100},{kind:'box',x:400,y:600,width:200,height:240}]){const m=grid(),n=m.weights.length;assert.ok(M.fill(m,{spacing:24,region,maxVertices:65})>0);assert.ok(m.weights.length<=65);for(let i=n;i<m.weights.length;i++){const p=at(m,i);assert.ok(region.kind==='circle'?Math.hypot(p.x-region.x,p.y-region.y)<=region.radius:p.x>=region.x&&p.x<=region.x+region.width&&p.y>=region.y&&p.y<=region.y+region.height);}}
 const doc=fixture(),m=grid();doc.characterRig.meshes=Array.from({length:9},(_,i)=>({...structuredClone(m),layerId:'layer'+i}));assert.equal(M.budget(doc,doc.characterRig.meshes),1820);assert.throws(()=>M.fill(m,{spacing:0}),/间距/);assert.throws(()=>M.fill(m,{region:{kind:'circle',x:0,y:0,radius:-1}}),/区域/);
});
test('arbitrary constraint edges recover crossed triangles without changing vertices, weights, UV or area',()=>{
 for(let a=0;a<16;a++)for(let b=a+1;b<16;b++){const m=grid(),old=structuredClone(m),before=area(m),chain=M.connect(m,a,b);assert.equal(chain[0],a);assert.equal(chain.at(-1),b);for(const e of m.topology.edges)assert.ok(M.edges(m).has(edge(...e)));assert.ok(Math.abs(area(m)-before)<1e-6);for(const k of ['vertices','uv','weights','morphs','depths'])assert.deepEqual(m[k],old[k]);assert.equal(new Set(m.triangles).size,m.weights.length);}
});
test('crossing constraints fail atomically; collinear vertices and inserted edge points split constraints',()=>{
 const m=grid();M.connect(m,0,15);const before=structuredClone(m);assert.throws(()=>M.connect(m,3,12),/相交/);assert.deepEqual(m,before);const index=U.insert(m,{x:512/3,y:256},{pin:true});assert.ok(m.topology.edges.some(e=>e.includes(index)));assert.equal(m.topology.edges.length,4);assert.throws(()=>U.erase(m,index),/关键点/);M.pin(m,[index],false);assert.throws(()=>U.erase(m,index),/约束边/);assert.throws(()=>U.flip(m,0,index),/约束边/);M.disconnect(m,0,15);assert.equal(m.topology.edges.length,0);U.erase(m,index);assert.ok(Math.abs(area(m)-1024*1536)<1e-6);
});
test('constraints cannot bridge a concavity or disconnected islands',()=>{
 const m=M.outline([{x:0,y:0},{x:500,y:0},{x:500,y:100},{x:100,y:100},{x:100,y:500},{x:0,y:500}],{spacing:256,maxVertices:6}),before=structuredClone(m);assert.throws(()=>M.connect(m,2,4),/外部|连接|邻域/);assert.deepEqual(m,before);
 const m2=grid();m2.vertices=[0,0,100,0,0,100,300,0,400,0,400,100];m2.uv=m2.vertices.map((v,i)=>v/(i%2?1536:1024));m2.weights=m2.weights.slice(0,6);m2.triangles=[0,2,1,3,5,4];m2.morphs=[];delete m2.depths;assert.throws(()=>M.connect(m2,1,3),/外部|连接/);
});
test('authoring metadata survives native exchange and validation rejects missing or duplicate constraint edges',()=>{
 const d=fixture(),m=grid();d.characterRig.expressions=[{id:'smile',name:'Smile',value:0}];M.connect(m,1,14);M.pin(m,[6]);d.characterRig.meshes=[m];C.validate(d);assert.deepEqual(I.createRegistry().convert('cardscape',I.pack(d),d).characterRig.meshes[0],m);
 const bad=structuredClone(d);bad.characterRig.meshes[0].topology.edges.push([0,15]);assert.throws(()=>C.validate(bad),/约束边/);const bad2=structuredClone(d);bad2.characterRig.meshes[0].topology.pins.push(m.topology.pins[0]);assert.throws(()=>C.validate(bad2),/关键点/);
});
test('shared fill reuses geometry while interpolating each layer own weights and preserving every old sample',()=>{
 const a=grid(),b={...structuredClone(a),layerId:'forearm',weights:a.weights.map(()=>[{boneId:'root',weight:1}])};M.connect(a,1,14);M.connect(b,1,14);const old=structuredClone([a,b]),n=a.weights.length,count=M.fillGroup([a,b],{spacing:120,maxVertices:90});assert.ok(count>0);assert.deepEqual(a.vertices,b.vertices);assert.deepEqual(a.triangles,b.triangles);assert.deepEqual(a.topology,b.topology);for(const [j,m] of [a,b].entries())assert.deepEqual(m.weights.slice(0,n),old[j].weights);assert.ok(b.weights.every(ws=>ws.length===1&&ws[0].boneId==='root'&&ws[0].weight===1));assert.notDeepEqual(a.weights[n],b.weights[n]);
});
test('motion protection rejects unsafe subdivisions while preserving valid existing animation and shared topology',()=>{
 const d=fixture(),m=C.advanced.grid('body','root',1,1);m.weights=m.weights.map((_,i)=>[{boneId:i===0?'elbow':'root',weight:1}]);d.characterRig.meshes=[m];assert.equal(M.quality(d,[m])(m),true);const unguarded=structuredClone(d),bad=unguarded.characterRig.meshes[0];M.fill(bad,{spacing:100,maxVertices:40});assert.equal(M.quality(unguarded,[bad])(bad),false);
 const other={...structuredClone(m),layerId:'forearm',weights:m.weights.map(()=>[{boneId:'root',weight:1}])};d.characterRig.meshes.push(other);const accept=M.quality(d,[m,other]);assert.ok(M.fillGroup([m,other],{spacing:100,maxVertices:40,accept})>0);assert.ok(accept.rejected>0);const after=M.quality(d,[m,other],{steps:48});assert.equal(after(m),true);assert.equal(after(other),true);assert.deepEqual(m.vertices,other.vertices);assert.deepEqual(m.triangles,other.triangles);
});
