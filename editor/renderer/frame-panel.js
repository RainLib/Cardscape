(() => {
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost,model=window.CardFrame;
let state=null;
function refresh(next){state=next;if(!next.document)return;const doc=next.document,layer=doc.layers.find(l=>l.kind==='frame'),style=model.resolve(doc),selected=next.layer?.id===layer?.id,disabled=!selected||!!layer?.locked||next.busy;
 $('frame-owner').textContent=layer?.name||'无边框层';$('frame-edit-state').textContent=!layer?'工程没有边框层':!selected?'定位边框层后编辑；2D 与 3D 实时同步':layer.locked?'边框已锁定，先解锁再编辑样式':'正在编辑边框 · 修改即时预览 · 可撤销';
 $('frame-select').disabled=!layer||next.busy;$('frame-unlock').hidden=!selected||!layer?.locked;$('frame-unlock').disabled=next.busy;
 for(const key of ['width','corner','depth','bevel','color','accent','finish']){const el=$('frame-'+key);if(document.activeElement!==el)el.value=style[key];el.disabled=disabled;}
 for(const key of ['top','right','bottom','left']){$('pop-'+key).checked=doc.composition[key];$('pop-'+key).disabled=next.busy;}const values=window.CardStats.resolve(doc);for(const key of ['cost','power']){const el=$('stats-'+key);if(document.activeElement!==el)el.value=values[key];el.disabled=next.busy;}if(document.activeElement!==$('stats-visible'))$('stats-visible').checked=values.visible;$('stats-visible').disabled=next.busy;
}
function edit(label,fn){try{const result=host.mutate(label,(doc)=>{if(state.layer?.kind!=='frame'||state.layer.locked)throw Error('先选择并解锁边框层');fn(doc);doc.previewMode='authored';});if(result){$('frame-status').textContent=label+' · 2D / 3D 已同步';host.say(label+' · 可撤销');}refresh(host.state());}catch(e){host.say(e.message);$('frame-status').textContent=e.message;refresh(host.state());}}
function open(select=true){document.body.classList.remove('dock-collapsed','panels-hidden');window.atelierWorkspace.panel('frame');if(select)host.chooseFrame();window.atelierWorkspace.syncLayout();refresh(host.state());}
 $('frame-select').onclick=()=>host.chooseFrame();$('frame-unlock').onclick=()=>host.unlockFrame();$('preview-frame-open').onclick=()=>open();
 for(const key of ['width','corner','depth','bevel','color','accent','finish']){const el=$('frame-'+key),apply=()=>{if(el.value===''||!el.validity.valid)return;const value=el.type==='number'?Number(el.value):el.value;if(value===model.resolve(state.document)[key])return;edit('调整卡框 / '+key,doc=>doc.frameStyle={...model.resolve(doc),[key]:value});};el.onchange=apply;if(['number','color'].includes(el.type))el.oninput=apply;}
 for(const key of ['cost','power','visible'])$('stats-'+key).onchange=()=>{const el=$('stats-'+key);if(key!=='visible'&&(el.value===''||!el.validity.valid))return;try{host.mutate('编辑卡片数值',doc=>window.CardStats.apply(doc,{[key]:key==='visible'?el.checked:Number(el.value)}));$('frame-status').textContent='顶部费用 / 战力已同步，可撤销';}catch(e){host.say(e.message);}refresh(host.state());};
 for(const key of ['top','right','bottom','left'])$('pop-'+key).onchange=()=>{try{host.mutate('调整人物破框方向',doc=>{doc.composition={...doc.composition,[key]:$('pop-'+key).checked};doc.previewMode='authored';});refresh(host.state());}catch(e){host.say(e.message);}};
 window.atelierFrame={open,refresh};refresh(host.state());
})();
