/* Local inspection only. No region state belongs in a saved card or export. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./spatial-model.js'):root.CardSpatial);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardPreviewRegion=api;})(typeof window==='object'?window:this,(spatial)=>{
'use strict';
function pass(doc,layer,state){
 if(!layer||!state||state.mode==='none')return 0;
 const owner=doc.layers.find(l=>l.id===state.layerId);if(!owner)return 0;
 const shared=['mask','selection','channels'].includes(state.mode)&&owner.kind==='foreground'&&layer.splitSourceId===owner.id;
 if(layer.id!==owner.id&&!shared)return 0;
 if(state.mode==='layer')return 1;
 if(state.mode==='mask'||state.mode==='selection')return state.map?2:0;
 if(state.mode==='connection')return spatial.connection(doc,layer)?3:0;
 if(state.mode==='channels')return spatial.character(layer)?4:0;
 return 0;
}
return {pass};
});
