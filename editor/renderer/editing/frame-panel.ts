import importedCardFrame from './frame-model.ts';
import importedCardWorkshop from '../workshop/workshop-model.ts';
import importedCardStats from './card-stats.ts';
import importedCardCosmetics from './cosmetics-model.ts';
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost,model=importedCardFrame;
let state=null;
let themeRequest=0;
let animationArtwork=null;
const styleKeys=['width','corner','depth','bevel','color','accent','finish','animation','animationSpeed'];
const fieldTitles=new Map<any, any>(styleKeys.map(key=>[key,$('frame-'+key).title]));
const componentEdit=document.createElement('button');componentEdit.id='frame-component-edit';componentEdit.type='button';componentEdit.textContent='编辑边框组件…';componentEdit.hidden=true;$('frame-library-open').after(componentEdit);
const playback=document.createElement('button'),replay=document.createElement('button');
playback.id='frame-playback';playback.type='button';replay.id='frame-replay';replay.type='button';replay.textContent='从头播放';
playback.title='在 3D 中播放 / 暂停当前边框；2D 编辑画布显示静态素材';replay.title='从 0 秒重新播放，不修改边框素材或 Shader';componentEdit.after(playback,replay);
function artworkDocument(doc){const source=doc?.componentScenes?.frame?.document||(doc?.assetKind==='frame'?doc:null);return source?.layers?.some(l=>l.role==='frame-artwork'&&l.src)?source:null;}
function refreshPlayback(next=host.state()){
 const d=next.document,available=!!d&&(d.layers.some(l=>l.kind==='frame'&&l.visible!==false)||artworkDocument(d)?.layers.some(l=>l.role==='frame-artwork'&&l.visible!==false)),paused=$('preview-effects').checked===false||(window.cardPreview?.getView?.().paused??d?.effects?.paused??true);
 const text=paused?'播放边框':'暂停边框';if(playback.textContent!==text)playback.textContent=text;
 playback.disabled=replay.disabled=!available||next.busy;playback.hidden=replay.hidden=!d;
}
function playFrame(fromStart=false){
 const next=host.state();refreshPlayback(next);if(playback.disabled)return;
 const view=window.cardPreview?.getView?.()||{paused:undefined,time:0},paused=fromStart||$('preview-effects').checked===false?false:!(view.paused??next.document.effects?.paused??true);
 if(host.previewEffects(fromStart?0:(view.time||0),paused)===false)return;
 if(!paused)window.atelierWorkspace.enableEffectsPreview();refreshPlayback();
}
playback.onclick=()=>playFrame();replay.onclick=()=>playFrame(true);
window.addEventListener('atelier-preview-frame',()=>refreshPlayback());
function styleSource(doc){return artworkDocument(doc)||doc;}
function changeStyle(doc,key,value){
 const artwork=artworkDocument(doc);if(artwork&&key!=='depth')throw Error('图片边框的外形与流光请在边框组件中编辑');
 const style={...model.resolve(artwork||doc),[key]:value};doc.frameStyle=style;
 if(artwork&&artwork!==doc){const frame=doc.componentScenes.frame;doc.componentScenes={...doc.componentScenes,frame:{...frame,style:{...style},document:{...frame.document,frameStyle:{...style}}}};}
}
componentEdit.onclick=()=>{const next=host.state();if(next.busy||!next.workshop||next.document?.assetKind==='frame'||!artworkDocument(next.document))return;
 try{const current=importedCardWorkshop.commit(next.workshop,next.document),binding=importedCardWorkshop.card(current).bindings.frame;return window.atelierComponentEditor.open('frame',binding?.resourceId||'',binding?.version||0);}catch(e){host.say(e.message);}
};
$('frame-finish').replaceChildren(...model.finishes.map((v,i)=>new Option(['哑光','金属','霓虹','宇宙闪晶','磨损金属','蛛网纹','糖果条纹','冰晶','雪花纹','包装纸','火焰','银白幻彩火焰','金属链环','翡翠符文','幻彩折光','Overdrive 充能','Neon Nights 字牌','铜绿磨损','幻彩磨损','星轨银环 · 原创','双生极光 · 原创','Penny Arcade 彩绘喷溅','Brains 银白脑回','Halloween 紫橙糖果','Halloween 绿光贴纸'][i],v)));
function refresh(next){state=next;refreshPlayback(next);if(!next.document){componentEdit.hidden=true;return;}const doc=next.document,artwork=artworkDocument(doc),layer=doc.layers.find(l=>l.kind==='frame'),style=model.resolve(styleSource(doc)),selected=next.layer?.id===layer?.id,disabled=!selected||!!layer?.locked||next.busy;
 $('frame-owner').textContent=layer?.name||'无边框层';$('frame-edit-state').textContent=!layer?'工程没有边框层':!selected?'定位边框层后编辑；2D 与 3D 实时同步':layer.locked?'边框已锁定，先解锁再编辑样式':artwork?'图片决定框体外形；可调整承载厚度，图层与流光在组件内编辑。':'正在编辑边框 · 修改即时预览 · 可撤销';
 componentEdit.hidden=!artwork||doc.assetKind==='frame';componentEdit.disabled=next.busy||!next.workshop;componentEdit.title=next.workshop?'在主编辑区调整边框图层、Mask 与流光':'先打开工坊再编辑边框组件';
 $('frame-level-preset').disabled=disabled||!!artwork;$('frame-level-preset').title=artwork?'等级样式不能改变图片边框；可从边框配方切换':'';$('frame-select').disabled=!layer||next.busy;$('frame-unlock').hidden=!selected||!layer?.locked;$('frame-unlock').disabled=next.busy;
 for(const key of styleKeys){const el=$('frame-'+key);if(document.activeElement!==el)el.value=style[key];el.disabled=disabled||!!artwork&&key!=='depth';el.title=artwork?(key==='depth'?'调整承载厚度，保留边框图片与裁剪窗对齐':'此参数不能改变边框图片；请在组件内编辑素材或效果'):fieldTitles.get(key);}
 if(animationArtwork!==!!artwork){animationArtwork=!!artwork;$('frame-animation').replaceChildren(...(artwork?[new Option('组件图层 / Shader','component')]:model.animations.map((value,i)=>new Option(['静态','呼吸光','沿框流光','幻彩流光'][i],value))));}
 if(artwork){$('frame-animation').value='component';$('frame-animation').title='流光由边框组件的图层与 Shader 驱动；点击编辑边框组件，在效果预览中播放。';}else if(document.activeElement!==$('frame-animation'))$('frame-animation').value=style.animation;
 $('frame-animationSpeed').closest('label').hidden=!!artwork;
 for(const key of ['top','right','bottom','left'] as const){$('pop-'+key).checked=doc.composition[key];$('pop-'+key).disabled=next.busy;}const asset=doc.assetKind==='frame';$('pop-top').closest('details').hidden=asset;$('stats-cost').closest('details').hidden=asset;const values=importedCardStats.resolve(doc);for(const key of ['cost','power'] as const){const el=$('stats-'+key);if(document.activeElement!==el)el.value=values[key];el.disabled=next.busy;}if(document.activeElement!==$('stats-visible'))$('stats-visible').checked=values.visible;$('stats-visible').disabled=next.busy;if(document.activeElement!==$('stats-theme'))$('stats-theme').value=importedCardStats.resolveTheme(doc);$('stats-theme').disabled=next.busy||doc.layers.some(l=>importedCardStats.isStat(l)&&l.locked);
}
function edit(label,fn){try{const result=host.mutate(label,(doc)=>{if(state.layer?.kind!=='frame'||state.layer.locked)throw Error('先选择并解锁边框层');fn(doc);if(doc.cosmetics)doc.cosmetics={...doc.cosmetics,border:'custom'};doc.previewMode='authored';});if(result){$('frame-status').textContent=label+' · 2D / 3D 已同步';host.say(label+' · 可撤销');}refresh(host.state());}catch(e){host.say(e.message);$('frame-status').textContent=e.message;refresh(host.state());}}
function open(select=true){document.body.classList.remove('dock-collapsed','panels-hidden');window.atelierWorkspace.panel('frame');if(select)host.chooseFrame();window.atelierWorkspace.syncLayout();refresh(host.state());}
 $('frame-select').onclick=()=>host.chooseFrame();$('frame-unlock').onclick=()=>host.unlockFrame();$('preview-frame-open').onclick=()=>open();
 for(const key of styleKeys){const el=$('frame-'+key),apply=()=>{if(el.disabled||el.value===''||!el.validity.valid)return;const value=el.type==='number'?Number(el.value):el.value;if(value===model.resolve(styleSource(state.document))[key])return;edit('调整卡框 / '+key,doc=>changeStyle(doc,key,value));};el.onchange=apply;if(['number','color'].includes(el.type))el.oninput=apply;}
 for(const key of ['cost','power','visible'] as const)$('stats-'+key).onchange=()=>{const el=$('stats-'+key);if(key!=='visible'&&(el.value===''||!el.validity.valid))return;try{host.mutate('编辑卡片数值',doc=>importedCardStats.apply(doc,{[key]:key==='visible'?el.checked:Number(el.value)}));$('frame-status').textContent='顶部费用 / 战力已同步，可撤销';}catch(e){host.say(e.message);}refresh(host.state());};
 $('stats-theme').onchange=async()=>{const id=$('stats-theme').value,binding=host.state(),request=++themeRequest;try{await importedCardStats.loadTheme(id,host.loadImage);const current=host.state();if(request!==themeRequest||current.documentToken!==binding.documentToken||current.revision!==binding.revision){host.say('编辑目标已变化，请重新选择数值外观');refresh(host.state());return;}host.mutate('统一费用 / 战力外观',doc=>importedCardStats.apply(doc,{theme:id}));$('frame-status').textContent='费用 / 战力外观已同步，可撤销';}catch(e){host.say(e.message);}refresh(host.state());};
 for(const key of ['top','right','bottom','left'] as const)$('pop-'+key).onchange=()=>{try{host.mutate('调整人物破框方向',doc=>{doc.composition={...doc.composition,[key]:$('pop-'+key).checked};doc.previewMode='authored';});refresh(host.state());}catch(e){host.say(e.message);}};
 $('frame-level-preset').replaceChildren(new Option('选择等级样式…',''),...importedCardCosmetics.levels.filter(l=>l.id!=='authored').map(l=>new Option(l.name,l.id)));$('frame-level-preset').onchange=()=>{const id=$('frame-level-preset').value;if(id&&!$('frame-level-preset').disabled)edit('应用等级边框',d=>{if(artworkDocument(d))throw Error('图片边框请从边框配方切换');d.frameStyle=importedCardCosmetics.border(id,d.frameStyle);});$('frame-level-preset').value='';};
 const exposedatelierFrame={open,refresh};
window.atelierFrame=exposedatelierFrame;refresh(host.state());
return {atelierFrame:exposedatelierFrame};
})();
