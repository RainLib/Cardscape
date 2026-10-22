const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const W=require('../dist/renderer/workshop-model.js'),R=require('../dist/renderer/runtime-model.js'),Catalog=require('../dist/renderer/workshop-catalog.js'),A=require('../dist/renderer/asset-workspace-model.js'),D=require('../dist/renderer/asset-drop-model.js'),E=require('../dist/renderer/editor-commands.js'),S=require('../dist/electron/workshop-storage.cjs'),Session=require('../dist/renderer/session-model.js'),{createServices,validateProject}=require('../dist/electron/services.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',other='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/q9sAAAAASUVORK5CYII=';
function document(){return R.ensure({schema:'card-atelier/1',width:1024,height:1536,name:'卡片',layers:[{id:'bg',name:'远景',kind:'background',src:png,x:18,y:24,scale:1.2,opacity:.8,visible:true,locked:false,spatial:{role:'far',z:-.18,clip:true}}],masks:{motion:png},back:png,effects:{cape:false,flow:false,background:1}});}
function legacy(){let w=W.duplicate(W.create(document(),'legacy-workshop','a'),'b');w=W.publish(w,{kind:'back',id:'back',name:'卡背',value:{src:png}}).workshop;w=W.bind(w,'back','back',1,['a','b']);w.resources.push({id:'sky',kind:'background',name:'旧共享天空',versions:[{version:1,value:{src:png}},{version:2,value:{src:other,sourceWindow:{x:96,y:144,width:1024,height:1536},adjustments:{brightness:10,contrast:0,saturation:80,gamma:1},style:'texture'}}]});for(const [i,c] of w.cards.entries()){c.bindings.background={resourceId:'sky',version:i+1};delete c.document.layers[0].src;}return w;}
test('background stays a local image layer and cannot be created, published, bound or dragged as a component',()=>{
 const old=legacy();assert.equal(W.kinds.background,undefined);assert.equal(Catalog.tags.background,undefined);assert.equal(Catalog.entries(old).some(e=>e.tag==='background'),false);
 assert.throws(()=>W.publish(old,{kind:'background',id:'new',name:'天空',value:{src:png}}),/分类/);
 assert.throws(()=>W.capture(document(),'background'),/背景请在卡片图层/);
 assert.throws(()=>W.bind(old,'background','sky',1,['a']),/请选择/);
 assert.throws(()=>W.setDefault(old,'background',{resourceId:'sky',version:1}),/分类/);
 assert.throws(()=>A.start(old,{kind:'background',blank:document()}),/分类/);
 assert.throws(()=>D.capture({workshop:old,document:document(),busy:false},'sky'),/不能作为组件/);
 assert.throws(()=>E.validate([{op:'shared',kind:'background',resourceId:'sky',version:1}]),/共享资源/);
 assert.throws(()=>E.validate([{op:'publish',kind:'background',name:'天空'}]),/共享资源/);
 E.validate([{op:'asset',kind:'background',jobId:'12345678-1234-1234-1234-123456789abc'}]);
 validateProject(document());
});
test('migration detaches each exact background version without moving art, changing other bindings or mutating the source',()=>{
 const old=legacy(),before=W.clone(old),expected=old.cards.map(c=>W.resolve(old,c.id)),w=W.migrate(old,validateProject);
 assert.deepEqual(old,before);assert.equal(W.migrate(w),w);assert.equal(w.resources.some(r=>r.kind==='background'),false);
 for(const [i,c] of w.cards.entries()){assert.equal(c.bindings.background,undefined);assert.deepEqual(c.bindings.back,old.cards[i].bindings.back);assert.deepEqual(W.resolve(w,c.id),expected[i]);}
 assert.equal(w.cards[1].document.layers[0].src,other);assert.equal(w.backgroundArchive[0].resources[0].versions.length,2);W.validate(w,validateProject);
 const d=W.resolve(w,'a');d.layers[0].x=99;const updated=W.commit({...w,activeCardId:'a'},d);assert.equal(W.resolve(updated,'b').layers[0].x,18);
});
test('obsolete preview defaults, unused artwork and background drafts are preserved without appearing in the catalog',()=>{
 const old=legacy(),draft={key:'sky@2',kind:'background',resourceId:'sky',version:2,baseVersion:2,name:'未发布天空',document:{...document(),assetKind:'background'}};
 old.previewDefaults={background:{resourceId:'sky',version:2},back:{resourceId:'back',version:1}};old.assetDrafts={'sky@2':draft};old.editingAsset=W.clone(draft);old.resources.push({id:'unused',kind:'background',name:'未使用背景',versions:[{version:1,value:{src:other}}]});
 const w=W.migrate(old,validateProject);assert.equal(w.editingAsset,undefined);assert.deepEqual(w.assetDrafts,{});assert.deepEqual(w.previewDefaults,{back:{resourceId:'back',version:1}});assert.deepEqual(w.backgroundArchive[0].editing,draft);assert.deepEqual(w.backgroundArchive[0].drafts['sky@2'],draft);assert.equal(w.backgroundArchive[0].resources.length,2);assert.equal(Catalog.entries(w).length,3);assert.equal(W.resolve(w).id,'b');
});
test('legacy multi-layer source scenes retain their original masks and effects after background detachment',()=>{
 const old=legacy(),source=document();source.assetKind='background';source.layers.push({...source.layers[0],id:'mist',kind:'image',name:'中景雾',spatial:{role:'mid',z:-.1,clip:true}});old.resources[1].versions[0].value.document=source;const expected=W.resolve(old,'a'),w=W.migrate(old,validateProject);assert.deepEqual(W.resolve(w,'a'),expected);assert.deepEqual(w.cards[0].document.componentScenes.background.document,source);
});
test('invalid pinned backgrounds or corrupt compatibility archives are rejected',()=>{
 const old=legacy();old.cards[0].bindings.background.version=99;assert.throws(()=>W.migrate(old,validateProject),/版本不存在/);assert.equal(old.resources.length,2);
 const w=W.migrate(legacy());w.backgroundArchive[0].resources[0].versions[0].value.src='bad-image';assert.throws(()=>W.validate(w,validateProject),/共享图像/);
});
test('old file open, save, export and session recovery all retain local backgrounds and keep original files intact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'local-background-')),service=createServices({runtimeDir:dir});try{
  const old=legacy(),text=JSON.stringify(S.pack(old)),original=path.join(dir,'original.cardworkshop');await fs.writeFile(original,text);
  const opened=await service.invoke('open-data',{text});assert.equal(opened.workshop.resources.length,1);assert.equal(opened.workshop.cards[1].document.layers[0].src,other);
  const saved=await service.invoke('save-workshop',{workshop:await W.encode(opened.workshop)});assert.deepEqual(S.unpack(JSON.parse(await fs.readFile(saved.file,'utf8'))),JSON.parse(JSON.stringify(opened.workshop)));assert.equal(await fs.readFile(original,'utf8'),text);
  const exported=await service.invoke('export-workshop',{workshop:await W.encode(opened.workshop),outputs:{a:{front:png},b:{front:png}}}),graph=JSON.parse(await fs.readFile(path.join(exported.directory,'workshop.json'),'utf8'));
  assert.deepEqual(graph.resources.map(r=>r.kind),['back']);assert.equal(graph.recipes.some(c=>c.bindings.background),false);const manifest=JSON.parse(await fs.readFile(path.join(exported.directory,'cards/b/manifest.json'),'utf8'));const bg=manifest.layers.find(l=>l.id==='bg');assert.deepEqual(bg.sourceWindow,{x:96,y:144,width:1024,height:1536});assert.deepEqual(await fs.readFile(path.resolve(exported.directory,'cards/b',bg.asset)),Buffer.from(other.split(',')[1],'base64'));
  const boot=await service.invoke('bootstrap'),encoded=await Session.encoder()(old);await service.invoke('editor-session-save',{token:boot.sessionToken,sequence:1,revision:3,savedRevision:0,...encoded});const recovered=await service.invoke('bootstrap');assert.equal(recovered.workshop.cards[1].document.layers[0].src,other);assert.equal(recovered.workshop.cards[1].bindings.background,undefined);assert.equal(recovered.recovery.revision,3);
 }finally{service.close();await fs.rm(dir,{recursive:true,force:true});}
});
