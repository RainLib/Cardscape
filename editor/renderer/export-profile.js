/* One persisted export policy, shared by authoring and the portable player.
 * Switching detail never changes the authored document, rig or animation clock. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CardExportProfile=factory();})(typeof window==='object'?window:globalThis,()=>{
'use strict';
const presets={source:{name:'原图保真',small:1,threshold:420,adaptive:false},'mobile-list':{name:'移动端列表',small:.25,threshold:420,adaptive:true},'mobile-detail':{name:'移动端详情',small:.5,threshold:360,adaptive:true},desktop:{name:'桌面端',small:.5,threshold:280,adaptive:true}};
function config(value={}){const p=presets[value.preset||'source'];if(!p)throw Error('未知导出预设');return {schema:'card-export-settings/1',preset:value.preset||'source',adaptive:value.adaptive??p.adaptive,threshold:value.threshold??p.threshold,smallParticles:value.smallParticles??false,smallMaterials:value.smallMaterials??false,smallDecorations:value.smallDecorations??false,remoteDelivery:value.remoteDelivery??false,includeSource:value.includeSource??(value.preset===undefined||value.preset==='source'),layers:{...value.layers}};}
function validate(value){const v=config(value);if(value.schema!==v.schema||['remoteDelivery','adaptive','smallParticles','smallMaterials','smallDecorations','includeSource'].some(k=>typeof v[k]!=='boolean')||!Number.isFinite(v.threshold)||v.threshold<160||v.threshold>1600||!value.layers||Array.isArray(value.layers)||Object.entries(v.layers).some(([k,v])=>!k||!['always','detail','omit'].includes(v)))throw Error('导出设置无效');return v;}
function tier(value,width,current=null){if(!value)return 'large';const v=config(value);if(!v.adaptive)return v.preset==='mobile-list'?'small':'large';if(!Number.isFinite(width)||width<0)return current||'small';return width>=(current==='large'?v.threshold*.85:v.threshold)?'large':'small';}
function effects(value,level){const c=value?config(value):null,large=!c||level==='large';return {particles:large||c.smallParticles,materials:large||c.smallMaterials,decorations:large||c.smallDecorations};}
function visible(value,id,level){const v=value?config(value):null,rule=v?.layers[id]||'always';return rule!=='omit'&&(rule!=='detail'||level==='large'||v.smallDecorations);}
function projectedWidth(width,height,zoom=1,scale=1,camera=2.7,dpr=1){return height*1.45*Math.min(1,width/Math.max(1,height)/.85)*Math.max(.01,zoom)*Math.max(.01,scale)/Math.max(.15,camera)*Math.min(2,Math.max(1,dpr));}
return {presets,config,validate,tier,effects,visible,projectedWidth};
});
