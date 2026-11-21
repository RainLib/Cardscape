import importedCardSpatial from '../rendering/spatial-model.ts';
/* A selected-layer inspector, compact AI workbench and delayed contextual help. */
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost,workspace=window.atelierWorkspace;
const el=(tag,text?: any)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const sidebar=$('inspector-dock'),scroll=sidebar.querySelector('.inspector-scroll');
const heading=el('div');heading.className='layer-context-heading';
heading.innerHTML='<strong id="selected-layer-name" data-ui-content></strong><span id="selected-layer-kind"></span><button id="selected-layer-highlight" aria-label="高亮选中图层" title="在 3D 中定位当前图层">◎</button>';
scroll.before(heading);
const tabs=el('nav');tabs.className='inspector-context-tabs';tabs.setAttribute('aria-label','选中图层的编辑方式');
for(const [id,name] of [['properties','属性'],['masks','效果区域'],['motion','动画']] as const){const b=el('button',name);b.dataset.contextPanel=id;b.onclick=()=>{document.body.classList.remove('dock-collapsed','panels-hidden');workspace.panel(id);refresh(host.state());};tabs.append(b);}heading.after(tabs);
$('selected-layer-highlight').onclick=()=>{workspace.view('split');host.setRegionMode('layer');};
const add=el('details');add.className='layer-add-menu';add.innerHTML='<summary aria-label="新增图层">＋</summary><div><button id="layer-add-image">图片图层…</button><button id="layer-add-text">文字图层</button><button id="layer-add-mask">效果 Mask</button></div>';
sidebar.querySelector('.layers-panel .panel-heading').append(add);
$('layer-add-image').onclick=()=>{add.open=false;host.command('import');};
$('layer-add-text').onclick=async()=>{add.open=false;try{await window.cardAIHost.applyCommands([{op:'createText',layerId:'text-'+crypto.randomUUID(),name:'文字',text:'新文字',x:0,y:-600}]);workspace.panel('properties');}catch(e){host.say(e.message);}};
$('layer-add-mask').onclick=()=>{add.open=false;workspace.panel('masks');};
const space=el('details');space.className='fold layer-space-controls';space.open=true;space.innerHTML='<summary>空间与视差</summary><label>角色 <select id="layer-space-role" aria-label="选中图层空间角色"></select></label><label>Z 深度 <input id="layer-space-depth" aria-label="选中图层 Z 深度" type="number" min="-0.4" max="0.4" step="0.005"></label><output id="layer-space-limit" hidden></output><div class="button-row"><button id="layer-space-back" title="向后移动 0.01">后移</button><button id="layer-space-front" title="向前移动 0.01">前移</button><button id="layer-space-view">空间查看</button></div>';
document.querySelector('[data-panel="properties"] .fold').after(space);
for(const [id,spec] of Object.entries<any>(importedCardSpatial.roles))$('layer-space-role').add(new Option(spec.name,id));
space.dataset.help='Z 控制独立平面之间的距离，越靠前视差越明显；图层列表控制绘制顺序。灰度 Mask 控制局部效果权重。武器保持刚性平面，避免逐像素深度使它变形。';
function depth(value){const s=host.state(),l=s.layer;if(!l||l.locked)return;try{host.mutate('调整图层空间深度',(d,next)=>importedCardSpatial.set(d,next,{role:importedCardSpatial.role(next),z:Math.max(-.4,Math.min(.4,value))}));}catch(e){host.say(e.message);}}
$('layer-space-depth').oninput=()=>{if($('layer-space-depth').value!==''&&$('layer-space-depth').validity.valid)depth(Number($('layer-space-depth').value));};
$('layer-space-role').onchange=()=>{try{host.mutate('设置图层空间角色',(d,l)=>importedCardSpatial.set(d,l,{role:$('layer-space-role').value}));}catch(e){host.say(e.message);}};
for(const [id,offset] of [['layer-space-back',-.01],['layer-space-front',.01]] as const)$(id).onclick=()=>depth(Number($('layer-space-depth').value)+offset);
$('layer-space-view').onclick=()=>workspace.view('space');
// Keep the target and channels together instead of repeating them in the layer tree.
for(const b of document.querySelectorAll<any>('[data-mask-channel]')){const small=b.querySelector('small');b.title=small?.textContent||b.textContent;small?.remove();}
const owner=$('mask-layer').closest('.mask-step'),ownerFold=el('details');ownerFold.className='fold mask-owner-options';ownerFold.append(el('summary','效果母版'));owner.before(ownerFold);ownerFold.append(owner);
$('action-status').hidden=true;
const maskTools=$('mask-write-selection').closest('details');if(maskTools)maskTools.open=false;
const grayTools=$('mask-brush-value').closest('details');document.querySelector('.mask-brush-settings').after(grayTools);
for(const id of ['mask-gradient-start','mask-weight-value'] as const)maskTools.insertBefore($(id).closest('label'),$('mask-write-selection'));
(document.querySelector('.mask-weight-legend') as any).hidden=true;
const workflow=$('region-workflow');if(workflow)workflow.open=false;
// Static explanatory text becomes help on its surrounding control group. Dynamic
// errors, progress and target identifiers remain visible.
for(const note of document.querySelectorAll<any>('.inspector .panel-note,.inspector .font-note')){
 if(note.id||note.getAttribute('role')==='status'||note.querySelector('button,input,select'))continue;
 const owner=note.closest('details')?.querySelector('summary')||note.parentElement;owner.dataset.help=[owner.dataset.help,note.textContent.trim()].filter(Boolean).join('\n');note.hidden=true;
}
for(const id of ['mask-channel-help','mask-white-help','mask-black-help','options-tip'] as const)$(id).hidden=true;
const ai=$('ai-dialog');ai.classList.add('ai-workbench');
const aiConfig=el('details');aiConfig.className='ai-workbench-config';aiConfig.append(el('summary','Agent 与模型设置'));const toolbar=ai.querySelector('.ai-toolbar');toolbar.before(aiConfig);aiConfig.append(toolbar);
// Configuration lives in AI Settings; quick choices stay beside the conversation/artwork.
aiConfig.querySelector('summary').textContent='图片任务默认配置';
const aiQuick=el('div');aiQuick.className='agent-quick-select ai-quick-select';aiQuick.setAttribute('aria-label','图片任务快捷选择');
const adapter=$('ai-adapter'),adapterLabel=adapter.closest('label');aiQuick.append(adapter);adapterLabel.remove();
const aiModel=el('select');aiModel.id='ai-model-picker';aiModel.setAttribute('aria-label','图片任务快捷模型');aiQuick.append(aiModel);
aiConfig.before(aiQuick);$('agent-preferences-image').append(aiConfig);
ai.querySelector('.ai-heading').insertBefore($('ai-settings'),$('ai-close'));$('ai-settings').textContent='⚙';$('ai-settings').setAttribute('aria-label','图片任务设置');
aiQuick.append($('ai-inspect-open'));$('ai-inspect-open').textContent='放大对照';
$('ai-mode').closest('label').hidden=true;
const aiModes=el('nav');aiModes.className='ai-mode-tabs';aiModes.setAttribute('aria-label','图片编辑操作');
for(const [id,name] of [['edit','改图'],['inpaint','局部重绘'],['outpaint','扩画'],['generate','生成素材']] as const){const b=el('button',name);b.dataset.aiMode=id;b.onclick=()=>{const select=$('ai-mode');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));};aiModes.append(b);}aiQuick.before(aiModes);
const imageTabs=el('nav');imageTabs.className='ai-image-tabs';imageTabs.setAttribute('aria-label','图片任务查看方式');
for(const [id,name] of [['source','源图与选区'],['result','候选结果'],['compare','对照']] as const){const b=el('button',name);b.dataset.aiImageView=id;b.onclick=()=>{ai.dataset.imageView=id;syncAI();window.atelierSourceEditor?.resume?.();};imageTabs.append(b);}ai.querySelector('.ai-previews').before(imageTabs);ai.dataset.imageView='source';
$('ai-context').classList.add('ai-target-name');$('ai-source-instruction').hidden=true;$('ai-apply-note').hidden=true;
ai.querySelector('.ai-source-stage').dataset.help='局部重绘：直接涂抹需要修改的位置。Alt 擦除，空格拖动，滚轮缩放。扩画：拖动边缘或角点扩大范围。';
aiConfig.append($('ai-capability'));$('ai-new').textContent='使用当前图层';ai.querySelector('.ai-heading').insertBefore($('ai-new'),$('ai-close'));
const aiPrompt=$('ai-prompt').closest('label');ai.querySelector('.ai-previews').after(aiPrompt);
const compose=$('chat-input').parentElement,options=el('div');options.className='chat-operation-options';for(const row of [...compose.querySelectorAll('.chat-context-row')] as const)options.append(row);$('agent-preferences-operations').append(options);
$('agent-preferences-chat').append($('chat-configuration'));$('chat-configuration').open=true;
const dockPosition=$('agent-dock-position'),positionLabel=el('label','停靠位置 ');positionLabel.append(dockPosition);$('agent-preferences-layout').append(positionLabel);
const binding=el('div');binding.className='chat-binding-chip';binding.append(el('span','当前图层'),$('chat-context-name'));compose.querySelector('textarea').before(binding);
const entry=compose.querySelector('[aria-label="AI 工坊制作入口"]');entry.classList.add('chat-creation-shortcuts');$('chat-skill').textContent='完整制作';$('chat-workshop-new').textContent='新卡片';$('chat-workshop-variant').textContent='变体';$('chat-workshop-edit').textContent='编辑';
$('agent-manage').textContent='历史';$('agent-manage').title='会话与任务管理';
window.atelierAgents?.syncQuickChoices();
$('chat-input').placeholder='描述要修改的卡片、图层或效果…';
function syncAI(){for(const b of aiModes.children)b.classList.toggle('active',b.dataset.aiMode===$('ai-mode').value);for(const b of imageTabs.children)b.classList.toggle('active',b.dataset.aiImageView===ai.dataset.imageView);}
$('ai-mode').addEventListener('change',()=>{ai.dataset.imageView='source';syncAI();});new MutationObserver(()=>{document.body.classList.toggle('ai-image-open',ai.open);syncAI();requestAnimationFrame(()=>host.fit());}).observe(ai,{attributes:true,attributeFilter:['data-state','open']});
new ResizeObserver(()=>{document.documentElement.style.setProperty('--ai-workbench-width',ai.getBoundingClientRect().width+'px');if(ai.open)requestAnimationFrame(()=>host.fit());}).observe(ai);
const help=el('div');help.id='contextual-help';help.className='contextual-help';help.hidden=true;help.setAttribute('role','tooltip');document.body.append(help);let helpTimer,helpTarget;
function hideHelp(){clearTimeout(helpTimer);help.hidden=true;helpTarget=null;}
function scheduleHelp(target){if(!target||target===helpTarget)return;hideHelp();helpTarget=target;helpTimer=setTimeout(()=>{if(!target.isConnected)return;const text=target.dataset.help||target.title;if(!text)return;help.textContent=text;help.hidden=false;const r=target.getBoundingClientRect();help.style.left=Math.max(8,Math.min(innerWidth-290,r.left-270))+'px';help.style.top=Math.max(8,Math.min(innerHeight-help.offsetHeight-8,r.top))+'px';},1100);}
document.addEventListener('pointerover',(e: any)=>scheduleHelp(e.target.closest('[data-help]')));document.addEventListener('pointerout',e=>{if(helpTarget&&!helpTarget.contains(e.relatedTarget))hideHelp();});document.addEventListener('focusin',(e: any)=>scheduleHelp(e.target.closest('[data-help]')));document.addEventListener('pointerdown',hideHelp);document.addEventListener('keydown',hideHelp);window.addEventListener('blur',hideHelp);
function refresh(state){const l=state?.layer;if(!l)return;$('selected-layer-name').textContent=l.name;$('selected-layer-kind').textContent=({foreground:state.document.assetKind?'组件效果母版':'人物母版',image:l.splitSourceId?(state.document.assetKind?'组件部件':'人物部件'):'图片',background:'背景',text:'文字 / 字标',frame:'卡框'}[l.kind]||l.kind)+(l.locked?' · 锁定':'');for(const b of tabs.children)b.classList.toggle('active',b.dataset.contextPanel===document.body.dataset.inspectorPanel);const enabled=!l.locked&&!state.busy&&l.kind!=='frame';for(const id of ['layer-space-role','layer-space-depth','layer-space-back','layer-space-front'] as const)$(id).disabled=!enabled;for(const option of $('layer-space-role').options)option.disabled=['rear','front'].includes(option.value)&&l.kind!=='image';$('layer-space-role').value=importedCardSpatial.role(l);if(document.activeElement!==$('layer-space-depth'))$('layer-space-depth').value=(importedCardSpatial.resolve(state.document,l).requestedZ-.045).toFixed(3);const resolved=importedCardSpatial.resolve(state.document,l),limited=Math.abs(resolved.z-resolved.requestedZ)>.0001;$('layer-space-limit').hidden=!limited;$('layer-space-limit').textContent='锚点限制 · 实际 Z '+resolved.relativeZ.toFixed(3);$('mask-state-note').hidden=state.layer.kind==='foreground'&&!state.layer.locked;syncAI();}
const exposedatelierEditorUI={refresh};
window.atelierEditorUI=exposedatelierEditorUI;refresh(host.state());
return {atelierEditorUI:exposedatelierEditorUI};
})();
