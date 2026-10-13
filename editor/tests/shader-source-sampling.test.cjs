const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const R=require('../renderer/runtime-model.js'),W=require('../renderer/workshop-model.js');
const {exportRuntime}=require('../electron/runtime-export.cjs'),{exportGodot,portableBody}=require('../electron/godot-export.cjs');
const body='return displacedSource(uv, time);';
const prelude='vec4 displacedSource(vec2 uv, float time){return sampleSource(uv + vec2(.005 * sin(time), 0.0));}';

test('portable source sampling is available before user helpers without allowing raw WebGL texture syntax',()=>{
 assert.equal(portableBody(body),body);assert.equal(portableBody(prelude),prelude);
 assert.throws(()=>portableBody('return texture2D(tex, uv);'),/Godot SDK/);
 assert.throws(()=>portableBody('uniform sampler2D extra;'),/Godot SDK/);
 for(const diagnostic of [false,true]){
  const shader=R.fragmentSource(body,diagnostic,prelude);
  assert.ok(shader.indexOf('vec4 sampleSource(')<shader.indexOf(prelude));
  assert.equal(shader.match(/vec4 sampleSource\(/g).length,1);
 }
});

test('saved sampling hooks export to WebGL and Godot with one source texture and registered source window',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'card-source-sampling-'));
 try{
  const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
  const original=R.ensure({schema:'card-atelier/1',id:'source-sampling',name:'Source sampling',width:1024,height:1536,previewMode:'authored',layers:[{id:'source',kind:'image',src,visible:true,sourceWindow:{x:20,y:30,width:1024,height:1536},shaderTransparent:true}],masks:{},shader:{...R.defaults.shader,fragmentBody:body,fragmentPrelude:prelude,fragmentTarget:'all',fragmentMask:'none'}});
  const doc=JSON.parse(JSON.stringify(original)),web=path.join(directory,'web');await fs.mkdir(web);
  await exportRuntime(web,doc,{call(){throw Error('Unexpected image processing');}});
  const webShader=await fs.readFile(path.join(web,'shaders/card.frag.glsl'),'utf8');
  assert.ok(webShader.includes(prelude));assert.ok(webShader.includes(body));
  assert.match(webShader,/sourceRect\.xy\+\(uv\+shift\)\*sourceRect\.zw/);
  assert.match(webShader,/if\(back>\.5\)coord\.x=1\.-coord\.x/);
  const manifest={...structuredClone(doc),layers:doc.layers.map(layer=>({...layer,asset:layer.src})),masks:[]};
  const result=await exportGodot(directory,W.create(doc,'sampling-workshop',doc.id),new Map([[doc.id,manifest]]));
  assert.equal(result.textures,1);assert.equal(result.shaderCount,1);
  const files=await fs.readdir(path.join(result.directory,'shaders')),shader=await fs.readFile(path.join(result.directory,'shaders',files[0]),'utf8');
  assert.ok(shader.includes(prelude));assert.ok(shader.includes(body));
  assert.ok(shader.indexOf('vec4 sampleSource(')<shader.indexOf(prelude));
  assert.match(shader,/background\?\(uv-\.5\)\*background_extent\+\.5:uv/);
  assert.match(shader,/source_rect\.xy\+registered\*source_rect\.zw/);
  assert.match(shader,/if\(back_side\)\{coord\.x=1\.0-coord\.x;\}/);
  const tres=await fs.readFile(path.join(result.directory,'library.tres'),'utf8'),data=JSON.parse(JSON.parse(tres.match(/^data_json = (".*")$/m)[1]));
  assert.deepEqual(data.cards[0].layers[0].sourceWindow,doc.layers[0].sourceWindow);
  assert.equal(data.cards[0].layers[0].shaderTransparent,true);
  assert.equal(data.cards[0].shader.fragmentBody,body);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
