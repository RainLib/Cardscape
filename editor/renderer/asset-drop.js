/* Pointer-based asset placement works in Electron and keeps ordinary clicks intact. */
(() => {
'use strict';
const host=window.cardEditorHost,M=window.CardAssetDrop,W=window.CardWorkshop;
const sourceSelector='[data-asset-drag-id]',receiverSelector='#canvas-wrap,#author-model-canvas,#model-canvas,#space-canvas,.space-viewport,.ws-card[data-card-id],#ws-card-tabs [data-card-id]';
const ghost=document.createElement('div'),hint=document.createElement('div'),feedback=document.createElement('div');
ghost.id='asset-drag-ghost';ghost.hidden=true;ghost.setAttribute('aria-hidden','true');hint.id='asset-drop-hint';hint.hidden=true;hint.setAttribute('aria-hidden','true');feedback.id='asset-drop-feedback';feedback.hidden=true;feedback.setAttribute('role','status');document.body.append(ghost,hint,feedback);
let drag=null,highlight=null,pending=false,suppressUntil=0,feedbackTimer=0;
function clearTarget(){highlight?.classList.remove('asset-drop-target');highlight=null;hint.hidden=true;document.body.classList.remove('asset-drag-accepted');}
function finish(status='cancelled'){
 const captured=drag;drag=null;clearTarget();ghost.hidden=true;document.body.classList.remove('asset-dragging');document.body.dataset.assetDragState=status;
 if(captured?.started){suppressUntil=performance.now()+300;captured.source.classList.remove('asset-drag-source');try{if(document.body.hasPointerCapture(captured.pointerId))document.body.releasePointerCapture(captured.pointerId);}catch{}}
}
function notify(text,error=false){clearTimeout(feedbackTimer);feedback.textContent=text;feedback.dataset.error=String(error);feedback.hidden=false;feedbackTimer=setTimeout(()=>feedback.hidden=true,error?5500:3200);host.say(text);}
function destination(e){
 const hit=document.elementFromPoint(e.clientX,e.clientY),el=hit?.closest(receiverSelector);if(!el||el.closest('[inert]')||el.closest(sourceSelector))return null;
 const state=host.state(),explicit=el.dataset.cardId;
 if(!explicit&&window.atelierWorkshopTabs.closed())return null;
 return {el,plan:M.plan(state,drag.payload,explicit||state.workshop?.activeCardId)};
}
function update(e){
 clearTarget();let result=null,message='拖到卡片画布、预览或正面卡标签';
 try{result=destination(e);if(result){const p=result.plan;message=p.changed?'松手 · 应用'+W.kinds[p.kind]+'到「'+p.cardName+'」':'此卡片已使用该版本';highlight=result.el;highlight.classList.add('asset-drop-target');document.body.classList.add('asset-drag-accepted');const r=highlight.getBoundingClientRect();hint.textContent=message;hint.style.left=Math.max(6,Math.min(r.left+8,innerWidth-326))+'px';hint.style.top=Math.max(6,Math.min(r.top+8,innerHeight-48))+'px';hint.hidden=false;}}catch(error){message=error.message;}
 const text=drag.payload.name+' · v'+drag.payload.version+'\n'+(result?'＋ ':'')+message;if(ghost.textContent!==text)ghost.textContent=text;
 ghost.style.left=Math.max(6,Math.min(e.clientX+16,innerWidth-280))+'px';ghost.style.top=Math.max(6,Math.min(e.clientY+16,innerHeight-72))+'px';return result;
}
document.addEventListener('pointerdown',e=>{
 const source=e.target.closest(sourceSelector);if(!source||e.button!==0||pending||source.closest('[inert]')||document.body.dataset.appMode!=='editor')return;
 const state=host.state();if(state.workshop?.editingAsset)return;
 try{const payload=M.capture(state,source.dataset.assetDragId,Number(source.dataset.assetDragVersion));drag={source,payload,pointerId:e.pointerId,x:e.clientX,y:e.clientY,started:false};}catch(error){host.say(error.message);}
},true);
document.addEventListener('dragstart',e=>{if(e.target.closest(sourceSelector))e.preventDefault();},true);
document.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.pointerId)return;if(!drag.started){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.started=true;drag.source.classList.add('asset-drag-source');document.body.classList.add('asset-dragging');document.body.dataset.assetDragState='moving';ghost.hidden=false;feedback.hidden=true;try{document.body.setPointerCapture(e.pointerId);}catch{}}
 e.preventDefault();e.stopPropagation();update(e);
},{capture:true,passive:false});
document.addEventListener('pointerup',async e=>{
 if(!drag||e.pointerId!==drag.pointerId)return;if(!drag.started){drag=null;return;}e.preventDefault();e.stopImmediatePropagation();
 let result;try{result=destination(e);}catch(error){finish('rejected');notify(error.message,true);return;}
 finish(result?'applying':'cancelled');if(!result)return;const p=result.plan;pending=true;
 try{
  if(p.changed)await host.workshop('bind',p.args);
  const state=host.state();if(state.workshop?.activeCardId===p.cardId){window.atelierComponents.revealAuthored([p.kind]);window.atelierWorkspace.ensurePreview();host.activateRuntime();}
  window.atelierWorkshop.selectAsset(p.args.resourceId,p.args.version);document.body.dataset.assetDragState='applied';document.body.dataset.assetDropKind=p.kind;document.body.dataset.assetDropCard=p.cardId;
  notify((p.changed?'已应用':'已使用')+'「'+p.name+'」v'+p.args.version+' · '+p.cardName+(p.changed?' · 可撤销':''));
 }catch(error){document.body.dataset.assetDragState='rejected';notify(error.message,true);}finally{pending=false;}
},true);
document.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag?.started){e.preventDefault();e.stopImmediatePropagation();finish();}},true);
document.addEventListener('pointercancel',()=>{if(drag)finish();},true);window.addEventListener('blur',()=>{if(drag)finish();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&drag)finish();});
})();
