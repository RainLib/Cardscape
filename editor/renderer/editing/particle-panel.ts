import importedCardComponents from '../workshop/component-model.ts';
import importedCardCosmetics from './cosmetics-model.ts';
import importedCardWorkshop from '../workshop/workshop-model.ts';
import importedCardRuntime from '../rendering/runtime-model.ts';
/* Named source regions and reusable particle settings use the same authoring canvas. */
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost,C=importedCardComponents;
$('particle-visual').replaceChildren(...C.particleVisuals.map((id,i)=>new Option(['柔光点','星芒','克拉克光点','条纹拖尾','余烬','六角雪花','彩色纸屑','钻石','透明气泡','自定义 PNG','纯色圆点','圆点与星芒','科技六角符号','香蕉','像素方块','心形','叶片','半调网点','发光闪片','星云与流星','科技光环','五瓣花朵','四趾爪印','披萨切片','星核交叠 · 原创','Adamantium 面具'][i],id)));
let mode='particles',regionId='',documentId='';
const current=()=>host.state(),config=(d=current().document)=>{const p=C.particles(d?.particles),id=d?.cosmetics?.flare;return importedCardCosmetics.presets[id]?importedCardCosmetics.particlePreset(id,p):p;};
function geometry(d=current().document){return mode==='regions'?d.emissionRegions?.find(r=>r.id===regionId):C.emitter(d.particles?.emitter);}
function source(){return mode==='regions'?current().document:C.source(host.emitterContext(),C.emitter(config().emitter).target);}
function options(id,items,value){const el=$(id),key=JSON.stringify(items);if(el.dataset.optionList!==key){el.dataset.optionList=key;el.replaceChildren(...items.map(([v,n]: any)=>new Option(n,v)));}el.value=value??'';}
function input(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function change(label,fn){try{host.mutate(label,d=>{if(mode==='particles'){d.particles=config(d);if(d.cosmetics)d.cosmetics={...d.cosmetics,flare:'authored'};}fn(d);});}catch(e){host.say(e.message);refresh();}}
function editGeometry(fn){change('设置发射区域',d=>{if(mode==='regions'){const r=d.emissionRegions?.find(r=>r.id===regionId);if(r)fn(r);}else{d.particles=C.particles(d.particles);d.particles.emitter=C.emitter(d.particles.emitter);fn(d.particles.emitter);}});host.redraw();}
function refresh(){
 const state=current(),d=state.document;if(!d)return;
 if(documentId!==d.id){documentId=d.id;regionId=d.emissionRegions?.[0]?.id||'';mode=['back','frame'].includes(d.assetKind)?'regions':'particles';}
 if(regionId&&!d.emissionRegions?.some(r=>r.id===regionId))regionId=d.emissionRegions?.[0]?.id||'';
 const p=config(d),e=C.emitter(p.emitter),src=source(),bound=mode==='particles'&&!!e.regionId,resolved=C.resolveEmitter(p,host.emitterContext()),g=bound?resolved.geometry:geometry();
 $('particle-settings').hidden=mode!=='particles';$('emission-region-settings').hidden=mode!=='regions';
 $('particle-edit-settings').setAttribute('aria-pressed',String(mode==='particles'));$('particle-edit-regions').setAttribute('aria-pressed',String(mode==='regions'));
 $('particle-edit-regions').hidden=d.assetKind==='particles';
 $('particle-enabled').checked=p.enabled;$('particle-reveal-enabled').checked=p.reveal.enabled;$('particle-reveal-only').checked=p.reveal.only;input('particle-reveal-visual',p.reveal.visual);input('particle-reveal-profile',p.reveal.profile);$('particle-reveal-stagger-field').hidden=p.reveal.profile!=='trails';for(const k of ['stagger','duration','count','size','travel','stretch'] as const)input('particle-reveal-'+k,p.reveal[k]);
 for(const k of ['count','lifetime','speed','spread','size','color','seed','z','stretch','visual','palette','blend','trajectory','placement','radius','opacity'] as const)input('particle-'+k,p[k]);$('particle-spriteTint').checked=p.spriteTint;$('particle-sprite-status').textContent=p.sprite?'已注册一张共享 PNG · '+(p.visual==='sprite'?'正在使用':'未启用'):'未导入 PNG';
 $('particle-radius-field').hidden=!['halo','field'].includes(p.trajectory);$('particle-spread-label').textContent=p.trajectory!=='outward'?'浮动幅度':'扩散';
 const bubble=p.visual==='bubble'&&p.trajectory==='halo',banana=p.visual==='banana'&&p.trajectory==='halo';$('particle-trajectory').querySelector('option[value="halo"]').textContent=bubble?'沿轮廓上浮':banana?'沿轮廓外移':'贴框环绕';
 $('particle-speed').title=bubble||banana?'每秒卡宽；0 停止位移与旋转':'';
 $('particle-radius-field').title=bubble||banana?'从选定轮廓发射；超过外侧范围后渐隐':'环绕时控制外浮距离；框缘漂浮时向区域外扩展，按卡宽计算';
 $('particle-z').title=p.placement==='surface'||e.target==='back'?'离发射面距离；正负输入均沿发射面外侧':'卡片本地 Z 偏移';$('particle-target').value=e.target;$('particle-side').value=e.side;
 const regions=src?.emissionRegions||[],items=[['','自定义区域'],...regions.map(r=>[r.id,r.name])];if(e.regionId&&!regions.some(r=>r.id===e.regionId))items.push([e.regionId,'区域已缺失 · 重新选择']);options('particle-region',items,e.regionId);
 options('emission-region-list',(d.emissionRegions||[]).map(r=>[r.id,r.name]),regionId);input('emission-region-name',g?.name||'');
 const layers=(src?.layers||[]).filter(l=>l.kind!=='frame'&&!l.previewReference);options('emission-layer',[['','整个组件'],...layers.map(l=>[l.id,l.name])],g?.layerId||'');
 $('emission-layer').disabled=state.busy||bound||!g||mode==='particles'&&e.target!=='layer';
 if(g){for(const k of ['shape','direction','angle'] as const)input('emission-'+k,g[k]);for(const k of ['u','v','width','height'] as const)input('emission-'+k,Math.round(g[k]*1000)/10);}
 $('emission-geometry').disabled=state.busy||!g||bound;
 $('emission-region-name').disabled=$('emission-region-delete').disabled=state.busy||!g;
 $('emission-region-add').disabled=state.busy||(d.emissionRegions?.length||0)>=32;
 for(const el of $('particle-settings').querySelectorAll('input,select,button'))el.disabled=state.busy;
 $('particle-reveal-play').disabled=state.busy||!p.enabled||!p.reveal.enabled;const halo=mode==='particles'&&p.trajectory==='halo';for(const id of ['emission-direction','emission-angle'] as const)$(id).closest('label').hidden=halo&&!['cosmic','bubble','banana','diamond'].includes(p.visual);
 $('particle-spread').max=halo?'1':'2';
 const bindings=state.workshop&&importedCardWorkshop.card(state.workshop).bindings;
 $('particle-open-source').disabled=state.busy||!['back','frame'].includes(e.target)||!(bindings?.[e.target]||state.workshop?.previewDefaults?.[e.target]);
 $('emission-status').textContent=mode==='regions'?(!g?'新增发射区域后，在画布点击或拖框':'') : !resolved.ok?resolved.reason:bound?'跟随 '+(regions.find(r=>r.id===e.regionId)?.name||'区域')+' · 在源组件中调整':e.target==='back'?'发射点随卡背翻转 · 深度沿卡背外侧':'';
 host.redraw();
}
$('particle-preset').replaceChildren(new Option('选择预设…',''),...Object.entries<any>(importedCardCosmetics.presets).map(([id,p]: any)=>new Option(p.name,id)));$('particle-preset').onchange=()=>{const id=$('particle-preset').value;if(id)change('应用粒子预设',d=>{d.particles=importedCardCosmetics.particlePreset(id,d.particles);if(d.cosmetics)d.cosmetics={...d.cosmetics,flare:'authored'};});$('particle-preset').value='';};
$('particle-reveal-play').onclick=()=>host.previewEffects(0,false,true);
for(const k of ['enabled','only','visual','profile','stagger','duration','count','size','travel','stretch'] as const)$('particle-reveal-'+k).onchange=()=>change('调整揭示闪光',d=>{d.particles.reveal=C.reveal({...d.particles.reveal,[k]:['enabled','only'].includes(k)?$('particle-reveal-'+k).checked:['visual','profile'].includes(k)?$('particle-reveal-'+k).value:Number($('particle-reveal-'+k).value)});});
$('particle-halo-tune').onclick=()=>change('贴框柔光',d=>{d.particles=C.softHalo(config(d));});
$('particle-edit-settings').onclick=()=>{mode='particles';refresh();};$('particle-edit-regions').onclick=()=>{mode='regions';refresh();};
$('particle-enabled').onchange=()=>change('启用粒子',d=>{if(d.cosmetics)d.cosmetics={...d.cosmetics,flare:'authored'};d.particles=C.particles({...d.particles,enabled:$('particle-enabled').checked});});
for(const k of ['count','lifetime','speed','spread','size','color','seed','z','stretch','visual','palette','blend','trajectory','placement','radius','opacity','spriteTint'] as const){
 const el=$('particle-'+k),numeric=el.type==='number';
 const apply=()=>{
  if(numeric&&(el.value===''||el.validity.badInput||el.validity.rangeUnderflow||el.validity.rangeOverflow||!Number.isFinite(Number(el.value))||['count','seed'].includes(k)&&!Number.isInteger(Number(el.value))))return;
  const value=k==='spriteTint'?el.checked:numeric?Number(el.value):el.value;
  change('调整粒子',d=>{if(d.cosmetics)d.cosmetics={...d.cosmetics,flare:'authored'};if(k==='visual'&&value==='sprite'&&!d.particles.sprite)throw Error('请先导入透明 PNG');d.particles=C.particles({...d.particles,...(k==='color'?{palette:'solid'}:{}),[k]:value});});
 };
 el.onchange=apply;if(numeric)el.oninput=apply;
}
$('particle-sprite-import').onclick=()=>$('particle-sprite-file').click();
$('particle-sprite-file').onchange=async()=>{const file=$('particle-sprite-file').files[0];$('particle-sprite-file').value='';if(!file)return;try{if(file.type!=='image/png'||file.size>1000000)throw Error('请选择 1MB 以内的透明 PNG');const sprite=await new Promise((resolve: any,reject: any)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('PNG 读取失败'));r.readAsDataURL(file);});C.validateSprite(sprite);await new Promise((resolve: any,reject: any)=>{const i: any=new Image();i.onload=resolve;i.onerror=()=>reject(Error('PNG 无法解码'));i.src=sprite;});change('导入自定义粒子',d=>{d.particles=C.particles({...d.particles,sprite,visual:'sprite',spriteTint:false,enabled:true,palette:'solid',blend:'normal',stretch:1});});}catch(e){host.say(e.message);}};
$('particle-sprite-clear').onclick=()=>change('移除自定义粒子',d=>{d.particles=C.particles({...d.particles,sprite:'',visual:d.particles.visual==='sprite'?'dust':d.particles.visual});});
$('particle-target').onchange=()=>change('选择粒子发射源',d=>{d.particles=C.particles(d.particles);d.particles.emitter=C.emitter({...d.particles.emitter,target:$('particle-target').value,regionId:'',layerId:$('particle-target').value==='layer'?host.emitterContext().layers.find(l=>l.visible&&l.kind!=='frame')?.id||'':''});if(d.particles.emitter.target==='back'){d.particles.placement='surface';d.particles.emitter.side='both';}});
$('particle-region').onchange=()=>editGeometry(e=>e.regionId=$('particle-region').value);
$('particle-side').onchange=()=>editGeometry(e=>e.side=$('particle-side').value);
$('particle-open-source').onclick=()=>{const s=current(),e=C.emitter(config().emitter),b=importedCardWorkshop.card(s.workshop).bindings[e.target]||s.workshop.previewDefaults?.[e.target];if(b)host.editComponent(e.target,b.resourceId,b.version).catch(error=>host.say(error.message));};
$('emission-region-list').onchange=()=>{regionId=$('emission-region-list').value;refresh();};
$('emission-region-add').onclick=()=>{const id='emit-'+crypto.randomUUID();change('新增发射区域',d=>{d.emissionRegions=[...(d.emissionRegions||[]),{...C.regionDefaults,id,name:'发射区域 '+((d.emissionRegions?.length||0)+1)}];});regionId=id;refresh();host.startEmitter();};
$('emission-region-delete').onclick=()=>change('删除发射区域',d=>d.emissionRegions=d.emissionRegions.filter(r=>r.id!==regionId));
$('emission-region-name').oninput=$('emission-region-name').onchange=()=>{const name=$('emission-region-name').value.trim();if(name)editGeometry(r=>r.name=name);};
for(const k of ['layerId','shape','direction','angle','u','v','width','height'] as const){const id=k==='layerId'?'emission-layer':'emission-'+k;$(id).onchange=()=>editGeometry(g=>g[k]=['layerId','shape','direction'].includes(k)?$(id).value:Number($(id).value)/(['u','v','width','height'].includes(k)?100:1));}
$('emission-draw').onclick=()=>host.startEmitter();
function canDraw(){const g=geometry();return document.body.dataset.inspectorPanel==='particles'&&!!g&&!(mode==='particles'&&g.regionId)&&!!source();}
function local(p,g){const l=source()?.layers?.find(l=>l.id===g.layerId);if(!l)return p;const pl=importedCardRuntime.placement(source(),l),x=p.x-512-pl.x,y=p.y-768-pl.y,c=Math.cos(pl.rotation),s=Math.sin(pl.rotation);return {x:(c*x+s*y)/pl.scale+512,y:(-s*x+c*y)/pl.scale+768};}
function drag(point,start,d){const g=geometry(d);if(!g)return;const q=local(point,g),a=local(start,g),clamp=x=>Math.max(0,Math.min(1,x)),x=clamp(q.x/1024),y=clamp(q.y/1536),u=clamp(a.x/1024),v=clamp(a.y/1536);const value=g.shape==='point'?{u:x,v:y}:{u:(u+x)/2,v:(v+y)/2,width:Math.max(.001,Math.abs(x-u)),height:Math.max(.001,Math.abs(y-v))};if(mode==='regions')Object.assign(g,value);else d.particles=C.particles({...d.particles,emitter:{...g,...value}});}
function draw(ctx,zoom){if(document.body.dataset.inspectorPanel!=='particles')return;const g=geometry();if(!g)return;const src=source();if(!src)return;const resolved=mode==='regions'?{ok:true,geometry:g,document:src,layer:src.layers?.find(l=>l.id===g.layerId)}:C.resolveEmitter(config(),host.emitterContext());if(!resolved.ok)return;const r=resolved.geometry,l=resolved.layer,pl=l?importedCardRuntime.placement(src,l):{x:0,y:0,rotation:0,scale:1};ctx.save();ctx.translate(512+pl.x,768+pl.y);ctx.rotate(pl.rotation);ctx.scale(pl.scale,pl.scale);const x=(r.u-.5)*1024,y=(r.v-.5)*1536,w=r.width*1024,h=r.height*1536;ctx.strokeStyle='#ffcb79';ctx.fillStyle='#ffcb7933';ctx.lineWidth=2/(zoom*pl.scale);ctx.setLineDash([6/zoom,4/zoom]);ctx.beginPath();if(r.shape==='point')ctx.arc(x,y,8/(zoom*pl.scale),0,Math.PI*2);else if(r.shape==='ellipse')ctx.ellipse(x,y,w/2,h/2,0,0,Math.PI*2);else ctx.rect(x-w/2,y-h/2,w,h);ctx.fill();ctx.stroke();ctx.setLineDash([]);ctx.font=`${12/(zoom*pl.scale)}px system-ui`;ctx.fillStyle='#ffdfaa';ctx.fillText(r.name||'粒子发射区域',x+12/(zoom*pl.scale),y-12/(zoom*pl.scale));ctx.restore();}
const exposedatelierParticles={refresh,draw,drag,canDraw};
window.atelierParticles=exposedatelierParticles;refresh();
return {atelierParticles:exposedatelierParticles};
})();
