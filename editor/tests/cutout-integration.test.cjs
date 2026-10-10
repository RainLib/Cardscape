const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createServices,ROOT,validateProject}=require('../electron/services.cjs');
const {NativeWorker}=require('../electron/native-client.cjs');
test('canceling a buffered image request consumes pipe errors and permits restarting the worker',async()=>{
 const fixture="require('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);process.stdout.write(JSON.stringify({id:r.id,ok:true,result:{engine:'fixture'},elapsed_ms:0})+'\\n');});";
 const worker=new NativeWorker(process.execPath,{args:['-e',fixture],label:'协议测试'});
 try{const pending=worker.call('large',{image:'x'.repeat(8*1024*1024)}),child=worker.child,closed=new Promise(resolve=>child.once('close',resolve));worker.cancel();await assert.rejects(pending,/取消/);await closed;assert.equal((await worker.call('ping')).engine,'fixture');}finally{worker.close();}
});
test('local automatic cutout retains dimensions, produces transparent pixels and reuses its model',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-cutout-')),s=createServices({runtimeDir:dir});
 try{
  const info=await s.invoke('cutout-info');if(!info.available){t.skip('Install optional cutout models with npm run cutout:setup');return;}
  assert.equal(info.local,true);assert.equal(info.device,'cpu');
  const image='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,'assets/04-card-front-full-bleed.png'))).toString('base64');
  const first=await s.invoke('process',{op:'remove_background',args:{image,model:'u2netp'}});
  assert.equal(first.engine,'U2Net / u2netp');assert.equal(first.modelCached,false);
  assert.ok(first.foregroundPixels>10000&&first.transparentPixels>10000);assert.match(first.image,/^data:image\/png;base64,/);
  const again=await s.invoke('process',{op:'remove_background',args:{image,model:'u2netp'}});assert.equal(again.modelCached,true);assert.equal(again.image,first.image);
  const mask=await s.invoke('process',{op:'mask_stats',args:{image:first.mask}});assert.deepEqual([mask.width,mask.height],[first.width,first.height]);
  const file=await s.invoke('save-image',{image:first.image,name:'cutout-test'});assert.ok((await fs.stat(file.file)).size>100);await assert.rejects(s.invoke('save-image',{image:'data:text/plain;base64,YQ=='}),/PNG/);
  await assert.rejects(s.invoke('process',{op:'remove_background',args:{image,model:'arbitrary-model'}}),/不支持/);
  await assert.rejects(s.invoke('process',{op:'remove_background',args:{image:'file:///private/image.png'}}),/内嵌/);
  // New image layers persist their mask separately from alpha; exported metadata carries an asset path.
  const template=JSON.parse(await fs.readFile(path.join(ROOT,'assets/template.json')));for(const l of template.layers)for(const key of ['src','master'])if(l[key]&&!l[key].startsWith('data:'))l[key]='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,l[key]))).toString('base64');
  for(const [key,value] of Object.entries(template.masks))if(!value.startsWith('data:'))template.masks[key]='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,value))).toString('base64');
  if(!template.back.startsWith('data:'))template.back='data:image/png;base64,'+(await fs.readFile(path.join(ROOT,template.back))).toString('base64');
  template.layers.unshift({id:'cutout-test',name:'透明主体',kind:'image',src:first.image,cutoutMask:first.mask,x:0,y:0,scale:1,opacity:1,visible:true,locked:false});validateProject(template);
  const output=await s.invoke('export',{document:template,front:first.image}),manifest=JSON.parse(await fs.readFile(path.join(output.directory,'manifest.json'))),layer=manifest.layers.find(l=>l.id==='cutout-test');
  assert.equal(layer.cutoutMaskAsset,'masks/cutout-test-cutout.png');assert.equal(layer.cutoutMask,undefined);assert.ok((await fs.stat(path.join(output.directory,layer.cutoutMaskAsset))).size>100);
  template.layers[0].cutoutMask='file:///arbitrary.png';assert.throws(()=>validateProject(template),/内嵌/);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
