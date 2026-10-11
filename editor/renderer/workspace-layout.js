(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardWorkspaceLayout=api;})(typeof window==='object'?window:this,()=>{
'use strict';
function normalize(saved={}){return {view:['edit','split','preview','space'].includes(saved.view)?saved.view:'split',axis:saved.axis==='columns'?'columns':'rows',ratio:Number.isFinite(saved.ratio)?Math.max(25,Math.min(75,saved.ratio)):60,lastPreview:['split','preview','space'].includes(saved.lastPreview)?saved.lastPreview:'split',effectsEnabled:saved.effectsEnabled!==false};}
function ratioFromPointer(axis,bounds,x,y){const length=axis==='rows'?bounds.height:bounds.width;if(length<=0)return 60;return Math.max(25,Math.min(75,Math.round(((axis==='rows'?y-bounds.top:x-bounds.left)/length)*100)));}
return {normalize,ratioFromPointer};
});
