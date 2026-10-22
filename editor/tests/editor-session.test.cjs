const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createServices}=require('../dist/electron/services.cjs'),R=require('../dist/renderer/runtime-model.js'),W=require('../dist/renderer/workshop-model.js'),S=require('../dist/renderer/session-model.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function card(name='原版'){return R.ensure({schema:'card-atelier/1',id:'initial',name,width:1024,height:1536,layers:[{id:'figure',name:'人物',kind:'foreground',x:0,y:0,scale:1,opacity:1,visible:true,locked:false,src:png}],masks:{motion:png},back:png,effects:{}});}
test('refresh and process restart recover the current card, unsaved order and view without overwriting the saved file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-session-'));let service=createServices({runtimeDir:dir});
 try{
  let w=W.create(card(),'workshop','card-a');w=W.add(w,card('新卡'),'card-b');w.activeCardId='card-a';
  const saved=await service.invoke('save-workshop',{workshop:await W.encode(w)}),original=await fs.readFile(saved.file);
  const boot=await service.invoke('bootstrap');assert.equal(boot.workshop.activeCardId,'card-a');
  w.activeCardId='card-b';const d=W.resolve(w);require('../dist/renderer/card-stats.js').apply(d,{cost:3,power:8});d.layers.reverse();d.layers.find(l=>l.id==='figure').x=71;d.revision=9;w=W.commit(w,d);
  const encode=S.encoder(),snapshot=await encode(w),view={mode:'space',selected:['stat-power'],pose:{yaw:35,pitch:20,time:2},paused:true};
  await service.invoke('editor-session-save',{token:boot.sessionToken,sequence:1,revision:9,savedRevision:0,view,...snapshot});snapshot.ack();
  const delta=await encode(w);assert.equal(Object.keys(delta.blobs).length,0);
  const refreshed=await service.invoke('bootstrap');assert.equal(refreshed.workshop.activeCardId,'card-b');assert.equal(W.resolve(refreshed.workshop).layers.find(l=>l.id==='figure').x,71);assert.deepEqual(W.resolve(refreshed.workshop).layers.map(l=>l.id),d.layers.map(l=>l.id));assert.deepEqual(refreshed.recovery.view,view);assert.equal(refreshed.recovery.savedRevision,0);assert.equal(refreshed.recovery.revision,9);
  await assert.rejects(service.invoke('editor-session-save',{token:boot.sessionToken,sequence:2,revision:0,savedRevision:0,...delta}),/会话已切换/);
  service.close();service=createServices({runtimeDir:dir,dialogs:{}});const restarted=await service.invoke('bootstrap');assert.equal(restarted.desktop,true);assert.equal(restarted.workshop.activeCardId,'card-b');assert.deepEqual(await fs.readFile(saved.file),original);
  const next=await encode(w);await service.invoke('editor-session-save',{token:restarted.sessionToken,sequence:3,revision:9,savedRevision:9,...next});assert.equal((await service.invoke('editor-session-save',{token:restarted.sessionToken,sequence:2,revision:1,savedRevision:0,...next})).stale,true);
  const other=path.join(dir,'other.cardproj');await fs.writeFile(other,JSON.stringify(card('另一个工程')));service.close();service=createServices({runtimeDir:dir,initialProject:other});assert.equal((await service.invoke('bootstrap')).document.name,'另一个工程');
 }finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('corrupt or incomplete recovery stays separate from the formal project',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-session-invalid-')),service=createServices({runtimeDir:dir});
 try{const saved=await service.invoke('save',{document:card()}),boot=await service.invoke('bootstrap'),e=await S.encoder()(card());
  const corrupt={...e,blobs:{...e.blobs}};corrupt.blobs[Object.keys(corrupt.blobs)[0]]+='x';await assert.rejects(service.invoke('editor-session-save',{token:boot.sessionToken,sequence:1,revision:1,savedRevision:0,...corrupt}),/摘要/);
  await fs.writeFile(path.join(dir,'editor-session/current.json'),'{broken').catch(async()=>{await fs.mkdir(path.join(dir,'editor-session'));await fs.writeFile(path.join(dir,'editor-session/current.json'),'{broken');});
  const fallback=await service.invoke('bootstrap');assert.equal(fallback.document.name,'原版');assert.ok(fallback.recoveryError);assert.equal((await service.invoke('open')).file,saved.file);
 }finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
