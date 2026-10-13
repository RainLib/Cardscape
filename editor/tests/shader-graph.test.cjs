const {test}=require('node:test'),assert=require('node:assert/strict');
const G=require('../renderer/shader-graph-model.js'),R=require('../renderer/runtime-model.js');
const {portableBody}=require('../electron/godot-export.cjs');
const doc=()=>R.ensure({schema:'card-atelier/1',id:'nodes',name:'Nodes',width:1024,height:1536,layers:[],masks:{},effects:{}});
test('both graph stages compile into portable hooks and survive document serialization',()=>{
 for(const stage of ['geometry','fragment'])for(const preset of ['original','wave']){
  const graph=G.preset(stage,preset),body=G.compile(graph),d=doc();
  d.shader={...d.shader,editorMode:'nodes',graphs:{[stage]:graph},[stage+'Body']:body};
  assert.doesNotThrow(()=>R.validate(d));assert.equal(portableBody(body),body);
  const saved=JSON.parse(JSON.stringify(d));assert.equal(G.compile(saved.shader.graphs[stage]),body);
  assert.match(stage==='geometry'?R.vertex(body):R.fragmentSource(body),new RegExp(body.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
});
test('graph links are typed; duplicate inputs and wrong stage are rejected before GPU compilation',()=>{
 const g=G.preset('fragment');g.links[0][5]='float';assert.throws(()=>G.compile(g),/类型/);
 const d=G.preset('fragment');d.links.push([2,1,0,2,0,'vec4']);assert.throws(()=>G.compile(d),/重复/);
 const v=G.preset('fragment');v.stage='geometry';assert.throws(()=>G.compile(v),/类型/);
 const n=G.preset('geometry');n.nodes.push({...n.nodes[0],id:99,type:'unknown'});assert.throws(()=>G.compile(n),/类型/);
});
test('missing connections, multiple outputs and disconnected cycles cannot replace the last shader',()=>{
 const g=G.preset('fragment');g.links=[];assert.throws(()=>G.compile(g),/请连接/);
 const d=G.preset('fragment');d.nodes.push({...d.nodes[1],id:3});assert.throws(()=>G.compile(d),/只能/);
 const cycle=G.preset('fragment');cycle.nodes.push({id:3,type:'card/math/sin',pos:[0,0],properties:{}},{id:4,type:'card/math/sin',pos:[0,0],properties:{}});cycle.links.push([2,3,0,4,0,'float'],[3,4,0,3,0,'float']);assert.throws(()=>G.compile(cycle),/循环/);
});
test('bounded properties cannot inject GLSL and generated code uses only connected nodes',()=>{
 const graph=G.preset('fragment','wave'),tint=graph.nodes.find(n=>n.type==='card/value/color');tint.properties.color='vec3(1);';assert.throws(()=>G.compile(graph),/颜色/);
 tint.properties.color='#40ccff';const scalar=graph.nodes.find(n=>n.type==='card/value/float');scalar.properties.value=Infinity;assert.throws(()=>G.compile(graph),/数值/);
 const small=G.preset('fragment');small.nodes.push({id:99,type:'card/input/time',pos:[100,100],properties:{}});assert.doesNotMatch(G.compile(small),/sg99/);
});
test('manual GLSL edits preserve the saved graph as a separate authoring representation',()=>{
 const d=doc(),graph=G.preset('fragment','wave');d.shader={...d.shader,graphs:{fragment:graph},editorMode:'nodes',fragmentBody:G.compile(graph)};
 const before=JSON.parse(JSON.stringify(d));d.shader={...d.shader,editorMode:'glsl',fragmentBody:'return vec4(color.rgb * 0.5, color.a);'};R.validate(d);
 assert.deepEqual(d.shader.graphs,before.shader.graphs);assert.notEqual(d.shader.fragmentBody,G.compile(d.shader.graphs.fragment));
 d.shader=before.shader;assert.equal(d.shader.fragmentBody,G.compile(d.shader.graphs.fragment));
});
