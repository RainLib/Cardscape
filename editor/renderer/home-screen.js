/* Opening a document is explicit; the home screen only requests small metadata. */
(() => {
'use strict';
const $=id=>document.getElementById(id),host=()=>window.cardEditorHost;
let entries=[],running=false,returnMode='home';
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const native=(action,data={})=>window.atelier?.invoke('loading-window',{action,...data})||Promise.resolve();
function mode(value){
 document.body.dataset.appMode=value;
 for(const selector of ['.workspace','.options','.editor-statusbar']){const el=document.querySelector(selector);if(el)el.inert=value!=='editor';}
 window.cardPreview?.setActive?.(value==='editor'&&!window.atelierWorkshopTabs?.closed()&&document.querySelector('.view-stage').dataset.view!=='edit');
 window.dispatchEvent(new CustomEvent('atelier-app-mode',{detail:{mode:value}}));
 if(value==='home'||value==='editor')native('finish').catch(e=>console.warn('加载窗口关闭失败',e.message));
 if(value==='editor')requestAnimationFrame(()=>{host().fit();document.getElementById('editor-canvas').focus({preventScroll:true});});
}
function progress(message,percent){$('home-loading-stage').textContent=message;if(percent!==undefined){$('home-progress').value=percent;$('home-loading-percent').textContent=Math.round(percent)+'%';}native('progress',{stage:message,percent}).catch(()=>{});}
function error(message){$('home-error').textContent=message||'';$('home-error').hidden=!message;}
function date(at){return new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(at);}
function render(){
 const grid=$('home-recents');grid.replaceChildren();const query=$('home-search').value.trim().toLocaleLowerCase();let count=0;
 for(const entry of entries){for(const card of entry.cards.length?[...entry.cards].sort((a,b)=>Number(b.id===entry.activeCardId)-Number(a.id===entry.activeCardId)):[{name:entry.name}]){
  if(query&&!((card.name+' '+entry.name).toLocaleLowerCase().includes(query)))continue;count++;
  const tile=document.createElement('button');tile.className='home-card';tile.disabled=!entry.available;tile.setAttribute('aria-label','打开卡片 '+card.name);
  const art=document.createElement('span');art.className='home-card-art';
  const kind=entry.kind==='workshop'?'工坊卡片':entry.kind==='project'?(entry.file?.endsWith('.cardworkshop')?'卡片工坊':'卡片工程'):entry.file?'独立卡片':'未保存草稿';
  art.append(window.atelierCardCover.create({src:card.thumbnail,name:card.name,kind}));
  const info=document.createElement('span');info.className='home-card-info';const name=document.createElement('b');name.textContent=card.name;name.title=card.name;
  const project=document.createElement('span');project.textContent=entry.kind==='workshop'?entry.name:entry.kind==='project'?'工程 · 打开后选择卡片':entry.file?'独立卡片工程':'未保存草稿';project.title=entry.file||entry.name;
  const meta=document.createElement('small');meta.textContent=!entry.available?'文件已移走，请重新打开':(entry.dirty?'含未保存修改 · ':'')+date(entry.at);
  info.append(name,project,meta);tile.append(art,info);tile.onclick=()=>run(card.name,()=>host().openRecent(entry.id,card.id));grid.append(tile);
 }}
 $('home-empty').hidden=count>0;$('home-empty').textContent=query?'没有找到匹配的卡片。':'还没有最近编辑的卡片。新建卡片，或打开已有工程。';$('home-count').textContent=count+' 张卡片';
 $('home-resume').hidden=!host()?.state().document;
}
async function refresh(){const result=await host().invoke('home-list');entries=result.entries;render();}
async function run(label,task){
 if(running)return false;running=true;returnMode=document.body.dataset.appMode;error('');$('home-loading-name').textContent=label;progress('读取工程…',8);mode('loading');
 try{await native('show',{name:label,stage:'读取工程…',percent:8});await paint();await host().flushSession();const result=await task();if(result===false){mode(returnMode);return false;}progress('准备完成',100);await paint();mode('editor');host().opened();return true;}
 catch(e){mode('home');render();error('无法打开：'+e.message);console.error('HOME_OPEN_ERROR',e.message);return false;}
 finally{running=false;}
}
async function show(){
 if(running||document.body.dataset.appMode==='loading')return;
 if(host().state().busy){host().say('请先结束当前处理、笔划或变换');return;}
 running=true;$('home-loading-name').textContent='返回首页';progress('同步当前编辑的恢复副本…',30);mode('loading');
 try{await native('show',{name:'返回首页',stage:'同步当前编辑的恢复副本…',percent:30});await paint();await host().flushSession();mode('home');error('');await refresh();$('home-search').focus();}catch(e){mode('editor');host().say(e.message);}finally{running=false;}
}
$('home-search').oninput=render;
$('home-new').onclick=()=>host().command('new');$('home-open').onclick=()=>host().command('open');
$('home-refresh').onclick=()=>refresh().then(()=>error('')).catch(e=>error(e.message));
$('home-resume').onclick=()=>{mode('editor');host().opened(false);};
$('home-back').onclick=show;
$('home-project-file').onchange=async()=>{const file=$('home-project-file').files[0];$('home-project-file').value='';if(!file)return;await run(file.name,async()=>{if(file.size>192*1024*1024)throw Error('工程超过 192 MB');const text=await file.text();return host().openFileData(text);});};
window.atelierHome={mode,progress,run,show,refresh,error,paint,
 ready(result){entries=result.entries;$('home-loading-version').textContent='Cardscape '+result.appVersion;progress('准备完成',100);mode('home');render();},
 async openFile(){if(running)return;if(host().state().desktop){running=true;let result;try{result=await host().pickFile();}catch(e){host().say(e.message);error(e.message);}finally{running=false;}if(!result||result.canceled)return;return run(result.name,()=>host().openFileSelection(result.selection));}$('home-project-file').click();}
};
})();
