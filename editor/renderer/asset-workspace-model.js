/* Component drafts share the card authoring document, never its front-card state. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./workshop-model.js'):root.CardWorkshop,typeof module==='object'&&module.exports?require('./runtime-model.js'):root.CardRuntime,typeof module==='object'&&module.exports?require('./back-asset-model.js'):root.CardBack,typeof module==='object'&&module.exports?require('./component-model.js'):root.CardComponents);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardAssetWorkspace=api;})(typeof window==='object'?window:this,(W,R,B,C)=>{
'use strict';
function documentFor(asset,blank,name,id,kind='back'){
 if(!W.kinds[kind])throw Error('组件分类无效');
 if(asset?.document){const d=W.clone(asset.document);d.id=id;d.name=name;d.assetKind=kind;if(kind==='frame'){const f=d.layers.find(l=>l.kind==='frame');if(f)f.locked=false;}delete d.backScene;delete d.componentScenes;return R.ensure(d);}
 const d=W.clone(blank);d.id=id;d.name=name;d.assetKind=kind;delete d.backScene;delete d.componentScenes;delete d.layerTree;for(const l of d.layers)if(l.kind==='foreground')l.name='效果母版 · 待导入';
 if(kind==='back'){
  const layers=B.layers(asset);if(layers.length)d.layers=layers.slice().reverse().map((l,i)=>({id:l.id,name:l.name,kind:i===0?'foreground':'image',src:l.src,...(i===0?{master:l.src}:{}),x:l.x,y:l.y,scale:l.scale,opacity:l.opacity,visible:l.visible,locked:false,blend:l.blend,adjustments:asset.adjustments,spatial:{role:i===0?'body':'surface',z:l.depth*(asset.parallax??1),clip:true}}));
  d.material={...B.create().material,...asset.material,target:'both'};
 }else{
  for(const l of d.layers)l.visible=false;
  if(kind==='base'&&asset.src){const l=d.layers.find(l=>l.kind==='foreground');Object.assign(l,{src:asset.src,master:asset.src,name:W.kinds[kind]+'主体',visible:true,adjustments:asset.adjustments,sourceWindow:asset.sourceWindow,spatial:{role:'body',z:0,clip:true}});}
  else if(kind==='frame'){W.apply(d,kind,asset);const frame=d.layers.find(l=>l.kind==='frame');frame.visible=true;frame.locked=false;}
  else if(['material','particles','effect'].includes(kind)){W.apply(d,kind,asset);if(kind==='particles'){d.particles=C.particles({...d.particles,enabled:asset.enabled??true});const f=d.layers.find(l=>l.kind==='frame');f.visible=true;f.previewReference=true;}if(kind!=='particles'){const l=d.layers.find(l=>l.kind==='background');l.visible=true;l.previewReference=true;l.name='预览参考 · 当前背景';}}
 }
 d.composition={top:false,right:false,bottom:false,left:false};d.effects={...d.effects,cape:false,flow:kind==='effect'};d.armor={...R.armorDefaults};d.actions=[{id:'idle',name:'组件待机',event:'idle',duration:4,loop:true,motion:1,emission:1,bend:0}];return R.ensure(d);
}
function start(workshop,{resourceId='',version=0,blank,name,kind='back',value=null}){
 const next=W.clone(workshop);if(next.editingAsset)next.assetDrafts={...next.assetDrafts,[next.editingAsset.key]:next.editingAsset};
 const r=resourceId?W.resource(next,resourceId):null;kind=r?.kind||kind;if(!W.kinds[kind])throw Error('组件分类无效');
 if(!r&&!blank?.id)throw Error('新资产需要独立文档 ID');const selected=version||r?.versions.at(-1).version||0,key=resourceId?resourceId+'@'+selected:blank.id;
 const saved=next.assetDrafts?.[key];next.editingAsset=saved?W.clone(saved):{key,kind,resourceId,version:selected,baseVersion:r?.versions.at(-1).version||0,name:r?.name||name||W.kinds[kind]+' · 新组件',document:documentFor(r?W.version(next,{resourceId,version:selected}).value:value||{},blank,r?.name||name||W.kinds[kind]+' · 新组件','asset-'+key.replace(/@/g,'-'),kind)};return next;
}
function leave(workshop){const next=W.clone(workshop);if(next.editingAsset){next.assetDrafts={...next.assetDrafts,[next.editingAsset.key]:next.editingAsset};delete next.editingAsset;}return next;}
function pack(doc,output,kind=doc.assetKind||'back'){
 if(!W.kinds[kind])throw Error('组件分类无效');
 const document=W.clone(doc);delete document.backScene;delete document.componentScenes;document.assetKind=kind;
 const metadata={document,layerRasters:output.layerRasters,titleRasters:output.titleRasters};
 if(kind!=='back'){
  if(kind==='base')return {src:output.front,...metadata};
  return {...W.capture(doc,kind),...metadata};
 }
 const layers=doc.layers.slice().reverse().map(l=>({id:l.id,name:l.name,src:output.layerRasters[l.id]||l.src,depth:Math.max(0,Math.min(.25,l.spatial?.z||0)),x:Math.max(-2048,Math.min(2048,l.x)),y:Math.max(-3072,Math.min(3072,l.y)),scale:Math.max(.1,Math.min(4,l.scale)),opacity:l.opacity,visible:l.visible,blend:l.blend||'normal'})).filter(l=>l.src);
 const value={schema:'card-back/1',src:output.front,parallax:1,material:{...B.create().material,...doc.material,target:'back'},layers,...metadata};B.validate(value);return value;
}
function publish(workshop,value,id){
 if(!workshop.editingAsset)throw Error('请先打开组件');const e=workshop.editingAsset;
 if(e.resourceId&&W.resource(workshop,e.resourceId).versions.at(-1).version!==e.baseVersion)throw Error('组件已有新版本，请重新打开后发布');
 const result=W.publish(workshop,{kind:e.kind,name:e.document.name,value,id,resourceId:e.resourceId||undefined}),next=result.workshop;
 W.resource(next,result.resourceId).name=e.document.name;const oldKey=next.editingAsset.key;
 next.editingAsset={...next.editingAsset,resourceId:result.resourceId,version:result.version,baseVersion:result.version,key:result.resourceId+'@'+result.version};
 if(next.assetDrafts)delete next.assetDrafts[oldKey];return {...result,workshop:next};
}
return {documentFor,start,leave,pack,publish};
});
