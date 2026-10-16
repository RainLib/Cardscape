/* Format adapters produce native data. They are registered by application code,
 * never scripts from an imported asset. Unsupported features must be reported. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./character-animation-model.js'):root.CardCharacterAnimation);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardCharacterImport=api;})(typeof window==='object'?window:globalThis,rig=>{
'use strict';
const schema='card-character-animation-import/1';
function pack(doc){return {schema,characterRig:structuredClone(doc.characterRig),actions:structuredClone((doc.actions||[]).filter(a=>a.boneTracks&&Object.keys(a.boneTracks).length))};}
function createRegistry(){
 const adapters=new Map();
 function register(adapter){if(!adapter||!/^[-a-z0-9]{1,64}$/.test(adapter.id)||typeof adapter.convert!=='function'||adapters.has(adapter.id))throw Error('人物动画导入适配器无效或重复');adapters.set(adapter.id,adapter);}
 register({id:'cardscape',convert(value){if(!value||value.schema!==schema)throw Error('人物动画交换格式无效');return value;}});
 function convert(format,payload,doc,options={}){const adapter=adapters.get(format);if(!adapter)throw Error('尚未安装 '+format+' 人物动画导入适配器');const input=typeof payload==='string'?JSON.parse(payload):structuredClone(payload),result=adapter.convert(input,{document:structuredClone(doc),layerMap:{...options.layerMap}});if(!result||result.schema!==schema||!result.characterRig||!Array.isArray(result.actions)||Object.keys(result).some(k=>!['schema','characterRig','actions','unsupported'].includes(k)))throw Error('人物动画适配结果无效');if(result.unsupported?.length)throw Error('导入包含不支持的能力：'+result.unsupported.join('、'));if(result.actions.length>24||new Set(result.actions.map(a=>a.id)).size!==result.actions.length)throw Error('导入动作数量或 ID 无效');const next=structuredClone(doc);next.characterRig=structuredClone(result.characterRig);for(const a of next.actions||[])delete a.boneTracks;for(const a of result.actions){const i=next.actions.findIndex(old=>old.id===a.id);if(i<0)next.actions.push(structuredClone(a));else next.actions[i]=structuredClone(a);}(typeof module==='object'&&module.exports?require('./runtime-model.js'):window.CardRuntime).validate(next);return next;}
 return {register,convert,formats:()=>[...adapters.keys()]};
}
return {schema,pack,createRegistry};
});
