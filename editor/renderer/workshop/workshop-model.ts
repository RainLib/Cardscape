/* Shared project graph. Source pixels live in resources; cards keep pinned references. */
import importedCardComponents from './component-model.ts';
import importedCardBack from './back-asset-model.ts';
import importedCardFrame from '../editing/frame-model.ts';
import importedCardRuntime from '../rendering/runtime-model.ts';

const api = (()=>{
'use strict';
const kinds={base:'承载底板',back:'卡背',frame:'卡框 / 窗体',material:'外观材质',effect:'卡内特效',particles:'粒子效果'};
const legacyKinds={...kinds,background:'背景图层'};



// Workshop data is plain JSON. Keep immutable image strings shared while copying
// editable records; structuredClone copies tens of MB on every history step.
function clone(value,seen=new Map<any, any>()){
 if(!value||typeof value!=='object')return value;if(seen.has(value))return seen.get(value);
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)return structuredClone(value);
 const out=Array.isArray(value)?new Array(value.length):{};seen.set(value,out);
 for(const key of Object.keys(value)){const item=clone(value[key],seen);if(key==='__proto__')Object.defineProperty(out,key,{value:item,writable:true,enumerable:true,configurable:true});else out[key]=item;}return out;
}
const idOk=id=>typeof id==='string'&&/^[\w-]{1,100}$/.test(id),image=src=>typeof src==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src);
function card(w,id=w.activeCardId){const c=w.cards.find(c=>c.id===id);if(!c)throw Error('卡片不存在');return c;}
function resource(w,id){const r=w.resources.find(r=>r.id===id);if(!r)throw Error('共享资源不存在');return r;}
function version(w,b){const r=resource(w,b.resourceId),v=r.versions.find(v=>v.version===b.version);if(!v)throw Error('资源版本不存在');return {resource:r,value:v.value};}
function capture(doc,kind){
 if(!kinds[kind])throw Error('资源分类无效；背景请在卡片图层中编辑');
 if(doc.componentScenes?.[kind])return clone(['material','particles'].includes(kind)?doc[kind]:doc.componentScenes[kind]);
 if(kind==='material')return importedCardComponents.material(doc.material);if(kind==='particles')return importedCardComponents.particles(doc.particles);
 if(kind==='frame')return {schema:'card-frame/1',style:importedCardFrame.resolve(doc)};
 if(kind==='back'){if(doc.backScene)return clone(doc.backScene);if(!image(doc.back))throw Error('卡片没有卡背图像');return {src:doc.back,...(doc.backStyle?{style:doc.backStyle}:{}),...(doc.backAdjustments?{adjustments:clone(doc.backAdjustments)}:{})};}
 if(kind==='effect'){const s={...importedCardRuntime.defaults.shader,...doc.shader};return {fragmentPrelude:s.fragmentPrelude||'',...(s.materialMaker?{materialMaker:clone(s.materialMaker)}:{}),fragmentBody:s.fragmentBody,fragmentMask:s.fragmentMask,fragmentStrength:s.fragmentStrength,targetKind:s.fragmentTarget==='all'?'all':doc.layers.find(l=>l.id===s.fragmentTarget)?.kind||'foreground',effects:{cape:!!doc.effects.cape,flow:!!doc.effects.flow,background:doc.effects.background??1}};}
 const l=doc.layers.find(l=>l.role==='baseplate');if(!l?.src)throw Error('先导入底板图层，或从文件添加共享底板');return {src:l.src,...(l.componentAdjustments?{adjustments:clone(l.componentAdjustments)}:{}),...(l.componentStyle?{style:l.componentStyle}:{}),...(l.sourceWindow?{sourceWindow:clone(l.sourceWindow)}:{})};
}
function apply(doc,kind,value){
 if(kind!=='back'){doc.componentScenes={...doc.componentScenes};if(value.document)doc.componentScenes[kind]=clone(value);else delete doc.componentScenes[kind];}
 if(kind==='material'||kind==='particles'){doc[kind]=clone(value);return;}
 if(kind==='frame'){doc.frameStyle=clone(value.style);return;}
 if(kind==='back'){if(value.schema==='card-back/1')doc.backScene=clone(value);else delete doc.backScene;doc.back=value.src;if(value.style)doc.backStyle=value.style;else delete doc.backStyle;if(value.adjustments)doc.backAdjustments=clone(value.adjustments);else delete doc.backAdjustments;return;}
 if(kind==='effect'){doc.shader={...importedCardRuntime.defaults.shader,...doc.shader,fragmentPrelude:value.fragmentPrelude||'',materialMaker:value.materialMaker?clone(value.materialMaker):undefined,fragmentBody:value.fragmentBody,fragmentMask:value.fragmentMask,fragmentStrength:value.fragmentStrength,fragmentTarget:value.targetKind==='all'?'all':doc.layers.find(l=>l.kind===value.targetKind)?.id||'foreground'};if(doc.shader.materialMaker)doc.shader.materialMaker.layerId=doc.shader.fragmentTarget;doc.effects={...doc.effects,...value.effects};return;}
 let l=doc.layers.find(l=>kind==='background'?l.kind==='background':l.role==='baseplate');
 if(!l){if(doc.layers.length>=64)throw Error('图层已达 64 层上限');l={id:kind==='base'?'workshop-base':'workshop-background',name:legacyKinds[kind],kind:kind==='background'?'background':'image',...(kind==='base'?{role:'baseplate'}:{}),x:0,y:0,scale:1,opacity:1,visible:true,locked:false};doc.layers.push(l);}
 l.src=value.src;if(value.style)l.componentStyle=value.style;if(value.adjustments)l.componentAdjustments=clone(value.adjustments);else delete l.componentAdjustments;if(value.sourceWindow)l.sourceWindow=clone(value.sourceWindow);else delete l.sourceWindow;
}
function strip(doc,kind){if(doc.componentScenes)delete doc.componentScenes[kind];if(kind==='material'||kind==='particles'){delete doc[kind];return;}if(kind==='frame'){delete doc.frameStyle;return;}if(kind==='back'){delete doc.backScene;delete doc.back;delete doc.backStyle;delete doc.backAdjustments;return;}if(kind==='effect'){for(const k of ['fragmentBody','fragmentPrelude','materialMaker','fragmentMask','fragmentStrength','fragmentTarget'] as const)delete doc.shader[k];for(const k of ['cape','flow','background'] as const)delete doc.effects[k];return;}const l=doc.layers.find(l=>kind==='background'?l.kind==='background':l.role==='baseplate');if(l){delete l.src;delete l.sourceWindow;delete l.componentAdjustments;delete l.componentStyle;}}
function resolve(w,id?: any){if(id===undefined&&w.editingAsset)return importedCardRuntime.ensure(clone(w.editingAsset.document));id??=w.activeCardId;const c=card(w,id),d=clone(c.document);for(const [kind,b] of Object.entries<any>(c.bindings))apply(d,kind,version(w,b).value);d.id=c.id;d.name=c.name;d.previewMode='authored';return importedCardRuntime.ensure(d);}
function equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const ak=Object.keys(a).filter(k=>a[k]!==undefined),bk=Object.keys(b).filter(k=>b[k]!==undefined);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
function commit(w,doc){if(w.editingAsset){const next=clone(w);next.editingAsset.document=clone(doc);next.editingAsset.name=doc.name;return next;}const next=clone(w),c=card(next),d=clone(doc);for(const [kind,b] of Object.entries<any>(c.bindings)){let same=false;try{same=equal(capture(d,kind),version(next,b).value);}catch{}if(same)strip(d,kind);else delete c.bindings[kind];}c.document=d;c.name=doc.name;c.document.id=c.id;return next;}
function create(doc,id,cardId,name){return {schema:'card-workshop/1',id,name:name||doc.name+'工坊',activeCardId:cardId,cards:[{id:cardId,name:doc.name,document:{...clone(doc),id:cardId,previewMode:'authored'},bindings:{}}],resources:[]};}
function add(w,doc,id,name){if(w.cards.length>=64)throw Error('工坊最多 64 张卡片');const next=clone(w);next.cards.push({id,name:name||doc.name,document:{...clone(doc),id,previewMode:'authored'},bindings:{}});next.activeCardId=id;return next;}
function duplicate(w,id,name){if(w.cards.length>=64)throw Error('工坊最多 64 张卡片');const next=clone(w),c=clone(card(next));c.id=id;c.name=name||c.name+' · 副本';c.document.id=id;c.document.name=c.name;next.cards.push(c);next.activeCardId=id;return next;}
function publish(w,{kind,name,value,id,resourceId}: any){const next=clone(w);if(!kinds[kind])throw Error('资源分类无效');let r=resourceId?resource(next,resourceId):null;if(r&&r.kind!==kind)throw Error('资源分类不一致');if(!r){if(next.resources.length>=256)throw Error('共享资源最多 256 项');r={id,name:name||kinds[kind],kind,versions:[]};next.resources.push(r);}if(r.versions.length>=32)throw Error('资源最多 32 个版本');r.versions.push({version:(r.versions.at(-1)?.version||0)+1,value:clone(value)});return {workshop:next,resourceId:r.id,version:r.versions.at(-1).version};}
function bind(w,kind,resourceId,ver,ids){const next=clone(w),r=resource(next,resourceId);if(!kinds[kind]||r.kind!==kind||!r.versions.some(v=>v.version===ver)||!ids.length)throw Error('请选择资源版本和应用卡片');for(const id of ids){const c=card(next,id);c.bindings[kind]={resourceId,version:ver};if(c.document.cosmetics&&['material','particles'].includes(kind))c.document.cosmetics={...c.document.cosmetics,[kind==='material'?'finish':'flare']:kind==='material'?'original':'authored'};const resolved=resolve(next,id);c.document=clone(resolved);for(const k of Object.keys(c.bindings))strip(c.document,k);}return next;}
function detach(w,kind){const next=clone(w),c=card(next),d=resolve(next);delete c.bindings[kind];c.document=d;for(const k of Object.keys(c.bindings))strip(c.document,k);return next;}
function uses(w,id){return [...w.cards.flatMap(c=>Object.entries<any>(c.bindings).filter(([,b]: any)=>b.resourceId===id).map(([kind,b]: any)=>({cardId:c.id,name:c.name,kind,version:b.version}))),...Object.entries<any>(w.previewDefaults||{}).filter(([,b]: any)=>b.resourceId===id).map(([kind,b]: any)=>({cardId:null,name:'工坊默认预览',kind,version:b.version}))];}
function preview(doc,w,choices: any={}){const d={...doc};if(!w)return d;for(const kind of Object.keys(kinds)){const choice=choices[kind]??'default',b=choice==='authored'?null:choice==='default'?w.previewDefaults?.[kind]:choice;if(!b)continue;const found=version(w,b);if(found.resource.kind!==kind)throw Error('预览组件分类不一致');if(kind==='base')d.layers=d.layers.map(l=>l.role==='baseplate'?{...l}:l);apply(d,kind,found.value);if(d.cosmetics&&['material','particles'].includes(kind))d.cosmetics={...d.cosmetics,[kind==='material'?'finish':'flare']:kind==='material'?'original':'authored'};if(kind==='frame'){const existing=d.layers.find(l=>l.kind==='frame');if(existing?.visible===false)d.layers=d.layers.map(l=>l===existing?{...l,visible:true}:l);else if(!existing){let id='preview-frame';while(d.layers.some(l=>l.id===id))id+='-';d.layers=[{id,name:'预览卡框',kind:'frame',x:0,y:0,scale:1,opacity:1,visible:true,locked:true},...d.layers];}}}return d;}
function setDefault(w,kind,binding){if(!kinds[kind])throw Error('默认预览组件分类无效');const next=clone(w);next.previewDefaults={...next.previewDefaults};if(binding){if(version(next,binding).resource.kind!==kind)throw Error('默认预览组件分类不一致');next.previewDefaults[kind]=clone(binding);}else delete next.previewDefaults[kind];return next;}
// Backgrounds belong to each card. Legacy shared artwork is detached on load;
// keep its original versions and unpublished drafts as a source-only backup.
function migrate(w,validateDocument=importedCardRuntime.validate){
 const removed=w?.resources?.filter(r=>r.kind==='background')||[];
 const drafts=Object.fromEntries(Object.entries<any>(w?.assetDrafts||{}).filter(([,d]: any)=>d.kind==='background'));
 const editing=w?.editingAsset?.kind==='background'?w.editingAsset:null;
 if(!removed.length&&!Object.keys(drafts).length&&!editing&&!w?.previewDefaults?.background&&!w?.cards?.some(c=>c.bindings?.background))return w;
 validateGraph(w,validateDocument,legacyKinds);
 const next=clone(w);
 for(const c of next.cards){const b=c.bindings.background;if(!b)continue;apply(c.document,'background',version(next,b).value);delete c.bindings.background;}
 const backup={resources:clone(removed),drafts:clone(drafts),...(editing?{editing:clone(editing)}:{}),...(next.previewDefaults?.background?{previewDefault:clone(next.previewDefaults.background)}:{})};
 next.backgroundArchive=[...(next.backgroundArchive||[]),backup];
 next.resources=next.resources.filter(r=>r.kind!=='background');
 if(next.previewDefaults)delete next.previewDefaults.background;
 if(next.assetDrafts)for(const key of Object.keys(drafts))delete next.assetDrafts[key];
 if(editing)delete next.editingAsset;
 return validate(next,validateDocument);
}
function validate(w,validateDocument=importedCardRuntime.validate){
 validateGraph(w,validateDocument);
 if(w.backgroundArchive!==undefined){
  if(!Array.isArray(w.backgroundArchive)||w.backgroundArchive.length>16)throw Error('背景兼容备份无效');
  for(const archive of w.backgroundArchive){
   if(!archive||!Array.isArray(archive.resources)||archive.resources.some(r=>r.kind!=='background')||Object.values<any>(archive.drafts||{}).some((d: any)=>d.kind!=='background')||archive.editing&&archive.editing.kind!=='background')throw Error('背景兼容备份无效');
   validateGraph({schema:'card-workshop/1',id:'background-archive',name:'背景兼容备份',activeCardId:'archive-card',cards:[{id:'archive-card',name:'背景备份',document:{schema:'card-atelier/1',width:1024,height:1536,layers:[],masks:{}},bindings:{}}],resources:archive.resources,assetDrafts:archive.drafts,editingAsset:archive.editing,previewDefaults:archive.previewDefault?{background:archive.previewDefault}:{}},validateDocument,legacyKinds);
  }
 }
 return w;
}
function validateGraph(w,validateDocument,allowedKinds=kinds){
 if(!w||w.schema!=='card-workshop/1'||!idOk(w.id)||typeof w.name!=='string'||!w.name.trim()||w.name.length>100||!Array.isArray(w.cards)||!w.cards.length||w.cards.length>64||!Array.isArray(w.resources)||w.resources.length>256)throw Error('工坊格式或数量无效');
 const ids=new Set<any>();for(const r of w.resources){if(!idOk(r.id)||ids.has(r.id)||!allowedKinds[r.kind]||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||!Array.isArray(r.versions)||!r.versions.length||r.versions.length>32)throw Error('共享资源无效');ids.add(r.id);let n=0;for(const v of r.versions){if(!Number.isSafeInteger(v.version)||v.version<=n||!v.value||typeof v.value!=='object')throw Error('共享资源版本无效');n=v.version;if(v.value.document){if(v.value.document.backScene||Object.keys(v.value.document.componentScenes||{}).length)throw Error('组件编辑文档不能嵌套组件');validateDocument(v.value.document);}if(r.kind==='frame'){if(v.value.schema!=='card-frame/1'||Object.keys(v.value).some(k=>!['schema','style','document','layerRasters','titleRasters'].includes(k))||v.value.style?.shape!=='rect')throw Error('3D 卡框组件格式无效');importedCardFrame.validate({frameStyle:v.value.style});}else if(r.kind==='material'){importedCardComponents.validateMaterial(v.value);}else if(r.kind==='particles'){importedCardComponents.validateParticles(v.value);}else if(r.kind==='back'&&v.value.schema==='card-back/1'){importedCardBack.validate(v.value);}else if(r.kind!=='effect'){if(!image(v.value.src))throw Error('共享图像无效');if(v.value.style&&!importedCardComponents.imageStyles.includes(v.value.style))throw Error('图像风格分类无效');if(v.value.adjustments){const a=v.value.adjustments;if(![[a.brightness,-100,100],[a.contrast,-100,100],[a.saturation,0,200],[a.gamma,.2,3]].every(([n,min,max]: any)=>Number.isFinite(n)&&n>=min&&n<=max))throw Error('共享图像调整无效');}const x=v.value.sourceWindow;if(x&&(!['x','y','width','height'].every(k=>Number.isFinite(x[k]))||x.x<0||x.y<0||x.width<1||x.height<1||x.x+x.width>8192||x.y+x.height>8192))throw Error('共享图像注册区域无效');}else{const x=v.value;if(typeof x.fragmentBody!=='string'||x.fragmentBody.length>4096||!['none','motion','inset','emission','phase','rigid','coverage','foil'].includes(x.fragmentMask)||!Number.isFinite(x.fragmentStrength)||x.fragmentStrength<0||x.fragmentStrength>3||!['all','foreground','background','image','text','frame'].includes(x.targetKind)||!x.effects||typeof x.effects.cape!=='boolean'||typeof x.effects.flow!=='boolean'||!Number.isFinite(x.effects.background)||x.effects.background<0||x.effects.background>1.5)throw Error('共享特效无效');}}}
 if(w.assetDrafts&&(typeof w.assetDrafts!=='object'||Array.isArray(w.assetDrafts)||Object.keys(w.assetDrafts).length>64))throw Error('组件草稿最多 64 项');
 if(w.previewDefaults!==undefined){if(!w.previewDefaults||typeof w.previewDefaults!=='object'||Array.isArray(w.previewDefaults))throw Error('默认预览格式无效');for(const [kind,b] of Object.entries<any>(w.previewDefaults)){if(!allowedKinds[kind]||!b||version(w,b).resource.kind!==kind)throw Error('默认预览引用无效');}}
 for(const draft of [w.editingAsset,...Object.values<any>(w.assetDrafts||{})].filter(Boolean)){if(!allowedKinds[draft.kind]||typeof draft.key!=='string'||!draft.document||draft.document.backScene)throw Error('资产草稿无效');if(draft.resourceId&&resource(w,draft.resourceId).kind!==draft.kind)throw Error('资产草稿分类无效');validateDocument(draft.document);}
 const cards=new Set<any>();for(const c of w.cards){if(!idOk(c.id)||cards.has(c.id)||typeof c.name!=='string'||!c.name.trim()||c.name.length>100||!c.document||!c.bindings||typeof c.bindings!=='object'||Array.isArray(c.bindings))throw Error('工坊卡片无效');cards.add(c.id);for(const [kind,b] of Object.entries<any>(c.bindings)){if(!allowedKinds[kind]||!b||version(w,b).resource.kind!==kind)throw Error('卡片资源引用无效');}validateDocument(resolve(w,c.id));}if(!cards.has(w.activeCardId))throw Error('当前卡片引用无效');return w;
}
async function encode(workshop){workshop=migrate(workshop);const sources=new Map<any, any>();function collect(v){if(typeof v==='string'&&v.startsWith('data:'))sources.set(v,null);else if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')Object.values<any>(v).forEach(collect);}collect(workshop);await Promise.all([...sources.keys()].map(async src=>{const bytes=new TextEncoder().encode(src),digest=await crypto.subtle.digest('SHA-256',bytes);sources.set(src,[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''));}));const blobs: Record<string, any>={};function walk(v){if(typeof v==='string'&&sources.has(v)){const id=sources.get(v);blobs[id]=v;return {$blob:id};}if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object')return Object.fromEntries(Object.entries<any>(v).map(([k,x]: any)=>[k,walk(x)]));return v;}return {schema:'card-workshop-file/1',project:walk(workshop),blobs};}
return {kinds,migrate,clone,card,resource,version,capture,apply,strip,resolve,commit,create,add,duplicate,publish,bind,detach,uses,preview,setDefault,validate,encode};
})();

export default api;
