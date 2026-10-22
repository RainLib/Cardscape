const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {NativeWorker}=require('../dist/electron/native-client.cjs');
const {createServices,validateProject}=require('../dist/electron/services.cjs');
async function tinyMask(worker,weights=[0,1,1,0]){return worker.call('bake_mask',{width:32,height:48,uv:[0,0,1,0,1,1,0,1],weights,indices:[0,1,2,0,2,3]});}
test('native PNG pipeline, rigid guard, resize and shared topology',async()=>{
  const w=new NativeWorker();try{
    assert.equal((await w.call('ping')).engine,'rust');
    const mask=await tinyMask(w),white=await tinyMask(w,[1,1,1,1]);
    const original=await w.call('mask_stats',{image:mask.image});assert.equal(original.width,32);assert.ok(original.mean>.45&&original.mean<.55);
    const guarded=await w.call('feather',{image:mask.image,guard:white.image,radius:4});assert.equal((await w.call('mask_stats',{image:guarded.image})).active_pixels,0);
    const small=await w.call('resize',{image:mask.image,width:16,height:24});assert.equal((await w.call('mask_stats',{image:small.image})).width,16);
    const mesh=await w.call('mesh',{bounds:[.2,.3,.7,.8],subdivisions:12});assert.equal(mesh.triangles,288);assert.equal(mesh.uv.length,338);assert.equal(mesh.separate_render_surface,false);
    await assert.rejects(w.call('resize',{image:mask.image,width:8192,height:8192}),/budget/);
    await assert.rejects(w.call('feather',{image:mask.image,guard:small.image}),/dimensions/);
    w.cancel();assert.equal((await w.call('ping')).engine,'rust');
  }finally{w.close();}
});
test('portable document save/open and export preserve editable masks',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-atelier-test-')),s=createServices({runtimeDir:dir});
  try{
    const png=(await tinyMask(s.worker)).image;
    const document={schema:'card-atelier/1',name:'test',width:1024,height:1536,masks:{motion:png},effects:{depth:1},layers:[{id:'foreground',name:'主体',kind:'foreground',src:png,x:0,y:0,scale:1,opacity:1,visible:true}],meshGuides:[]};
    await s.invoke('save',{document});const opened=await s.invoke('open');assert.deepEqual(opened.document,document);
    const result=await s.invoke('export',{document,front:png});assert.equal(JSON.parse(await fs.readFile(path.join(result.directory,'manifest.json'))).uvOrigin,'top-left');
    assert.ok((await fs.readFile(path.join(result.directory,'masks/motion.png'))).length>0);
    await assert.rejects(s.invoke('process',{op:'shell',args:{}}),/不支持/);
    assert.throws(()=>validateProject({...document,layers:[{...document.layers[0],id:'../../escape'}]}),/ID/);
  }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('selection extraction, subtraction and text/font export stay portable',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-authoring-test-')),s=createServices({runtimeDir:dir});
  try{
    const black=await tinyMask(s.worker,[0,0,0,0]),white=await tinyMask(s.worker,[1,1,1,1]);
    const selection=await s.invoke('process',{op:'selection',args:{image:white.image,points:[[4,4],[28,4],[28,44],[4,44]],feather:1}});
    const motion=await s.invoke('process',{op:'mask_combine',args:{image:black.image,selection:selection.image,gradient:'down',mode:'replace'}});
    const stats=await s.worker.call('mask_stats',{image:motion.image});assert.ok(stats.mean>0&&stats.mean<.5);
    const subtract=await s.worker.call('mask_combine',{image:white.image,selection:selection.image,mode:'subtract'});assert.ok((await s.worker.call('mask_stats',{image:subtract.image})).mean<1);
    await assert.rejects(s.worker.call('mask_combine',{image:black.image,selection:selection.image,gradient:'unsupported'}),/gradient/);
    const font={name:'test-font.ttf',family:'AtelierFont-123',src:'data:font/ttf;base64,AA=='};
    const text={id:'title',name:'标题',kind:'text',text:'sample',x:0,y:0,scale:1,opacity:1,visible:true,textStyle:{fontFamily:font.family,fontSize:114,fontWeight:'700',italic:false,color:'#abcdef',stroke:'#112233',strokeWidth:4,align:'center'}};
    const document={schema:'card-atelier/1',name:'portable',width:1024,height:1536,masks:{motion:motion.image},fonts:[font],effects:{depth:1},layers:[text],meshGuides:[]};
    await s.invoke('save',{document});assert.deepEqual((await s.invoke('open')).document.layers[0].textStyle,text.textStyle);
    const output=await s.invoke('export',{document,front:white.image,layerRasters:{title:white.image}});const manifest=JSON.parse(await fs.readFile(path.join(output.directory,'manifest.json')));assert.equal(manifest.layers[0].asset,'layers/title.png');assert.equal(manifest.fontDependencies[0].embedded,'fonts/AtelierFont-123.ttf');assert.equal((await fs.readFile(path.join(output.directory,'fonts/AtelierFont-123.ttf'))).length,1);
    assert.throws(()=>validateProject({...document,fonts:[{...font,family:'../../bad'}]}),/字体/);
    assert.throws(()=>validateProject({...document,layers:[{...text,textStyle:{...text.textStyle,color:'javascript:bad'}}]}),/文字/);
  }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
