const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createServices}=require('../dist/electron/services.cjs'),R=require('../dist/renderer/runtime-model.js'),W=require('../dist/renderer/workshop-model.js'),S=require('../dist/renderer/session-model.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function card(id,name=id){return R.ensure({schema:'card-atelier/1',id,name,width:1024,height:1536,layers:[{id:'figure',name:'人物',kind:'foreground',x:0,y:0,scale:1,opacity:1,visible:true,locked:false,src:png}],masks:{motion:png},back:png,effects:{},thumbnail:png});}
async function sessionSave(service,project,token,revision,view){return service.invoke('editor-session-save',{token,sequence:1,revision,savedRevision:0,view,...await S.encoder()(project)});}
test('cold start shows only metadata and never loads a template or starts a document session',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-home-empty-')),service=createServices({runtimeDir:dir});
 try{const home=await service.invoke('home-bootstrap');assert.deepEqual(home.entries,[]);assert.equal(home.desktop,false);for(const key of ['template','document','workshop','sessionToken'])assert.equal(home[key],undefined);await assert.rejects(fs.stat(path.join(dir,'editor-session/current.json')),/ENOENT/);}
 finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('the bundled workshop opens as a fresh copy and saves outside the example folder', async () => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'card-home-demo-'));
 const file = path.resolve(__dirname, '../examples/production-card/stormglass-oath/stormglass-oath.cardworkshop');
 const source = await fs.readFile(file);
 const service = createServices({ runtimeDir: dir });
 try {
  await assert.rejects(service.invoke('home-open-demo', { id: '../template.json' }), /示例工程不存在/);
  const first = await service.invoke('home-open-demo', { id: 'stormglass-oath' });
  assert.equal(first.file, null);
  assert.notEqual(first.workshop.id, JSON.parse(source).project.id);
  assert.equal(W.resolve(first.workshop).actions[0].duration, 4);
  await service.invoke('home-activate', { ticket: first.ticket });
  const original = W.resolve(first.workshop).layers[0].x;
  const edited = W.resolve(first.workshop);
  edited.layers[0].x = original + 27;
  const saved = await service.invoke('save-workshop', { workshop: await W.encode(W.commit(first.workshop, edited)) });
  assert.ok(saved.file.startsWith(dir + path.sep));
  assert.deepEqual(await fs.readFile(file), source);
  const next = await service.invoke('home-open-demo', { id: 'stormglass-oath' });
  assert.notEqual(next.workshop.id, first.workshop.id);
  assert.equal(W.resolve(next.workshop).layers[0].x, original);
 } finally {
  service.close();
  await fs.rm(dir, { recursive: true, force: true });
 }
});
test('recent card selection restores unsaved layers; startup and staging preserve formal file and session binding',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-home-'));let service=createServices({runtimeDir:dir});
 try{
  let w=W.create(card('first'),'factory','a');w=W.add(w,card('second'),'b');w.activeCardId='b';w.cards.forEach(c=>c.thumbnail=png);
  const saved=await service.invoke('save-workshop',{workshop:await W.encode(w)}),formal=await fs.readFile(saved.file),token=(await service.invoke('editor-session-start')).sessionToken;
  const d=W.resolve(w);d.layers[0].x=77;w=W.commit(w,d);const view={selected:['figure'],mode:'space'};await sessionSave(service,w,token,8,view);
  const recovery=await fs.readFile(path.join(dir,'editor-session/current.json'));service.close();service=createServices({runtimeDir:dir,dialogs:{}});
  const home=await service.invoke('home-bootstrap');assert.equal(home.desktop,true);assert.equal(home.entries.length,1);const entry=home.entries[0];assert.equal(entry.dirty,true);assert.equal(entry.cards.length,2);assert.equal(entry.cards[1].thumbnail,png);assert.equal(entry.cards[1].document,undefined);
  assert.deepEqual(await fs.readFile(path.join(dir,'editor-session/current.json')),recovery);assert.deepEqual(await fs.readFile(saved.file),formal);
  const staged=await service.invoke('home-open',{id:entry.id,cardId:'b'});assert.equal(staged.sessionToken,undefined);assert.equal(staged.workshop.activeCardId,'b');assert.equal(W.resolve(staged.workshop).layers[0].x,77);assert.deepEqual(staged.recovery.view,view);
  const activated=await service.invoke('home-activate',{ticket:staged.ticket});assert.ok(activated.sessionToken);
  await assert.rejects(service.invoke('home-open',{id:entry.id,cardId:'missing'}),/不在工坊/);
  // Invalid selections do not invalidate the current writer.
  await sessionSave(service,w,activated.sessionToken,9,view);
  const other=await service.invoke('home-open',{id:entry.id,cardId:'a'});assert.equal(other.workshop.activeCardId,'a');assert.equal(other.recovery.view,null);assert.equal(other.recovery.revision,9);
  await assert.rejects(service.invoke('home-activate',{ticket:staged.ticket}),/失效/);assert.deepEqual(await fs.readFile(saved.file),formal);
 }finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('multiple unsaved drafts remain reopenable after creating another card and restarting',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-home-drafts-'));let service=createServices({runtimeDir:dir});
 try{
  for(const [id,x] of [['first',51],['second',82]]){const d=card(id);d.layers[0].x=x;const staged=await service.invoke('home-new',{document:d}),active=await service.invoke('home-activate',{ticket:staged.ticket});await sessionSave(service,d,active.sessionToken,2,{});}
  service.close();service=createServices({runtimeDir:dir});const home=await service.invoke('home-bootstrap');assert.equal(home.entries.length,2);assert.ok(home.entries.every(e=>e.available&&e.dirty));
  for(const [id,x] of [['first',51],['second',82]]){const entry=home.entries.find(e=>e.projectId===id),opened=await service.invoke('home-open',{id:entry.id,cardId:id});assert.equal(opened.document.layers[0].x,x);assert.equal(opened.recovery.revision,2);}
 }finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('file cancellation and invalid image project leave the active session usable',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-home-failure-')),service=createServices({runtimeDir:dir,dialogs:{openProject:async()=>null}});
 try{const d=card('source'),staged=await service.invoke('home-new',{document:d}),active=await service.invoke('home-activate',{ticket:staged.ticket});assert.deepEqual(await service.invoke('home-open-file'),{canceled:true});await assert.rejects(service.invoke('home-open-file',{text:'{invalid'}));await assert.rejects(service.invoke('home-new',{document:{}}),/不支持/);await sessionSave(service,d,active.sessionToken,1,{});const entry=(await service.invoke('home-list')).entries[0];assert.equal(entry.projectId,'source');}
 finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('native file picker chooses first; its single-use selection is read during loading and activated afterward',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'card-home-picker-')),file=path.join(dir,'chosen.cardproj');await fs.writeFile(file,JSON.stringify(card('chosen')));const service=createServices({runtimeDir:dir,dialogs:{openProject:async()=>file}});
 try{const choice=await service.invoke('home-choose-file');assert.equal(choice.name,'chosen.cardproj');assert.equal(choice.document,undefined);assert.equal((await service.invoke('home-bootstrap')).document,undefined);const opened=await service.invoke('home-open-file',{selection:choice.selection});assert.equal(opened.document.id,'chosen');assert.equal(opened.file,file);await assert.rejects(service.invoke('home-open-file',{selection:choice.selection}),/失效/);const active=await service.invoke('home-activate',{ticket:opened.ticket});assert.ok(active.sessionToken);}
 finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
