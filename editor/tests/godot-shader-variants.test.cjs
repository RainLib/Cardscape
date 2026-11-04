const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const R=require('../dist/renderer/runtime-model.js'),F=require('../dist/renderer/frame-model.js'),W=require('../dist/renderer/workshop-model.js');
const {exportGodot}=require('../dist/electron/godot-export.cjs');
const {fixture}=require('./fixtures/character-animation.cjs');
async function exported(body,run){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'card-godot-variants-'));
 try{
  const doc=fixture();doc.frameStyle={...F.defaults};
  doc.frameStyles=['glow','halloween-stickers','glow'].map(finish=>({...F.defaults,finish}));
  if(body)doc.shader={...R.defaults.shader,fragmentBody:body,fragmentStrength:1};
  const manifest={...structuredClone(doc),backAsset:doc.back,layers:doc.layers.map(l=>({...l,asset:l.src})),masks:[]};
  const result=await exportGodot(directory,W.create(doc,'variants',doc.id),new Map([[doc.id,manifest]]));
  const tres=await fs.readFile(path.join(result.directory,'library.tres'),'utf8');
  const catalog=JSON.parse(JSON.parse(tres.match(/^data_json = (".*")$/m)[1]));
  await run({result,tres,catalog,key:catalog.cards[0].shader_key,files:await fs.readdir(path.join(result.directory,'shaders'))});
 }finally{await fs.rm(directory,{recursive:true,force:true});}
}
test('native exports specialize used finishes once and retain a full fallback without changing logical shader count',async()=>{
 await exported(null,async({result,tres,key,files})=>{
  assert.equal(result.shaderCount,1);assert.equal(result.shaderVariantCount,3);assert.equal(files.length,4);
  const read=name=>fs.readFile(path.join(result.directory,'shaders',name),'utf8');
  const full=await read(key+'.gdshader');assert.ok(full.includes('vec3 rimChain('));
  const uniforms=source=>[...source.matchAll(/^uniform[^\n]+/gm)].map(match=>match[0]);
  for(const index of [1,2,24])assert.deepEqual(uniforms(await read(key+'-finish-'+index+'.gdshader')),uniforms(full),'variant switches retain the complete uniform contract');
  for(const index of [1,2,24])assert.ok(tres.includes('"'+key+':finish:'+index+'"'));
  assert.ok(!(await read(key+'-finish-1.gdshader')).includes('vec3 rimChain('));
  assert.ok((await read(key+'-finish-24.gdshader')).includes('vec4 rimHalloweenStickers('));
  assert.ok((await read(key+'-finish-1.gdshader')).length<full.length*.65);
 });
});
test('a custom hook selecting another rim keeps its complete native program',async()=>{
 const body='return vec4(rimCoverage(uv,vec4(.02,.1,.03,.005),12.));';
 await exported(body,async({result,key,files})=>{
  assert.equal(result.shaderCount,1);assert.equal(result.shaderVariantCount,0);assert.deepEqual(files,[key+'.gdshader']);
  const source=await fs.readFile(path.join(result.directory,'shaders',files[0]),'utf8');
  assert.ok(source.includes(body));assert.ok(source.includes('vec3 rimChain('));
 });
});
