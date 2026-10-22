/* A reverse face is an independent asset, never a layer in the hero composition. */
import importedCardRuntime from '../rendering/runtime-model.ts';
import importedCardComponents from './component-model.ts';

const api = (()=>{
'use strict';
const adjustments={brightness:0,contrast:0,saturation:100,gamma:1};
const range=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
const image=s=>typeof s==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
function create(src=''){return {schema:'card-back/1',src,parallax:1,material:importedCardComponents.material({target:'back'}),layers:src?[{id:'base',name:'卡背底图',src,depth:0,x:0,y:0,scale:1.2,opacity:1,visible:true,blend:'normal'}]:[]};}
function fromDocument(doc){return doc.backScene||{src:doc.back,adjustments:doc.backAdjustments};}
function layers(asset){return asset?.schema==='card-back/1'?asset.layers:(asset?.src?[{id:'base',name:'卡背底图',src:asset.src,depth:0,x:0,y:0,scale:1,opacity:1,visible:true,blend:'normal'}]:[]);}
function placement(layer,asset,plane,camera=2.7){const z=plane+.001-layer.depth*(asset.parallax??1),registration=(camera+z)/(camera+plane);return {x:-layer.x/1024*registration,y:-layer.y/1024*registration,z,scale:layer.scale*registration};}
function validate(asset){
 if(!asset||asset.schema!=='card-back/1'||!image(asset.src)||!range(asset.parallax,0,1.5)||!Array.isArray(asset.layers)||!asset.layers.length||asset.layers.length>64)throw Error('卡背资产格式无效（1–64 个图层）');
 if(asset.document){if(asset.document.schema!=='card-atelier/1'||asset.document.backScene||!Array.isArray(asset.document.layers)||asset.document.layers.length>64||!asset.document.masks)throw Error('卡背编辑文档无效');(importedCardRuntime).validate(asset.document);}
 importedCardComponents.validateMaterial(asset.material);if(asset.material.target!=='back')throw Error('卡背材质只能用于卡背');
 const ids=new Set<any>();for(const l of asset.layers){if(!l||typeof l.id!=='string'||! /^[\w-]{1,100}$/.test(l.id)||ids.has(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>100||!image(l.src)||!range(l.depth,0,.25)||!range(l.x,-2048,2048)||!range(l.y,-3072,3072)||!range(l.scale,.1,4)||!range(l.opacity,0,1)||typeof l.visible!=='boolean'||!['normal','add'].includes(l.blend))throw Error('卡背图层参数无效');ids.add(l.id);}
 if(asset.adjustments&&!Object.entries<any>(adjustments).every(([k,v]: any)=>range(asset.adjustments[k]??v,k==='gamma'?.2:k==='saturation'?0:-100,k==='gamma'?3:k==='saturation'?200:100)))throw Error('卡背调色参数无效');
}
return {create,fromDocument,layers,placement,validate,adjustments};
})();

export default api;
