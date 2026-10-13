/* A single catalog for playable fronts and independently authored components. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardWorkshopCatalog=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const tags={front:'正面卡',back:'卡背',base:'承载底板',frame:'卡框',material:'外观材质',effect:'卡内特效',particles:'粒子',components:'组件'};
const isComponent=e=>e.tag!=='front'&&e.tag!=='back';
function entries(workshop){
 if(!workshop)return [];
 return [...workshop.cards.map(c=>({key:'front:'+c.id,tag:'front',name:c.name,cardId:c.id,thumbnail:c.thumbnail||'',bindings:c.bindings})),
  ...workshop.resources.filter(r=>Object.hasOwn(tags,r.kind)).map(r=>{const v=r.versions.at(-1);return {key:r.kind+':'+r.id,tag:r.kind,name:r.name,resourceId:r.id,version:v.version,thumbnail:v.value.src||'',value:v.value};})];
}
function filter(items,tag='all',query=''){const q=query.trim().toLocaleLowerCase();return items.filter(e=>(tag==='all'||(tag==='components'?isComponent(e):e.tag===tag))&&(!q||(e.name+' '+tags[e.tag]).toLocaleLowerCase().includes(q)));}
function candidates(workshop,{query='',history=false,selected=null}={}){
 const items=[];for(const r of workshop?.resources||[]){if(r.kind!=='back')continue;for(const v of r.versions){if(!history&&v!==r.versions.at(-1)&&!(selected?.resourceId===r.id&&selected.version===v.version))continue;items.push({key:r.id+'@'+v.version,tag:'back',name:r.name,resourceId:r.id,version:v.version,thumbnail:v.value.src,value:v.value,latest:v===r.versions.at(-1)});}}
 return filter(items,'back',query);
}
return {tags,entries,filter,candidates};
});
