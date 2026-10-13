/* Only pinned component references cross a drag; source pixels stay in the library. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./workshop-model.js'):root.CardWorkshop);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardAssetDrop=api;})(typeof window==='object'?window:this,W=>{
'use strict';
function capture(state,resourceId,version){
 if(state.workshop?.editingAsset)throw Error('请先返回正面卡片，再应用组件');
 if(state.busy||!state.workshop||!state.document)throw Error('请先结束当前编辑或处理');
 const r=W.resource(state.workshop,resourceId);if(!W.kinds[r.kind])throw Error('该条目不能作为组件应用');
 const pinned=version||r.versions.at(-1).version;W.version(state.workshop,{resourceId,version:pinned});
 return {projectId:state.workshop.id,documentToken:state.documentToken,revision:state.revision,resourceId,version:pinned,kind:r.kind,name:r.name};
}
function plan(state,source,cardId=state.workshop?.activeCardId){
 if(state.workshop?.editingAsset)throw Error('请先返回正面卡片，再应用组件');
 if(state.busy||!state.workshop||!state.document)throw Error('请先结束当前编辑或处理');
 if(source.projectId!==state.workshop.id)throw Error('工坊已切换，请重新拖动');
 if(source.documentToken!==state.documentToken||source.revision!==state.revision)throw Error('工程已变化，请重新拖动');
 const r=W.resource(state.workshop,source.resourceId);if(r.kind!==source.kind||!W.kinds[r.kind]||!Number.isSafeInteger(source.version))throw Error('组件分类或版本无效');
 W.version(state.workshop,{resourceId:r.id,version:source.version});const card=W.card(state.workshop,cardId),b=card.bindings[r.kind];
 return {changed:b?.resourceId!==r.id||b?.version!==source.version,kind:r.kind,name:r.name,cardId:card.id,cardName:card.name,args:{kind:r.kind,resourceId:r.id,version:source.version,ids:[card.id]}};
}
return {capture,plan};
});
