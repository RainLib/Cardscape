(() => {
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost,M=window.CardWorkshop,C=window.CardWorkshopCatalog;
let state=null,opened=false,resourceId='',ver=0,projectId='',targets=new Set(),autoTargets=true,key='',tag='all';
const w=()=>state?.workshop,chosen=()=>w()?.resources.find(r=>r.id===resourceId),kind=()=>chosen()?.kind||$('ws-kind').value;
function open(on=true){opened=on;$('workshop-dock').hidden=!on;document.body.classList.toggle('workshop-open',on);$('workshop-toggle').setAttribute('aria-expanded',String(on));if(on)document.body.classList.remove('panels-hidden');window.atelierWorkspace.syncLayout();requestAnimationFrame(()=>host.fit());}
function rememberFilter(){try{localStorage.setItem('cardscape-catalog-filter:'+projectId,tag);}catch{}}
function selectResource(id,version=0){resourceId=id;ver=version;key='';refresh(host.state());}
async function run(fn){try{const result=await fn();if(result?.resourceId){resourceId=result.resourceId;ver=result.version;const r=host.state().workshop.resources.find(r=>r.id===resourceId);if(tag!=='all'&&r){tag=['back','frame','particles'].includes(r.kind)?r.kind:'components';$('ws-component-filter').value='components';rememberFilter();}}key='';refresh(host.state());$('ws-status').textContent='已更新 · 可撤销';return result;}catch(e){$('ws-status').textContent=e.message;host.say(e.message);refresh(host.state());}}
function optionList(el,items,value){el.replaceChildren();for(const x of items)el.add(new Option(x.label,x.value));el.value=String(value??'');}
function refresh(next){
 state=next;const project=w();$('ws-intro').hidden=!!project;$('ws-project').hidden=!project;window.atelierWorkshopTabs.refresh(project,next.busy);if(!project)return;
 if(projectId!==project.id){projectId=project.id;resourceId='';ver=0;targets=new Set([project.activeCardId]);autoTargets=true;key='';tag='all';$('ws-component-filter').value='components';try{const saved=localStorage.getItem('cardscape-catalog-filter:'+projectId);if(['all','front','back','frame','particles','components'].includes(saved))tag=saved;}catch{}open();}
 if(resourceId&&!chosen()){resourceId='';ver=0;}
 if(autoTargets)targets=new Set([project.activeCardId]);for(const id of targets)if(!project.cards.some(c=>c.id===id))targets.delete(id);
 for(const [id,value] of [['ws-name',project.name],['ws-card-name',M.card(project).name]])if(document.activeElement!==$(id))$(id).value=value;
 const catalog=C.entries(project);for(const b of document.querySelectorAll('[data-catalog-tag]')){const type=b.dataset.catalogTag;b.textContent=(type==='all'?'全部':C.tags[type])+' '+C.filter(catalog,type).length;b.setAttribute('aria-pressed',String(type===tag));b.disabled=next.busy;}
 $('ws-component-filter').hidden=tag!=='components';$('ws-card-fields').hidden=!!resourceId||['back','frame','particles','components'].includes(tag);
 const filter=tag==='components'?$('ws-component-filter').value:tag;
 const signature=JSON.stringify([project.id,project.activeCardId,project.editingAsset?.key,next.revision,catalog.map(c=>[c.key,c.name,c.version,c.bindings]),filter,resourceId,ver,$('ws-card-search').value,window.atelierWorkshopTabs.closed()]);
 if(key!==signature){
  key=signature;for(const image of $('ws-card-list').querySelectorAll('img'))image.dispatchEvent(new Event('back-thumbnail-remove'));$('ws-card-list').replaceChildren();
  for(const entry of C.filter(catalog,filter,$('ws-card-search').value)){
   const asset=entry.tag!=='front',back=entry.tag==='back',active=asset?resourceId===entry.resourceId:!resourceId&&entry.cardId===project.activeCardId&&!window.atelierWorkshopTabs.closed(),button=document.createElement('button');
   button.className='ws-card'+(active?' active':'');button.dataset.entryTag=entry.tag;if(asset)button.dataset.resourceId=entry.resourceId;else button.dataset.cardId=entry.cardId;button.setAttribute('aria-label',(back?'编辑卡背 ':asset?'选择组件 ':'编辑卡片 ')+entry.name);button.setAttribute('aria-current',String(active));if(asset){button.dataset.assetDragId=entry.resourceId;button.dataset.assetDragVersion=entry.version;button.title='拖到画布、预览或正面卡标签应用 · v'+entry.version;}
   const cover=window.atelierCardCover.create({src:entry.thumbnail,name:entry.name,kind:C.tags[entry.tag],compact:true});button.append(cover);
   const text=document.createElement('span'),name=document.createElement('b'),label=document.createElement('small'),refs=document.createElement('small');name.textContent=entry.name;label.textContent=C.tags[entry.tag];label.className='ws-entry-tag';refs.textContent=asset?'v'+entry.version+' · '+M.uses(project,entry.resourceId).filter(u=>u.cardId).length+' 张卡引用':Object.entries(entry.bindings).map(([k,b])=>M.kinds[k]+' v'+b.version).join(' · ')||'独立素材';text.append(name,label,refs);button.append(text);
   button.onclick=()=>{if(asset){selectResource(entry.resourceId,entry.version);if(back)window.atelierBackEditor.open(entry.resourceId,entry.version);else if(['frame','particles'].includes(entry.tag))window.atelierComponentEditor.open(entry.tag,entry.resourceId,entry.version);}else{selectResource('');window.atelierWorkshopTabs.activate(entry.cardId);}};
   if(asset&&!back)button.ondblclick=()=>window.atelierComponentEditor.open(entry.tag,entry.resourceId,entry.version);
   $('ws-card-list').append(button);if(back&&cover.querySelector('img'))window.atelierBackThumbnails.watch(cover.querySelector('img'),project.id+'/'+entry.resourceId+'@'+entry.version,entry.value);
  }
  if(!$('ws-card-list').children.length){const empty=document.createElement('p');empty.className='ws-catalog-empty';empty.textContent='暂无匹配资产';$('ws-card-list').append(empty);}
 }
 document.body.dataset.workshopCatalogEntries=String(catalog.length);
 const r=chosen();$('ws-asset-detail').hidden=!r;
 if(r){
  if(!r.versions.some(v=>v.version===ver))ver=r.versions.at(-1).version;
  for(const id of ['ws-asset-drag-handle','ws-resource-preview','ws-frame-preview']){$(id).dataset.assetDragId=r.id;$(id).dataset.assetDragVersion=ver;}
  $('ws-asset-name').textContent=r.name;optionList($('ws-version'),r.versions.map(v=>({label:'v'+v.version+(v===r.versions.at(-1)?' · 最新':''),value:v.version})),ver);
  const value=r.versions.find(v=>v.version===ver).value,isFrame=r.kind==='frame',image=$('ws-resource-preview');$('ws-frame-preview').hidden=!isFrame;
  image.hidden=!value.src;if(value.src){if(r.kind==='back')window.atelierBackThumbnails.watch(image,project.id+'/'+r.id+'@'+ver,value);else{image.dispatchEvent(new Event('back-thumbnail-remove'));image.src=value.src;}}else{image.dispatchEvent(new Event('back-thumbnail-remove'));image.removeAttribute('src');}
  if(isFrame){const c=$('ws-frame-preview'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!window.CardFrameRaster.fit(ctx,value.style,c.width,c.height)){ctx.save();ctx.scale(c.width/1024,c.height/1536);window.CardFrame.draw(ctx,value.style);ctx.restore();}}
  $('ws-preview-component').textContent=r.kind==='back'?'组合预览（翻面）':'组合预览';
  const binding=M.card(project).bindings[r.kind];$('ws-reference').textContent=binding?'当前卡：'+M.resource(project,binding.resourceId).name+' · v'+binding.version:'当前卡：独立'+M.kinds[r.kind];
  $('ws-apply-summary').textContent='替换 '+targets.size+' 张卡片的'+M.kinds[r.kind];
  $('ws-usage').textContent=M.uses(project,r.id).map(u=>u.name+' · v'+u.version).join('；')||'暂无引用';
  $('ws-clear-default').disabled=next.busy||!project.previewDefaults?.[r.kind];$('ws-detach').disabled=next.busy||!binding||window.atelierWorkshopTabs.closed();$('ws-remove-resource').disabled=next.busy||!!M.uses(project,r.id).length;
 }
 const targetKey=JSON.stringify([project.cards.map(c=>[c.id,c.name]),[...targets]]);if($('ws-targets').dataset.key!==targetKey){$('ws-targets').dataset.key=targetKey;$('ws-targets').replaceChildren();for(const c of project.cards){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=targets.has(c.id);input.disabled=next.busy;input.setAttribute('aria-label','应用资产到 '+c.name);input.onchange=()=>{autoTargets=false;input.checked?targets.add(c.id):targets.delete(c.id);refresh(host.state());};label.append(input,document.createTextNode(c.name));$('ws-targets').append(label);}}for(const input of $('ws-targets').querySelectorAll('input'))input.disabled=next.busy;
 for(const id of ['ws-publish','ws-import-card','ws-new-card','ws-new-back','ws-new-frame','ws-new-particles','ws-new-component','ws-duplicate','ws-rename-card','ws-name','ws-card-name','ws-kind','ws-version','ws-component-filter','ws-target-all','ws-target-current','ws-reset-preview','ws-save','ws-export','ws-project-open'])$(id).disabled=next.busy;
 for(const id of ['ws-edit-component','ws-preview-component','ws-default-component','ws-apply-current','ws-update-resource'])$(id).disabled=next.busy||!r;
 $('ws-apply').disabled=next.busy||!r||!targets.size;
 $('ws-remove-card').disabled=next.busy||project.cards.length<=1;$('ws-duplicate').disabled=next.busy||project.cards.length>=64;$('ws-new-card').disabled=next.busy||project.cards.length>=64;
 $('ws-import-resource').hidden=['effect','frame','material','particles'].includes($('ws-kind').value);$('ws-import-resource').disabled=next.busy;
 for(const button of $('ws-card-list').querySelectorAll('button'))button.disabled=next.busy;
 if(window.atelierWorkshopTabs.closed()||project.editingAsset)for(const id of ['ws-duplicate','ws-remove-card','ws-rename-card','ws-card-name','ws-detach','ws-publish','ws-update-resource','ws-apply-current'])$(id).disabled=true;
 if(project.editingAsset)for(const id of ['ws-apply','ws-apply-current','ws-preview-component','ws-default-component','ws-remove-resource','ws-new-card','ws-import-card'])$(id).disabled=true;
 document.body.dataset.workshopCards=project.cards.length;document.body.dataset.workshopResources=project.resources.length;document.body.dataset.workshopActive=project.activeCardId;
}
$('ws-new-component').onclick=()=>window.atelierComponentEditor.open($('ws-kind').value);$('ws-edit-component').onclick=()=>window.atelierComponentEditor.open(kind(),resourceId,ver);
$('ws-new-back').onclick=()=>window.atelierBackEditor.open('',0,true);
for(const b of document.querySelectorAll('[data-catalog-tag]'))b.onclick=()=>{tag=b.dataset.catalogTag;rememberFilter();selectResource('');};
$('ws-component-filter').onchange=()=>selectResource('');
window.addEventListener('atelier-back-editor-open',e=>selectResource(e.detail.resourceId,e.detail.version));
window.addEventListener('atelier-component-published',e=>{if(host.state().workshop?.id!==e.detail.projectId)return;resourceId=e.detail.resourceId;ver=e.detail.version;tag=['back','frame','particles'].includes(kind())?kind():'components';$('ws-component-filter').value='components';rememberFilter();key='';refresh(host.state());});
$('ws-asset-close').onclick=()=>selectResource('');
$('workshop-toggle').onclick=()=>open(!opened);$('ws-close').onclick=()=>open(false);
$('ws-create').onclick=()=>run(()=>host.workshop('create',{name:$('ws-new-name').value.trim()}));$('ws-new-card').onclick=()=>host.command('new');$('ws-duplicate').onclick=()=>run(()=>host.workshop('duplicate'));$('ws-remove-card').onclick=()=>run(()=>host.workshop('remove-card',{id:w().activeCardId}));$('ws-rename-card').onclick=()=>run(()=>host.workshop('rename',{name:$('ws-card-name').value}));$('ws-name').onchange=()=>run(()=>host.workshop('rename-workshop',{name:$('ws-name').value}));$('ws-card-search').oninput=()=>{key='';refresh(host.state());};
$('ws-kind').onchange=()=>refresh(host.state());$('ws-version').onchange=()=>{ver=Number($('ws-version').value);refresh(host.state());};
$('ws-target-current').onclick=()=>{autoTargets=true;targets=new Set([w().activeCardId]);refresh(host.state());};$('ws-target-all').onclick=()=>{autoTargets=false;targets=new Set(w().cards.map(c=>c.id));refresh(host.state());};
$('ws-publish').onclick=()=>run(()=>host.workshop('publish',{kind:$('ws-kind').value,bind:false}));$('ws-update-resource').onclick=()=>run(()=>host.workshop('publish',{kind:kind(),resourceId,bind:false}));
function apply(ids){const type=kind(),id=resourceId,version=ver;return run(async()=>{await host.workshop('bind',{kind:type,resourceId:id,version,ids});window.atelierComponents.revealAuthored([type]);});}
$('ws-apply-current').onclick=()=>apply([w().activeCardId]);$('ws-apply').onclick=()=>apply([...targets]);$('ws-detach').onclick=()=>run(()=>host.workshop('detach',{kind:kind()}));$('ws-remove-resource').onclick=()=>run(()=>host.workshop('remove-resource',{id:resourceId}));
$('ws-save').onclick=()=>host.command('save');$('ws-export').onclick=()=>host.command('export');
const openFile=()=>{const current=host.state();if(current.busy||current.dirty){host.say(current.busy?'请先完成当前编辑或处理':'请先保存当前修改，再打开工程');return;}$('ws-project-file').click();};$('ws-open').onclick=$('ws-project-open').onclick=openFile;$('ws-import-card').onclick=()=>$('ws-card-file').click();$('ws-import-resource').onclick=()=>$('ws-resource-file').click();
for(const [id,mode] of [['ws-project-file','open'],['ws-card-file','card'],['ws-resource-file','resource']])$(id).onchange=async()=>{const file=$(id).files[0];if(!file)return;try{const limit=mode==='open'?192:64;if(file.size>limit*1024*1024)throw Error('文件超过 '+limit+' MB');if(mode==='resource'){if(file.size>24*1024*1024)throw Error('图像超过 24 MB');const capturedKind=$('ws-kind').value,capturedProject=projectId,src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(host.state().workshop?.id!==capturedProject)throw Error('工坊已切换，请重新导入图像');await run(()=>host.workshop('publish',{kind:capturedKind,name:file.name,value:{src},bind:false}));}else{const text=await file.text();if(mode==='open'){const data=await host.invoke('open-data',{text});await run(()=>host.workshop('open',data));}else{const document=JSON.parse(text);await run(()=>host.workshop('add',{document}));}}}catch(e){$('ws-status').textContent=e.message;host.say(e.message);}finally{$(id).value='';}};
$('ws-preview-component').onclick=()=>window.atelierComponents.preview(kind(),{resourceId,version:ver},{showTools:false});$('ws-default-component').onclick=()=>run(()=>host.workshop('preview-default',{kind:kind(),binding:{resourceId,version:ver}}));$('ws-reset-preview').onclick=()=>window.atelierComponents.clear();$('ws-clear-default').onclick=()=>run(()=>host.workshop('preview-default',{kind:kind()}));
$('ws-new-frame').onclick=()=>host.editComponent('frame').catch(e=>host.say(e.message));$('ws-new-particles').onclick=()=>host.editAsset('',0,true,'particles').catch(e=>host.say(e.message));
window.atelierWorkshop={refresh,open,openFile,selectAsset:selectResource};refresh(host.state());
})();
