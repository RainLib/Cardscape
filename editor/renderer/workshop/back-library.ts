import importedCardWorkshop from './workshop-model.ts';
import importedCardWorkshopCatalog from './workshop-catalog.ts';
/* Reverse-card chooser shares the workshop catalog and previews the real reverse scene. */
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost,M=importedCardWorkshop,C=importedCardWorkshopCatalog;
const dialog=document.createElement('dialog');dialog.id='back-picker';dialog.className='back-picker';dialog.setAttribute('aria-label','选择卡背');
dialog.innerHTML='<header><b>卡背</b><button id="back-picker-new">＋新建卡背</button><button id="back-picker-close" aria-label="关闭卡背候选列表">×</button></header><div class="back-picker-tools"><input id="back-picker-search" type="search" placeholder="搜索卡背" aria-label="搜索卡背候选"><label><input id="back-picker-history" type="checkbox">历史版本</label></div><div id="back-picker-grid" class="back-picker-grid" role="listbox" aria-label="卡背候选列表"></div><p id="back-picker-empty" hidden>没有匹配的卡背</p><footer><span id="back-picker-status" role="status"></span><button id="back-picker-done">完成预览</button><button id="back-picker-apply" class="accent">应用到当前卡片</button></footer>';
document.body.append(dialog);let state=null,choice='authored',signature='',opener=null,applying=false;
const binding=v=>v&&v.includes('@')?{resourceId:v.split('@')[0],version:Number(v.split('@')[1])}:null;
function label(){const w=state?.workshop,b=binding(choice)||(choice==='default'?w?.previewDefaults?.back:null)||w?.cards.find(c=>c.id===w.activeCardId)?.bindings.back;return b?w?.resources.find(r=>r.id===b.resourceId)?.name||'当前卡背':'当前卡背';}
function close(){if(!dialog.open)return;dialog.close();for(const b of document.querySelectorAll<any>('[data-back-picker]'))b.setAttribute('aria-expanded','false');opener?.focus({preventScroll:true});}
function position(){const r=opener?.getBoundingClientRect();if(!r)return;const w=Math.min(560,innerWidth-24),h=Math.min(650,innerHeight-48);dialog.style.width=w+'px';dialog.style.maxHeight=h+'px';dialog.style.left=Math.max(12,Math.min(r.right-w,innerWidth-w-12))+'px';dialog.style.top=Math.max(12,Math.min(r.bottom+5,innerHeight-h-12))+'px';}
function updateSelection(){for(const b of $('back-picker-grid').querySelectorAll('[data-back-choice]'))b.setAttribute('aria-selected',String(b.dataset.backChoice===choice));const shared=binding(choice),current=state?.workshop?.cards.find(c=>c.id===state.workshop.activeCardId)?.bindings.back;const same=shared&&current&&shared.resourceId===current.resourceId&&shared.version===current.version;
 $('back-picker-apply').disabled=applying||state?.busy||!shared||same;$('back-picker-status').textContent=applying?'正在应用…':shared?(same?'已应用 · ':'预览中 · ')+label():'当前卡背';
 for(const b of document.querySelectorAll<any>('[data-back-picker]')){b.disabled=!state?.workshop||state.busy;const t=b.querySelector('[data-back-picker-label]');if(t)t.textContent=label();b.title='选择卡背 · '+label();}
}
function render(){if(!dialog.open)return;const w=state?.workshop;const selected=binding(choice)||w?.cards.find(c=>c.id===w.activeCardId)?.bindings.back;const items=C.candidates(w,{query:$('back-picker-search').value,history:$('back-picker-history').checked,selected});const key=JSON.stringify([w?.id,w?.activeCardId,state.document.revision,items.map(e=>[e.key,e.name]),$('back-picker-search').value]);
 if(key!==signature){signature=key;const grid=$('back-picker-grid');for(const im of grid.querySelectorAll('img'))im.dispatchEvent(new Event('back-thumbnail-remove'));grid.replaceChildren();
  const add=(item)=>{const tile=document.createElement('button');tile.type='button';tile.className='back-candidate';tile.dataset.backChoice=item.key;tile.setAttribute('role','option');tile.setAttribute('aria-label','预览卡背 '+item.name+(item.version?' v'+item.version:''));const image=document.createElement('img');image.alt=item.name+'效果预览';image.decoding='async';if(item.value?.src)window.atelierBackThumbnails.watch(image,(w?.id||'single')+'/'+item.key+(item.key==='authored'?'/'+w.activeCardId+'/'+state.document.revision:''),item.value);else image.hidden=true;const name=document.createElement('b');name.textContent=item.name;const meta=document.createElement('small');meta.textContent=item.version?'卡背 · v'+item.version+(item.latest?' · 最新':''):'卡片当前引用';tile.append(image,name,meta);tile.onclick=async()=>{try{if(applying||host.state().busy)return;await window.atelierComponents.chooseBack(item.key);}catch(e){$('back-picker-status').textContent=e.message;}};grid.append(tile);};
  if(!$('back-picker-search').value.trim()){let value;try{value=M.capture(state.document,'back');}catch{}add({key:'authored',name:'当前卡背',value});}items.forEach(add);$('back-picker-empty').hidden=grid.children.length>0;
 }updateSelection();
}
function refresh(next,value=choice){state=next;choice=value;updateSelection();if(!next.workshop){close();return;}if(dialog.open)render();}
function open(button){const next=host.state();if(!next.workshop||next.busy)return;state=next;choice=window.atelierComponents.backChoice();opener=button;if(!dialog.open)dialog.show();button.setAttribute('aria-expanded','true');signature='';render();position();$('back-picker-search').focus();}
for(const b of document.querySelectorAll<any>('[data-back-picker]'))b.onclick=()=>dialog.open?close():open(b);
$('back-picker-close').onclick=$('back-picker-done').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('keydown',(e: any)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)&&e.target.matches('[data-back-choice]')){e.preventDefault();const tiles=[...$('back-picker-grid').children],i=tiles.indexOf(e.target),columns=getComputedStyle($('back-picker-grid')).gridTemplateColumns.split(' ').length,step=e.key==='ArrowDown'?columns:e.key==='ArrowUp'?-columns:e.key==='ArrowLeft'?-1:1;tiles[e.key==='Home'?0:e.key==='End'?tiles.length-1:((i+step)%tiles.length+tiles.length)%tiles.length]?.focus();}});
$('back-picker-search').oninput=$('back-picker-history').onchange=()=>{signature='';render();};
$('back-picker-new').onclick=()=>{close();window.atelierBackEditor.open('',0,true);};
$('back-picker-apply').onclick=async()=>{if(applying)return;applying=true;updateSelection();try{await window.atelierComponents.applyBack();close();}catch(e){$('back-picker-status').textContent=e.message;}finally{applying=false;updateSelection();}};
document.addEventListener('pointerdown',(e: any)=>{if(dialog.open&&!dialog.contains(e.target)&&!e.target.closest('[data-back-picker]'))close();});window.addEventListener('resize',position);
const exposedatelierBackLibrary={refresh,open};
window.atelierBackLibrary=exposedatelierBackLibrary;refresh(host.state(),window.atelierComponents.backChoice());
return {atelierBackLibrary:exposedatelierBackLibrary};
})();
