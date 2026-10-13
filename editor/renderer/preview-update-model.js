/* Resource changes are independent of camera, animation and document revision. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardPreviewUpdate=api;})(typeof window==='undefined'?globalThis:window,()=>{
'use strict';
function equal(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&equal(a[k],b[k]));
}
function textureKey(l){return l.kind==='foreground'?'foreground':l.kind==='background'?'background':l.id;}
function plan(previous,next){
 const old=new Map((previous?.layers||[]).map(l=>[l.id,l])),keys=new Set((next.layers||[]).map(textureKey));
 return {
  compatible:!!previous&&previous.id===next.id&&previous.previewMode==='authored'&&next.previewMode==='authored'&&previous.width===next.width&&previous.height===next.height,
  images:(next.layers||[]).filter(l=>l.src&&(!old.has(l.id)||old.get(l.id).src!==l.src||textureKey(old.get(l.id))!==textureKey(l)||old.get(l.id).role!==l.role||!equal(old.get(l.id).sourceWindow,l.sourceWindow))),
  removed:[...new Set((previous?.layers||[]).map(textureKey))].filter(k=>!keys.has(k)),
  masks:Object.keys(next.masks||{}).filter(id=>previous?.masks?.[id]!==next.masks[id]),
  removedMasks:Object.keys(previous?.masks||{}).filter(id=>!(id in (next.masks||{}))),
  back:previous?.back!==next.back,
  geometry:!equal(previous?.foregroundMesh,next.foregroundMesh)
 };
}
return {equal,textureKey,plan};
});
