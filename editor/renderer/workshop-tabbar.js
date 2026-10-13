(() => {
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost,T=window.CardWorkshopTabs,bar=$('ws-card-tabs'),menu=$('ws-tab-menu');
let project=null,tabs=null,lastActive='',transition=false,busy=false,signature='',menuCard='',returnFocus='',emptyState=null,restoreTarget=null,restoreScheduled=false;
const storageKey=id=>'cardscape-workshop-tabs-v1:'+id;
function read(id){try{return JSON.parse(localStorage.getItem(storageKey(id)));}catch{return null;}}
function save(){try{localStorage.setItem(storageKey(project.id),JSON.stringify({...tabs,active:restoreTarget||project.activeCardId}));}catch{/* Tab preferences must not prevent editing. */}}
function closed(){return !!project&&!!tabs&&!project.editingAsset&&!tabs.open.length;}
function syncEmpty(){
 const empty=closed();document.body.classList.toggle('workshop-tabs-empty',empty);$('ws-empty-editor').hidden=!empty;$('ws-empty-reopen').disabled=!tabs?.closed.length;
 if(emptyState!==empty){
  emptyState=empty;
  for(const selector of ['.document-tab','.view-stage','.contextbar','#animation-timeline','#editor-tools','#inspector-dock','.options','#agent-dock .agent-body']){const el=document.querySelector(selector);if(el)el.inert=empty;}
  window.cardPreview?.setActive?.(!empty&&document.querySelector('.view-stage').dataset.view!=='edit');
 }
 document.body.dataset.workshopOpenTabs=String(tabs?.open.length||0);document.body.dataset.workshopPinnedTabs=String(tabs?.pinned.length||0);
}
function refresh(next,isBusy=false){
 busy=isBusy;bar.hidden=!next;
 if(!next){project=null;tabs=null;restoreTarget=null;signature='';hideMenu();syncEmpty();return;}
 const changed=project?.id!==next.id;project=next;
 if(!transition){
  const saved=changed?read(project.id):tabs;tabs=T.normalize(saved,project.cards);
  if(!changed&&lastActive!==project.activeCardId)tabs=T.open(tabs,project.activeCardId);
  // Recovery may still contain the previous card if a refresh follows a close immediately.
  if(changed&&!project.editingAsset&&document.body.dataset.appMode==='editor'){const target=T.restoredActive(tabs,project.activeCardId,saved?.active);restoreTarget=target&&target!==project.activeCardId?target:null;}
  lastActive=project.activeCardId;save();
 }
 if(menuCard&&!tabs.open.includes(menuCard))hideMenu(false);syncEmpty();render();
 if(changed)console.log('WORKSHOP_TABS_READY',JSON.stringify({cards:project.cards.length,open:tabs.open.length,pinned:tabs.pinned.length}));
 if(document.body.dataset.appMode==='editor'&&restoreTarget&&!busy&&!transition&&!restoreScheduled){
  restoreScheduled=true;const id=project.id,target=restoreTarget;
  requestAnimationFrame(()=>{restoreScheduled=false;if(project?.id===id&&restoreTarget===target)perform(tabs,target,'已恢复打开的卡片标签');});
 }
}
function focusTab(id){bar.querySelector('[role=tab][data-card-id="'+CSS.escape(id)+'"]')?.focus();}
function render(){
 const key=JSON.stringify([tabs,project?.activeCardId,project?.editingAsset?.key,project?.cards.map(c=>[c.id,c.name]),busy,transition]);if(signature===key)return;signature=key;
 const focused=document.activeElement.closest?.('.ws-editor-tab'),focusId=focused?.dataset.cardId,focusAction=document.activeElement.dataset.tabAction;
 bar.replaceChildren();if(!tabs)return;
 for(const id of tabs.open){
  const card=project.cards.find(c=>c.id===id),pinned=tabs.pinned.includes(id),active=!project.editingAsset&&id===project.activeCardId;
  const item=document.createElement('div');item.className='ws-editor-tab';item.dataset.cardId=id;item.dataset.pinned=String(pinned);item.dataset.active=String(active);item.setAttribute('role','presentation');
  const tab=document.createElement('button');tab.className='ws-tab-name';tab.textContent=card.name;tab.title=card.name+(pinned?' · 已固定':'');tab.dataset.cardId=id;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;tab.disabled=busy||transition;tab.onclick=()=>activate(id);
  const actions=document.createElement('span');actions.className='ws-tab-actions';
  for(const [action,label] of [['pin',pinned?'取消固定':'固定'],['close','关闭']]){
   const button=document.createElement('button');button.className='ws-tab-action ws-tab-'+action;button.dataset.tabAction=action;button.setAttribute('aria-label',label+'标签 '+card.name);button.title=label+'标签';button.disabled=busy||transition;
   if(action==='pin'){button.setAttribute('aria-pressed',String(pinned));button.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2h6l-1 4 2 3H4l2-3Z M8 9v5"/></svg>';button.onclick=()=>togglePin(id);}
   else{button.textContent='×';button.onclick=()=>closeTabs(id,'one');}actions.append(button);
  }
  item.append(tab,actions);item.oncontextmenu=e=>{e.preventDefault();showMenu(id,e.clientX,e.clientY);};
  item.onauxclick=e=>{if(e.button===1){e.preventDefault();closeTabs(id,'one');}};
  item.onmousedown=e=>{if(e.button===1)e.preventDefault();};
  item.onkeydown=e=>{
   if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();e.stopPropagation();const r=item.getBoundingClientRect();showMenu(id,r.x,r.bottom);return;}
   if(e.target!==tab)return;let index=tabs.open.indexOf(id);
   if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();index=e.key==='Home'?0:e.key==='End'?tabs.open.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.open.length)%tabs.open.length;focusTab(tabs.open[index]);}
  };
  bar.append(item);
 }
 const active=bar.querySelector('[aria-selected=true]');active?.scrollIntoView({block:'nearest',inline:'nearest'});
 if(focusId){const item=bar.querySelector('.ws-editor-tab[data-card-id="'+CSS.escape(focusId)+'"]');(focusAction?item?.querySelector('[data-tab-action='+focusAction+']'):item?.querySelector('[role=tab]'))?.focus();}
}
async function perform(next,id,message){
 if(!project||busy||transition||host.state().busy){host.say('请先结束当前编辑或处理');return false;}
 const capturedId=project.id;restoreTarget=null;transition=true;hideMenu(false);render();
 try{
  if(id&&(id!==project.activeCardId||project.editingAsset))await host.workshop('switch',{id});
  const current=host.state();if(current.workshop?.id!==capturedId)return false;
  project=current.workshop;tabs=T.normalize(next,project.cards);lastActive=project.activeCardId;save();host.say(message);return true;
 }catch(e){host.say(e.message);return false;}
 finally{transition=false;signature='';window.atelierWorkshop?.refresh(host.state());}
}
async function activate(id){if(!tabs)return;const ok=await perform(T.open(tabs,id),id,'已打开 '+project.cards.find(c=>c.id===id)?.name);if(ok){focusTab(id);requestAnimationFrame(()=>host.fit());}}
async function closeTabs(id,action){if(!tabs)return;const plan=T.close(tabs,id,action,project.activeCardId);if(!plan.removed.length)return;const ok=await perform(plan.state,plan.activeId,'已关闭 '+plan.removed.length+' 个标签 · 卡片保留在工坊');if(ok){if(plan.activeId)focusTab(plan.activeId);else $('ws-empty-reopen').focus();}}
function togglePin(id){if(!tabs)return;perform(T.pin(tabs,id),project.activeCardId,tabs.pinned.includes(id)?'标签已取消固定':'标签已固定 · 批量关闭时保留');}
function hideMenu(restore=true){if(menu.hidden)return;menu.hidden=true;if(restore&&returnFocus)focusTab(returnFocus);menuCard='';}
function showMenu(id,x,y){
 if(!tabs?.open.includes(id))return;hideMenu(false);menuCard=id;returnFocus=id;menu.replaceChildren();
 const add=(text,action,disabled=false)=>{const b=document.createElement('button');b.textContent=text;b.setAttribute('role','menuitem');b.disabled=disabled||busy||transition;b.onclick=action;menu.append(b);};
 add(tabs.pinned.includes(id)?'取消固定标签':'固定标签',()=>togglePin(id));add('关闭标签',()=>closeTabs(id,'one'));
 menu.append(document.createElement('hr'));
 for(const [action,label] of [['left','关闭左侧标签'],['right','关闭右侧标签'],['others','关闭其他标签'],['all','关闭所有未固定标签']])add(label,()=>closeTabs(id,action),!T.candidates(tabs,id,action).length);
 menu.append(document.createElement('hr'));add('重新打开关闭的标签',()=>reopen(),!tabs.closed.length);
 menu.hidden=false;const r=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(x,innerWidth-r.width-4))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-r.height-4))+'px';menu.querySelector('button:not(:disabled)')?.focus();
}
function reopen(){const id=tabs?.closed.at(-1);if(id)return activate(id);}
menu.onkeydown=e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hideMenu();return;}
 if(e.key==='Tab'){hideMenu(false);return;}
 const buttons=[...menu.querySelectorAll('button:not(:disabled)')];let i=buttons.indexOf(document.activeElement);
 if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();i=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[i]?.focus();}
};
document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))hideMenu(false);},true);
window.addEventListener('blur',()=>hideMenu(false));window.addEventListener('resize',()=>hideMenu(false));bar.addEventListener('scroll',()=>hideMenu(false));
document.addEventListener('keydown',e=>{if(e.defaultPrevented||window.CardShortcuts.editable(e.target)||document.querySelector('dialog[open]'))return;if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==='t'&&project){e.preventDefault();reopen();}},true);
$('ws-empty-reopen').onclick=reopen;$('ws-empty-workshop').onclick=()=>{window.atelierWorkshop.open(true);$('ws-card-search').focus();};$('ws-empty-new').onclick=()=>host.command('new');
window.atelierWorkshopTabs={explicitOpen(id){if(!project||!tabs)return;restoreTarget=null;tabs=T.open(tabs,id);lastActive=project.activeCardId;save();syncEmpty();signature='';render();},refresh,activate,closed};
})();
