const test=require('node:test'),assert=require('node:assert/strict');
const U=require('../renderer/character-mesh-tools.js'),C=require('../renderer/character-animation-model.js'),T=require('../renderer/character-weight-tools.js'),{fixture}=require('./fixtures/character-animation.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),point=(m,i)=>({x:m.vertices[i*2],y:m.vertices[i*2+1]});
const covers=(m,p)=>m.triangles.some((_,j)=>j%3===0&&U.bary(p,...m.triangles.slice(j,j+3).map(i=>point(m,i)))?.every(v=>v>=-1e-7));
function field(){const m=C.advanced.grid('body','root',2,2);m.weights=m.weights.map((_,i)=>[{boneId:'root',weight:1-m.vertices[i*2]/1024},{boneId:'elbow',weight:m.vertices[i*2]/1024}].filter(w=>w.weight>0));m.depths=m.weights.map((_,i)=>m.vertices[i*2]/1024*.1);m.morphs=[{expressionId:'smile',deltas:m.weights.flatMap((_,i)=>[i,m.vertices[i*2]/1024*4,m.vertices[i*2+1]/1536*2])}];return m;}
test('alpha tracing includes every edge pixel, concavities, transparent holes and disconnected islands',()=>{
 const w=128,h=128,alpha=new Uint8Array(w*h);for(let y=4;y<110;y++)for(let x=3;x<65;x++)if(x<24||y>77)alpha[y*w+x]=255;for(let y=6;y<34;y++)for(let x=90;x<121;x++)if(!(x>99&&x<110&&y>13&&y<24))alpha[y*w+x]=255;
 const m=U.generate(alpha,w,h,{cell:4,spacing:18,features:[{x:13,y:45}],maxVertices:500});for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha[y*w+x])assert.ok(covers(m,{x:x+.5,y:y+.5}),`lost alpha ${x},${y}`);assert.equal(covers(m,{x:60,y:45}),false);assert.equal(covers(m,{x:79,y:65}),false);assert.ok(m.vertices.some(v=>!Number.isInteger(v)));assert.deepEqual(m,U.generate(alpha,w,h,{cell:4,spacing:18,features:[{x:13,y:45}],maxVertices:500}));
 for(let j=0;j<m.triangles.length;j+=3){const [a,b,c]=m.triangles.slice(j,j+3).map(i=>point(m,i));assert.ok((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<-1e-8);}
});
test('diagonally touching opaque pixels and thin border wisps retain conservative coverage',()=>{
 const alpha=new Uint8Array(64*64);for(let i=0;i<64;i++){alpha[i*64+i]=1;alpha[i*64]=1;}const m=U.generate(alpha,64,64,{cell:2,spacing:16,maxVertices:1000});for(let i=0;i<64;i++){assert.ok(covers(m,{x:i+.5,y:i+.5}));assert.ok(covers(m,{x:.5,y:i+.5}));}
});
test('retopology transfers continuous weights, depth and sparse facial morphs without changing old UVs',()=>{
 const old=field(),snapshot=structuredClone(old),top={vertices:[20,25,990,50,900,1440,45,1410,470,630],uv:[20/1024,25/1536,990/1024,50/1536,900/1024,1440/1536,45/1024,1410/1536,470/1024,630/1536],triangles:[0,4,1,1,4,2,2,4,3,3,4,0]},m=U.transfer(old,top);
 m.weights.forEach((ws,i)=>{near(ws.reduce((sum,w)=>sum+w.weight,0),1);near(ws.find(w=>w.boneId==='elbow').weight,m.vertices[i*2]/1024);near(m.depths[i],m.vertices[i*2]/1024*.1);near(m.morphs[0].deltas[i*3+1],m.vertices[i*2]/1024*4);near(m.morphs[0].deltas[i*3+2],m.vertices[i*2+1]/1536*2);});assert.deepEqual(old,snapshot);
});
test('inserting inside a triangle or on a shared edge preserves manifold area and interpolates attributes',()=>{
 for(const p of [{x:210,y:250},{x:256,y:384}]){const m=field(),count=m.weights.length,index=U.insert(m,p);assert.equal(index,count);near(m.weights[index].find(w=>w.boneId==='elbow').weight,p.x/1024);near(m.depths[index],p.x/1024*.1);assert.equal(m.morphs[0].deltas.at(-3),index);assert.equal(new Set(m.triangles).size,m.weights.length);for(let y=0;y<1536;y+=100)for(let x=0;x<1024;x+=100)assert.ok(covers(m,{x:x+.1,y:y+.1}));}
});
test('moving topology keeps original UV registration and refuses folded triangles',()=>{
 const m=field();U.move(m,4,{x:530,y:790});near(m.uv[8],530/1024);near(m.uv[9],790/1536);const snapshot=structuredClone(m);assert.throws(()=>U.move(m,4,{x:1024,y:0}),/翻转|压平/);assert.deepEqual(m,snapshot);
});
test('deleting an internal point closes the hole and remaps morph indices and depths',()=>{
 const m=field(),index=U.insert(m,{x:200,y:250});U.erase(m,index);assert.equal(m.weights.length,9);assert.equal(m.depths.length,9);assert.ok(m.triangles.every(i=>i>=0&&i<9));assert.ok(m.morphs[0].deltas.every((v,j)=>j%3||v<9));assert.ok(covers(m,{x:200,y:250}));U.erase(m,0);assert.equal(m.weights.length,8);assert.ok(m.triangles.every(i=>i>=0&&i<8));
});
test('edge flipping changes connectivity only and shared groups require matching registered placement',()=>{
 const m=field(),before=structuredClone(m);U.flip(m,1,3);assert.notDeepEqual(m.triangles,before.triangles);assert.deepEqual(m.weights,before.weights);assert.deepEqual(m.uv,before.uv);assert.deepEqual(m.morphs,before.morphs);assert.throws(()=>U.flip(m,0,1),/内部边/);
 const d=fixture();d.characterRig.meshes=[m,{...structuredClone(m),layerId:'forearm'}];assert.equal(U.shared(d,d.layers.find(l=>l.id==='body')).length,2);d.layers.find(l=>l.id==='forearm').x=10;assert.equal(U.shared(d,d.layers.find(l=>l.id==='body')).length,1);
});
test('irregular topology remains a portable native mesh with no new runtime fields',()=>{
 const d=fixture(),alpha=new Uint8Array(1024*1536);for(let y=140;y<1100;y++)for(let x=220;x<800;x++)if(x>380||y>740)alpha[y*1024+x]=255;const topology=U.generate(alpha,1024,1536,{spacing:64,cell:16,maxVertices:700}),m=U.transfer(C.advanced.grid('body','root',2,2),topology);d.characterRig.meshes=[m];C.validate(d);const I=require('../renderer/character-animation-import.js'),next=I.createRegistry().convert('cardscape',I.pack(d),d);assert.deepEqual(next.characterRig.meshes[0],m);assert.ok(m.weights.length<700);assert.ok(m.weights.every(ws=>ws.length<=4));const layer=d.layers.find(l=>l.id==='body'),points=T.vertexPoints(d,layer,m,C.rest(d));points.forEach((p,i)=>{assert.ok(Math.hypot(p.x-m.vertices[i*2],p.y-m.vertices[i*2+1])<.0001);});
});
test('linked cut layers can inherit a shared facial field without changing weights and conflicting targets fail atomically',()=>{
 const source=field(),other={...structuredClone(source),layerId:'forearm',morphs:[]},weights=structuredClone(other.weights);U.inheritMorphs([source,other]);assert.deepEqual(other.morphs,source.morphs);assert.notEqual(other.morphs[0].deltas,source.morphs[0].deltas);assert.deepEqual(other.weights,weights);
 other.morphs[0].deltas[1]+=1;const before=structuredClone([source,other]);assert.throws(()=>U.inheritMorphs([source,other]),/不同/);assert.deepEqual([source,other],before);
});
