(() => {
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost,runtime=window.CardRuntime;
let state=null,actionId='idle',slotId='',documentId=null,shaderDraft=false,lastTool=null,maskChannel='motion';
const layoutKey='atelier-workspace-v5';
// Apply the new split direction once while retaining all other workspace preferences.
let saved={};try{const current=localStorage.getItem(layoutKey);saved=current?JSON.parse(current):{...JSON.parse(localStorage.getItem('atelier-workspace-v4')||'{}'),axis:'rows'};}catch{}
const previewLayout=window.CardWorkspaceLayout.normalize(saved);
function saveLayout(){localStorage.setItem(layoutKey,JSON.stringify({...previewLayout,view:document.querySelector('.view-stage').dataset.view,collapsed:document.body.classList.contains('dock-collapsed'),toolsHidden:document.body.classList.contains('tools-hidden'),focused:document.body.classList.contains('panels-hidden'),panel:document.querySelector('[data-panel-tab].active')?.dataset.panelTab}));}
function syncLayout(){
 const focused=document.body.classList.contains('panels-hidden'),visible=!focused&&!document.body.classList.contains('dock-collapsed'),tools=!focused&&!document.body.classList.contains('tools-hidden'),current=document.querySelector('[data-panel-tab].active')?.dataset.panelTab;
 for(const [id,on] of [['layout-left',tools],['layout-right',visible],['panels-toggle',focused]]){const b=$(id);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));if(id!=='panels-toggle')b.setAttribute('aria-expanded',String(on));}
 document.querySelectorAll('[data-inspector-view]').forEach(b=>{const on=visible&&b.dataset.inspectorView===current;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-expanded',String(on));});
 for(const b of document.querySelectorAll('#agent-open,[data-agent-toggle]')){const s=window.atelierAgentDock?.state(),on=!!s?.open&&!s.collapsed&&!focused;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-expanded',String(on));}
 $('dock-collapse').textContent=visible?'»':'«';saveLayout();
}
function layoutChanged(){syncLayout();requestAnimationFrame(()=>host.fit());}
function syncPreviewLayout(){const stage=document.querySelector('.view-stage');stage.dataset.axis=previewLayout.axis;stage.style.setProperty('--edit-share',previewLayout.ratio+'%');$('preview-axis').value=previewLayout.axis;$('preview-ratio').value=previewLayout.ratio;$('preview-ratio-value').textContent=previewLayout.ratio+'%';$('preview-effects').checked=previewLayout.effectsEnabled;const on=stage.dataset.view!=='edit';$('preview-toggle').textContent=on?'关闭预览':'开启预览';$('preview-toggle').setAttribute('aria-pressed',String(on));$('preview-splitter').setAttribute('aria-orientation',previewLayout.axis==='rows'?'horizontal':'vertical');$('preview-splitter').setAttribute('aria-valuenow',String(previewLayout.ratio));$('preview-splitter').setAttribute('aria-valuetext','编辑 '+previewLayout.ratio+'%，预览 '+(100-previewLayout.ratio)+'%');}
function view(name,fitView=true){if(!['edit','split','preview','space'].includes(name))name='split';if(name==='space'&&host.state().tool!=='move')document.querySelector('[data-tool=move]').click();previewLayout.view=name;if(name!=='edit')previewLayout.lastPreview=name;document.querySelector('.view-stage').dataset.view=name;document.querySelectorAll('button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));window.cardPreview.setActive?.(name!=='edit');window.dispatchEvent(new CustomEvent('atelier-view-change',{detail:{view:name}}));syncPreviewLayout();$('actual-view').disabled=name==='space';if(name==='space')$('zoom-status').textContent='空间查看';else if(name==='preview')$('zoom-status').textContent='3D 查看';if(fitView)requestAnimationFrame(()=>host.fit());saveLayout();}
function ensurePreview(){if(document.querySelector('.view-stage').dataset.view==='edit')view(previewLayout.lastPreview);}
function setPreviewEffects(value){previewLayout.effectsEnabled=!!value;$('preview-effects').checked=previewLayout.effectsEnabled;window.cardPreview.setEffectsEnabled?.(previewLayout.effectsEnabled);saveLayout();}
function enableEffectsPreview(){setPreviewEffects(true);if(!['split','preview'].includes(previewLayout.view))view(previewLayout.lastPreview==='preview'?'preview':'split');}
$('preview-toggle').onclick=()=>view(previewLayout.view==='edit'?previewLayout.lastPreview:'edit');$('preview-close').onclick=()=>view('edit');
$('preview-axis').onchange=()=>{previewLayout.axis=$('preview-axis').value;view(previewLayout.view==='space'?'space':'split');};
$('preview-ratio').oninput=()=>{previewLayout.ratio=Number($('preview-ratio').value);view(previewLayout.view==='space'?'space':'split',false);};$('preview-ratio').onchange=()=>host.fit();
$('preview-effects').onchange=()=>setPreviewEffects($('preview-effects').checked);
$('preview-layout-reset').onclick=()=>{previewLayout.ratio=60;view('split');};
const splitter=$('preview-splitter'),stage=document.querySelector('.view-stage');let resizing=false;
splitter.onpointerdown=e=>{if(e.button!==0)return;resizing=true;splitter.setPointerCapture(e.pointerId);stage.classList.add('resizing');e.preventDefault();};
splitter.onpointermove=e=>{if(!resizing)return;previewLayout.ratio=window.CardWorkspaceLayout.ratioFromPointer(previewLayout.axis,stage.getBoundingClientRect(),e.clientX,e.clientY);syncPreviewLayout();};
const finishResize=()=>{if(!resizing)return;resizing=false;stage.classList.remove('resizing');saveLayout();host.fit();};splitter.onpointerup=splitter.onpointercancel=splitter.onlostpointercapture=finishResize;
splitter.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();previewLayout.ratio=e.key==='Home'?50:Math.max(25,Math.min(75,previewLayout.ratio+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*(e.shiftKey?5:1)));syncPreviewLayout();saveLayout();host.fit();};

function panel(name,showTimeline=true){if(name==='agent'){window.atelierAgentDock?.open();return;}if(!['properties','masks','color','motion','slots','shader','frame','appearance','particles'].includes(name))name='properties';document.body.dataset.inspectorPanel=name;document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name);document.querySelectorAll('[data-panel-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.panelTab===name);b.setAttribute('aria-selected',String(b.dataset.panelTab===name));});const labels={properties:'图层与属性',masks:'效果区域 / Mask',color:'图像调整',motion:'动画动作',slots:'素材 Slots',shader:'Shader · 节点 / GLSL',frame:'卡框设置',appearance:'外观与等级',particles:'粒子 / 发射区域'};document.querySelector('.dock-heading span').textContent=labels[name];if(name==='motion'&&showTimeline)window.atelierAnimation?.open(false);syncLayout();window.atelierEditorUI?.refresh(host.state());}
document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
document.querySelectorAll('[data-panel-tab]').forEach(b=>b.onclick=()=>{document.body.classList.remove('dock-collapsed','panels-hidden');panel(b.dataset.panelTab);layoutChanged();});
function toggleInspector(name){const visible=!document.body.classList.contains('panels-hidden')&&!document.body.classList.contains('dock-collapsed'),current=document.querySelector('[data-panel-tab].active')?.dataset.panelTab;document.body.classList.remove('panels-hidden');document.body.classList.toggle('dock-collapsed',visible&&(!name||name===current));if(name)panel(name);layoutChanged();}
document.querySelectorAll('[data-inspector-view]').forEach(b=>b.onclick=()=>toggleInspector(b.dataset.inspectorView));
$('dock-collapse').onclick=$('layout-right').onclick=()=>toggleInspector();
$('layout-left').onclick=()=>{if(document.body.classList.contains('panels-hidden')){document.body.classList.remove('panels-hidden','tools-hidden');}else document.body.classList.toggle('tools-hidden');layoutChanged();};
const togglePanels=()=>{document.body.classList.toggle('panels-hidden');layoutChanged();};$('panels-toggle').onclick=togglePanels;
document.addEventListener('keydown',e=>{if(e.target.closest('#ai-dialog')||e.key!=='Tab'||(window.CardShortcuts.editable(e.target)||e.target.matches('button,summary'))||document.querySelector('dialog[open]:not(#ai-dialog)'))return;e.preventDefault();if(e.shiftKey)toggleInspector();else togglePanels();});
$('workspace-mode').onchange=()=>{if($('workspace-mode').value==='animate')window.atelierAnimation.open();else{window.atelierAnimation.close();panel('properties');}};
function openMaskPanel(){document.body.classList.remove('dock-collapsed','panels-hidden');panel('masks');layoutChanged();} $('mask-panel-open').onclick=$('effects-area-open').onclick=openMaskPanel;
$('selection-options').onclick=()=>{$('selection-options-panel').hidden=!$('selection-options-panel').hidden;};
// Secondary selection commands share the collapsible options shelf.
for(const id of ['select-alpha','extract-selection','create-mesh','guide-display','feather-mask'])$('selection-options-panel').append($(id));
for(const [id,toolName] of [['wand-tolerance','wand'],['wand-contiguous','wand'],['lasso-width','magnetic'],['close-lasso','lasso magnetic']]){const el=$(id);(el.closest('label')||el).dataset.options=toolName;}
for(const id of ['smart-mode','smart-engine','smart-reset','smart-engine-note']){const el=$(id);(el.closest('label')||el).dataset.options='smart';}
const icons={smart:'M2 7V2h5M13 2h5v5M18 13v5h-5M7 18H2v-5M7 7h6v6H7Z',wand:'M9 2v4M9 13v4M2 9h4M13 9h4M4 4l2 2M12 12l3 3M12 6l3-3M3 15l3-3',move:'M3 2v15l4-4 3 5 3-2-3-5h6Z',select:'M3 3h14v14H3Z',lasso:'M4 5C9 0 19 5 17 11S3 17 3 9C3 5 7 6 8 11s-1 6-3 8',magnetic:'M5 3v8c0 7 10 7 10 0V3M5 7h3M12 7h3',brush:'M5 15l9-12 3 3-10 11-4 1Z',hand:'M5 9V5c0-2 3-2 3 0v4-6c0-2 3-2 3 0v6-5c0-2 3-2 3 0v6-3c0-2 3-2 3 0v7c0 7-8 8-12 2L2 11c-1-2 1-3 3-2Z',zoom:'M12 12l6 6M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0'};
for(const [tool,path] of Object.entries(icons)){const b=document.querySelector(`[data-tool="${tool}"]`),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');p.setAttribute('d',path);svg.append(p);b.firstChild.replaceWith(svg);}
function tool(name){document.querySelectorAll('[data-options]').forEach(el=>el.hidden=!el.dataset.options.split(' ').includes(name));$('options-tip').textContent={move:'自动选层 · ⌘/Ctrl T 变换',select:'拖动选区 · 下方提取 / 修整',lasso:'逐点点击 · Enter 闭合',magnetic:'闭合后吸附边缘 · Enter',wand:'点击相近颜色 · 容差 / 连续区域',brush:'X 黑白 · [ ] 尺寸 · Mask 权重',smart:'点选对象 · Shift 添加 · Alt 排除 · 拖框定位',text:'右侧属性编辑字体与字标',hand:'空格临时抓手',zoom:'滚轮缩放 · ⌘/Ctrl 0 适合'}[name]||'';if(lastTool!==name){$('selection-options-panel').hidden=!['select','lasso','magnetic','wand','smart'].includes(name);lastTool=name;if(['select','lasso','magnetic','wand','smart','brush','text'].includes(name)&&['preview','space'].includes(document.querySelector('.view-stage').dataset.view))view('split');if(name==='text')panel('properties');}}
function options(id,items,selected,empty){const el=$(id);el.replaceChildren();if(empty)el.add(new Option(empty,''));for(const x of items)el.add(new Option(x.name,x.id));el.value=selected||'';}
function field(id,value,disabled=false){const el=$(id);if(document.activeElement!==el)el.type==='checkbox'?el.checked=!!value:el.value=value??'';el.disabled=disabled;}
function refresh(next){state=next;const d=next.document,l=next.layer;if(!d||!l)return;runtime.ensure(d);const changed=documentId!==(next.documentToken||d.id);if(changed){documentId=next.documentToken||d.id;actionId='idle';slotId='';shaderDraft=false;maskChannel='motion';}
 window.atelierSpace?.refresh({...next,busy:host.state().busy});refreshMasks(next);window.atelierFrame?.refresh(next);window.atelierAppearance?.refresh({...next,busy:host.state().busy});
 tool(next.tool);const disabled=l.locked||!l.src||next.busy;
 for(const [id,key,defaultValue] of [['adjust-brightness','brightness',0],['adjust-contrast','contrast',0],['adjust-saturation','saturation',100],['adjust-gamma','gamma',1]])field(id,l.adjustments?.[key]??defaultValue,disabled);
 field('layer-blend',l.blend||'normal',l.locked||next.busy||l.kind==='frame');$('adjust-reset').disabled=disabled;$('color-target').textContent=l.name;
 for(const key of ['bend','wind','speed'])field('deform-'+key,d.deformation[key],next.busy);
 if(!d.actions.some(a=>a.id===actionId))actionId=d.actions[0]?.id||'';options('action-list',d.actions,actionId);const a=d.actions.find(a=>a.id===actionId);
 for(const key of ['name','event','duration','loop','motion','emission','bend'])field('action-'+key,a?.[key],!a||next.busy);
 $('action-delete').disabled=d.actions.length<=1||next.busy;$('action-add').disabled=d.actions.length>=24||next.busy;
 if(!d.slots.some(s=>s.id===slotId))slotId=d.slots[0]?.id||'';options('slot-list',d.slots,slotId,d.slots.length?null:'无 Slot');const s=d.slots.find(s=>s.id===slotId);$('slot-fields').hidden=!s;
 for(const key of ['name','u','v','z','scale','rotation','clip','effect','strength','speed'])field('slot-'+key,['u','v'].includes(key)?(s?.[key]??.5)*100:s?.[key],!s||next.busy);
 $('slot-delete').disabled=!s||next.busy;$('slot-add').disabled=d.slots.length>=32||next.busy;options('layer-slot',d.slots,l.slotId,'不绑定');$('layer-slot').disabled=l.locked||!['image','text'].includes(l.kind)||next.busy;$('slot-replace').disabled=l.locked||l.kind!=='image'||next.busy;
 if(!shaderDraft){window.atelierShaderEditors.set('geometry-code',d.shader.geometryBody,{reset:changed});window.atelierShaderEditors.set('fragment-code',d.shader.fragmentBody,{reset:changed});}window.atelierShaderNodes?.refresh(next);window.atelierShaderEditors.readonly(next.busy);$('shader-apply').disabled=next.busy;$('shader-reset').disabled=next.busy;
 options('fragment-target',[{id:'all',name:'全部图层'},...d.layers],d.shader.fragmentTarget);field('fragment-mask',d.shader.fragmentMask,next.busy);field('fragment-strength',d.shader.fragmentStrength,next.busy);
 document.querySelectorAll('[data-refine]').forEach(b=>b.disabled=!next.selection||next.busy);
 $('activity-brief').textContent=$('history-log').textContent;window.atelierAnimation?.refresh(next,actionId,changed);window.atelierCharacterWorkspace?.refresh();window.atelierPreviewPlayer?.refresh(next);window.atelierEditorUI?.refresh(next);
}
const maskGuides={
 motion:{name:'运动',tip:'涂披风与发梢，根部保持固定。',white:'摆动末端',black:'固定肩部 / 发根'},
 inset:{name:'框内 / 破框',tip:'先在卡框设置中选择允许破框的方向。',white:'留在框内',black:'允许穿出卡框'},
 emission:{name:'发光',tip:'只涂武器刻槽、宝石与能量纹路；柔化边缘控制过渡。',white:'允许发光',black:'保留原画'},
 phase:{name:'流光进度',tip:'在发光区域内按黑 → 灰 → 白绘制光经过的路径。',white:'流光终点',black:'流光起点'},
 foil:{name:'盔甲反光',tip:'涂金属甲片，皮肤和衣料留黑。',white:'参与扫光',black:'不反光'},
 rigid:{name:'刚性保护',tip:'涂手、护腕和武器，避免拖动和摆动变形。',white:'保持刚性',black:'允许运动'},
 coverage:{name:'可见轮廓',tip:'修整透明边缘；灰色表示半透明。',white:'可见',black:'透明'}
};
function refreshMasks(next){
 const people=next.document.layers.filter(l=>l.kind==='foreground'),same=next.layer.kind==='foreground',person=same?next.layer:people[0],locked=same&&next.layer.locked,enabled=same&&!locked&&!next.busy;
 if(same&&next.target!=='image')maskChannel=next.target;
 const guide=maskGuides[maskChannel];$('mask-owner').textContent='';options('mask-layer',people,person?.id,'');$('mask-layer').disabled=next.busy||!people.length;
 $('mask-state-note').textContent=!person?'请先导入人物图层':!same?'定位人物母版后开始制作':locked?'图层已锁定，请先解锁':next.target==='image'?'选择下方用途开始涂抹':'正在编辑 '+guide.name+' 区域';
 $('mask-current-name').textContent=guide.name;$('mask-channel-help').textContent=guide.tip;$('mask-white-help').textContent=guide.white;$('mask-black-help').textContent=guide.black;
 const map=host.spaceMask(maskChannel)?.canvas,ctx=$('mask-map').getContext('2d');ctx.clearRect(0,0,80,120);if(map)ctx.drawImage(map,0,0,80,120);
 $('mask-region-highlight').disabled=!person||next.busy;$('mask-person-select').disabled=!person||next.busy;$('mask-person-select').hidden=same;$('mask-person-unlock').hidden=!locked;$('mask-person-unlock').disabled=next.busy;
 for(const b of document.querySelectorAll('[data-mask-channel]')){b.disabled=!person||next.busy;const on=b.dataset.maskChannel===maskChannel;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
 for(const id of ['mask-start-brush','mask-start-smart','mask-start-rect','mask-write-mode','mask-write-gradient','mask-brush-size','mask-brush-strength'])$(id).disabled=!enabled;
 for(const b of document.querySelectorAll('[data-mask-paint]')){b.disabled=!enabled;b.setAttribute('aria-pressed',String((b.dataset.maskPaint==='white'?255:0)===(next.brushValue??(next.white?255:0))));}
 field('mask-brush-size',$('brush-size').value,!enabled);field('mask-brush-strength',$('brush-strength').value,!enabled);$('mask-display-mode').value=next.maskDisplayMode;$('mask-display-mode').disabled=!enabled;
 $('mask-write-selection').disabled=!enabled||!next.selection;$('mask-soften').disabled=!enabled||next.target==='image';$('mask-toggle-preview').disabled=!same||next.busy;$('mask-toggle-preview').textContent=next.showMask?'隐藏区域':'显示区域';$('mask-play-preview').disabled=!person||next.busy;
 const effect=['motion','emission','phase','foil'].includes(maskChannel);$('mask-effect-setting').hidden=!effect;$('mask-effect-enabled').checked=maskChannel==='motion'?next.document.effects.cape:maskChannel==='foil'?next.document.armor.enabled:next.document.effects.flow;$('mask-effect-enabled').disabled=next.busy;$('mask-effect-label').textContent=maskChannel==='motion'?'启用披风运动':maskChannel==='foil'?'启用盔甲反光':'启用武器流光';
}
$('mask-layer').onchange=()=>{if(host.selectLayer($('mask-layer').value))host.chooseMask(maskChannel);};
for(const b of document.querySelectorAll('[data-mask-paint]'))b.onclick=()=>{host.chooseMask(maskChannel);host.setMaskBrush(b.dataset.maskPaint==='white');};
for(const [id,original] of [['mask-brush-size','brush-size'],['mask-brush-strength','brush-strength']])$(id).oninput=$(id).onchange=()=>{if($(id).value!==''&&$(id).validity.valid)$(original).value=$(id).value;};
$('mask-display-mode').onchange=()=>{const mode=$('mask-display-mode').value;host.chooseMask(maskChannel);host.setMaskDisplay(mode);};
$('mask-effect-enabled').onchange=()=>host.mutate('启用 / 关闭区域效果',d=>{if(maskChannel==='motion')d.effects.cape=$('mask-effect-enabled').checked;else if(maskChannel==='foil')d.armor.enabled=$('mask-effect-enabled').checked;else d.effects.flow=$('mask-effect-enabled').checked;});
$('preview-region-mode').onchange=()=>host.setRegionMode($('preview-region-mode').value);
$('mask-region-highlight').onclick=()=>{host.chooseMask(maskChannel);view('split');host.setRegionMode('mask',maskChannel);};
$('mask-play-preview').onclick=()=>{view('split');previewLayout.effectsEnabled=true;window.cardPreview.setEffectsEnabled(true);syncPreviewLayout();saveLayout();if($('toggle-play').textContent==='播放')$('toggle-play').click();host.say('右侧播放最终效果；拖动卡片查看框内外和视差');};
$('mask-person-select').onclick=()=>host.chooseMask(maskChannel);
$('mask-person-unlock').onclick=()=>host.unlockMaskLayer();
document.querySelectorAll('[data-mask-channel]').forEach(b=>b.onclick=()=>{maskChannel=b.dataset.maskChannel;host.chooseMask(maskChannel);});
for(const [id,name] of [['mask-start-brush','brush'],['mask-start-smart','smart'],['mask-start-rect','select']])$(id).onclick=()=>host.chooseMask(maskChannel,name);
$('mask-write-selection').onclick=()=>{$('selection-target').value=maskChannel;$('selection-mode').value=$('mask-write-mode').value;$('selection-gradient').value=$('mask-write-gradient').value;$('apply-selection').click();};
$('mask-toggle-preview').onclick=()=>{if(host.state().target==='image')host.chooseMask(maskChannel);else $('mask-display').click();};
$('mask-soften').onclick=()=>$('feather-mask').click();
function change(label,fn){try{host.mutate(label,fn);}catch(e){host.say(e.message);refresh(host.state());}}
for(const [id,key] of [['adjust-brightness','brightness'],['adjust-contrast','contrast'],['adjust-saturation','saturation'],['adjust-gamma','gamma']])$(id).onchange=()=>change('图像调整 / '+key,(d,l)=>{l.adjustments={brightness:0,contrast:0,saturation:100,gamma:1,...l.adjustments,[key]:Number($(id).value)};});
$('adjust-reset').onclick=()=>change('重置图像调整',(d,l)=>delete l.adjustments);
$('layer-blend').onchange=()=>change('图层混合模式',(d,l)=>l.blend=$('layer-blend').value);
for(const key of ['bend','wind','speed'])$('deform-'+key).onchange=()=>{const value=Number($('deform-'+key).value);host.activateRuntime();change('卡片形变 / '+key,d=>d.deformation[key]=value);};
$('action-list').onchange=()=>{actionId=$('action-list').value;refresh(host.state());};
for(const key of ['name','event','duration','loop','motion','emission','bend'])$('action-'+key).onchange=()=>change('动作属性 / '+key,d=>{const a=d.actions.find(a=>a.id===actionId),el=$('action-'+key);a[key]=key==='loop'?el.checked:['name','event'].includes(key)?el.value:Number(el.value);});
$('action-add').onclick=()=>change('新增动作',d=>{actionId='action-'+crypto.randomUUID();d.actions.push({...runtime.defaults.actions[2],id:actionId,name:'新动作'});});
$('action-delete').onclick=()=>{if(state.busy||state.document.actions.length<=1)return;window.cardPreview.stopAction();change('删除动作（可撤销）',d=>{d.actions=d.actions.filter(a=>a.id!==actionId);});};
$('action-play').onclick=()=>{ensurePreview();window.atelierAnimation?.play();$('action-status').textContent='播放：'+state.document.actions.find(a=>a.id===actionId)?.name;};
$('slot-list').onchange=()=>{slotId=$('slot-list').value;refresh(host.state());};
$('slot-add').onclick=()=>change('新增素材 Slot',d=>{slotId='slot-'+crypto.randomUUID();d.slots.push({id:slotId,name:'新插槽',u:.5,v:.5,z:.16,scale:1,rotation:0,clip:false,effect:'none',strength:1,speed:1});});
$('slot-delete').onclick=()=>change('删除 Slot 并解除绑定',d=>{d.slots=d.slots.filter(s=>s.id!==slotId);for(const l of d.layers)if(l.slotId===slotId)delete l.slotId;});
for(const key of ['name','u','v','z','scale','rotation','clip','effect','strength','speed'])$('slot-'+key).onchange=()=>change('Slot 属性 / '+key,d=>{const s=d.slots.find(s=>s.id===slotId),el=$('slot-'+key);s[key]=key==='clip'?el.checked:['name','effect'].includes(key)?el.value:Number(el.value)/(['u','v'].includes(key)?100:1);});
$('layer-slot').onchange=()=>{const value=$('layer-slot').value;host.activateRuntime();change('图层绑定 Slot',(d,l)=>{l.slotId=value||undefined;});};
$('slot-replace').onclick=()=>host.replaceImage();
$('geometry-code').oninput=$('fragment-code').oninput=()=>{shaderDraft=true;$('shader-status').textContent='代码草稿 · 尚未应用 · ⌘/Ctrl Enter 编译';$('shader-status').classList.remove('error');};
 const fragmentExamples={none:runtime.surfaceBody,flow:'float wave = pow(0.5 + 0.5 * sin(mask.a * 35.0 - time * 4.0), 3.0);\ncolor.rgb += vec3(0.05, 0.85, 1.2) * wave;\nreturn color;',foil:'float shine = pow(0.5 + 0.5 * sin(uv.x * 18.0 + uv.y * 8.0 + angle.x * 7.0), 8.0);\ncolor.rgb += vec3(0.7, 0.35, 0.9) * shine;\nreturn color;',dissolve:'float noise = fract(sin(dot(floor(uv * 120.0), vec2(12.9898, 78.233))) * 43758.5453);\nfloat threshold = 0.35 + 0.25 * sin(time);\ncolor.a *= smoothstep(threshold, threshold + 0.06, noise);\nreturn color;'};
 $('fragment-example').onchange=()=>{window.atelierShaderEditors.set('fragment-code',fragmentExamples[$('fragment-example').value]);shaderDraft=true;$('shader-status').textContent='示例已载入 · 编译后应用';};
 for(const [id,key] of [['fragment-target','fragmentTarget'],['fragment-mask','fragmentMask'],['fragment-strength','fragmentStrength']])$(id).onchange=()=>{host.activateRuntime();change('Shader 效果参数',d=>d.shader[key]=key==='fragmentStrength'?Number($(id).value):$(id).value);};
$('shader-apply').onclick=()=>{if(window.atelierShaderNodes?.mode()==='nodes'){window.atelierShaderNodes.apply();return;}try{const body=$('geometry-code').value;if(body.length>4096)throw Error('几何函数最多 4096 字符');host.compile({...state.document.shader,editorMode:'glsl',geometryBody:body,fragmentBody:$('fragment-code').value});shaderDraft=false;window.atelierShaderEditors.clearDiagnostics();$('shader-status').textContent='编译成功 · 已应用 · 可撤销';$('shader-status').classList.remove('error');}catch(e){window.atelierShaderEditors.error(e);$('shader-status').textContent='编译失败，保留之前效果：\n'+e.message;$('shader-status').classList.add('error');}};
$('shader-reset').onclick=()=>{if(window.atelierShaderNodes?.mode()==='nodes'){window.atelierShaderNodes.reset();return;}window.atelierShaderEditors.set('geometry-code',runtime.geometryBody);window.atelierShaderEditors.set('fragment-code',runtime.surfaceBody);shaderDraft=true;$('shader-apply').click();};
document.querySelectorAll('[data-refine]').forEach(b=>b.onclick=()=>host.refine(b.dataset.refine,Number($('refine-radius').value)));
for(const id of ['slot-name','action-name'])$(id).oninput=$(id).onchange;
for(const el of document.querySelectorAll('.inspector input[type=number]'))el.oninput=()=>{if(el.value!==''&&el.validity.valid)el.onchange?.();};
document.addEventListener('pointerdown',e=>{for(const d of document.querySelectorAll('.space-popover[open],.status-activity[open]'))if(!d.contains(e.target))d.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const d of document.querySelectorAll('.space-popover[open],.status-activity[open]')){d.open=false;d.querySelector('summary').focus();}});
window.atelierWorkspace={refresh,tool,panel,view,syncLayout,ensurePreview,enableEffectsPreview,selectAction(id){actionId=id;refresh(host.state());}};
if(saved.collapsed)document.body.classList.add('dock-collapsed');if(saved.toolsHidden)document.body.classList.add('tools-hidden');if(saved.focused)document.body.classList.add('panels-hidden');window.cardPreview.setEffectsEnabled?.(previewLayout.effectsEnabled);view(previewLayout.view);panel(saved.panel==='agent'?'properties':saved.panel||'properties');refresh(host.state());
})();
