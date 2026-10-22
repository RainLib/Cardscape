import importedCardSpatial from '../rendering/spatial-model.ts';
/* Region workflow stays beside the selected layer, with advanced controls folded. */
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost;
function insert(parent,html){const el=document.createElement('div');el.innerHTML=html;parent.append(...el.childNodes);}
insert($('mask-start-brush').parentElement,`<label id="mask-flow-settings" hidden>流光速度 × <input id="mask-flow-speed" type="number" min="0" max="5" step="0.1" value="1" aria-label="武器流光速度"></label><details class="fold" open><summary>灰度权重与渐变</summary>
<div class="gray-presets" role="group" aria-label="灰度画笔预设">${[0,64,128,192,255].map(v=>`<button data-gray-value="${v}" title="权重 ${Math.round(v/255*100)}%" data-gray-color="${v}">${v}</button>`).join('')}</div>
<label>画笔灰度 <input id="mask-brush-value" type="number" min="0" max="255" value="255" aria-label="画笔灰度 0 到 255"></label>
<label>硬度 % <input id="mask-brush-hardness" type="number" min="0" max="100" value="0" aria-label="画笔硬度"></label>
<label>渐变起点 <input id="mask-gradient-start" type="number" min="0" max="255" value="0" aria-label="渐变起点灰度"></label>
<label>终点／均匀权重 <input id="mask-weight-value" type="number" min="0" max="255" value="255" aria-label="渐变终点或均匀灰度"></label>
<p class="panel-note">灰度决定效果权重；强度决定每笔靠近目标的速度。起点 255、终点 0 可反转渐变。</p></details>`);
const properties=document.querySelector('[data-panel="properties"]');
insert(properties,`<details id="region-workflow" class="fold" open><summary>区域制作 · 拆层与锚点</summary>
<div class="button-row"><button id="region-smart">智能选区 · S</button><button id="region-lasso">磁性套索 · L+</button><button id="region-mask">制作效果 Mask</button></div>
<div class="button-row"><label>人物部件 <select id="region-part" aria-label="人物拆层部件类型"><option value="">未分类 · 请选择部件</option>${Object.entries<any>(importedCardSpatial.parts).map(([id,p]: any)=>`<option value="${id}">${p.name} · ${p.mode==='rigid'?'刚性':'柔性'}</option>`).join('')}</select></label><label>方位 <select id="region-part-side" aria-label="人物部件解剖方位"><option value="center">中央 / 不区分</option><option value="left">人物左侧</option><option value="right">人物右侧</option></select></label></div><button id="region-classify">应用到选中人物层</button>
<div class="button-row"><button id="region-split-front">选区拆为前层</button><button id="region-split-rear">选区拆为后层</button></div>
<details class="fold"><summary>人物深度检查</summary><ul id="region-depth-audit"></ul></details><button id="region-underpaint">AI 补全后层缺口…</button><p class="panel-note">按遮挡拆出人物部件，再选中缺口所在的后层，框选隐藏区域并补绘。原有可见像素保留；候选先预览再应用。</p>
<div class="button-row"><button id="anchor-cloth">画布设置衣料锚点</button><button id="anchor-pivot">画布设置旋转中心</button></div>
<button id="anchor-write-motion">锚点生成运动 Mask</button>
<label>图层旋转 ° <input id="region-rotation" type="number" min="-180" max="180" value="0" aria-label="围绕旋转中心旋转图层"></label>
<p id="region-anchor-note" class="panel-note">蓝色固定点，黄色自由端。拆出的衣料直接使用连接权重；连续人物可写入运动 Mask。</p></details>`);
insert($('mask-start-brush').parentElement,`<details class="fold"><summary>运动固定点</summary><button id="mask-anchor-cloth">在画布拖动固定点与自由端</button><button id="mask-anchor-write">按锚点生成运动 Mask</button><p class="panel-note">先圈选披风／裙摆，再设固定点和自由端。黑色固定，灰色过渡，白色运动。</p></details>`);
const safe=fn=>async()=>{try{await fn();}catch(e){host.say(e.message);}};
for(const button of document.querySelectorAll<any>('[data-gray-value]')){button.style.setProperty('--gray',`rgb(${button.dataset.grayValue},${button.dataset.grayValue},${button.dataset.grayValue})`);button.onclick=()=>host.setMaskBrush(Number(button.dataset.grayValue));}
$('mask-brush-value').onchange=()=>{if($('mask-brush-value').validity.valid)host.setMaskBrush(Number($('mask-brush-value').value));};
$('mask-brush-hardness').onchange=()=>{if($('mask-brush-hardness').validity.valid)host.setMaskHardness(Number($('mask-brush-hardness').value)/100);};
$('region-smart').onclick=()=>host.selectTool('smart');$('region-lasso').onclick=()=>host.selectTool('magnetic');
$('region-mask').onclick=()=>{$('effects-area-open').click();};
$('region-split-front').onclick=safe(()=>host.splitSelection('front',$('region-part').value,$('region-part-side').value));$('region-split-rear').onclick=safe(()=>host.splitSelection('rear',$('region-part').value,$('region-part-side').value));
$('region-classify').onclick=safe(()=>host.mutate('设置人物部件类型',(d,l)=>importedCardSpatial.classify(d,l,{part:$('region-part').value,side:$('region-part-side').value})));
$('region-part').value='';let partState='';$('region-part').onchange=()=>refresh();
$('region-underpaint').onclick=()=>window.atelierAI.openRepair({background:importedCardSpatial.background(host.state().layer)});
for(const id of ['anchor-cloth','mask-anchor-cloth'] as const)$(id).onclick=()=>host.startAnchor('cloth');
$('anchor-pivot').onclick=()=>host.startAnchor('pivot');
for(const id of ['anchor-write-motion','mask-anchor-write'] as const)$(id).onclick=safe(()=>host.motionFromAnchors());
$('mask-flow-speed').oninput=$('mask-flow-speed').onchange=()=>{const el=$('mask-flow-speed');if(el.validity.valid)host.mutate('调整武器流光速度',d=>d.effects.flowSpeed=Number(el.value));};
$('region-rotation').oninput=$('region-rotation').onchange=()=>{const el=$('region-rotation');if(el.validity.valid)host.mutate('围绕旋转中心旋转图层',(d,l)=>{l.rotation=Number(el.value);});};
function refresh(){const state=host.state(),l=state.layer,enabled=l&&!l.locked&&!state.busy&&['image','foreground','text'].includes(l.kind);for(const id of ['region-smart','region-lasso','region-underpaint','anchor-pivot','region-rotation'] as const)$(id).disabled=!enabled||(['region-smart','region-lasso','region-underpaint'].includes(id)&&!l?.src);$('anchor-cloth').disabled=!enabled||!importedCardSpatial.character(l)||importedCardSpatial.rigid(l);const key=JSON.stringify([l?.id,l?.anatomy]);if(key!==partState){partState=key;$('region-part').value=l?.anatomy?.part||'';$('region-part-side').value=l?.anatomy?.side||'center';}const classified=!!importedCardSpatial.parts[$('region-part').value];$('region-classify').disabled=!enabled||!importedCardSpatial.character(l)||!classified;for(const id of ['region-split-front','region-split-rear'] as const)$(id).disabled=!enabled||l.kind!=='foreground'||!state.selection||!classified;const messages={'unclassified':'尚未标记人物部件类型','single-character-plane':'人物仍是单一平面：按真实遮挡拆出前后肢体','hidden-support-unverified':'缺少隐藏补绘记录','hidden-support-review':'已有补绘，需检查此接缝在倾斜时是否完整','coplanar-character-parts':'已拆层但实际深度相同：检查前后部件的 Z 与 Slot','character-camera-disabled':'已拆层但统一相机未开启','depth-role-conflict':'部件前后角色与实际深度相反：检查 Z 与 Slot'};const audit=importedCardSpatial.depthAudit(state.document);$('region-depth-audit').replaceChildren(...audit.issues.map(issue=>{const row=document.createElement('li');row.textContent=(state.document.layers.find(p=>p.id===issue.layerId)?.name||issue.layerId)+'：'+messages[issue.code];return row;}));$('anchor-write-motion').disabled=!enabled||l.kind!=='foreground'||!l.motionAnchor;$('region-underpaint').textContent=importedCardSpatial.background(l)?'AI 还原背景遮挡区…':'AI 补全后层缺口…';$('mask-flow-settings').hidden=!['emission','phase'].includes($('selection-target').value);$('mask-flow-speed').value=state.document?.effects.flowSpeed??1;$('mask-flow-speed').disabled=!enabled;$('region-rotation').value=l?.rotation||0;$('mask-brush-value').value=state.brushValue;$('mask-brush-hardness').value=Math.round(state.brushHardness*100);for(const b of document.querySelectorAll<any>('[data-gray-value]'))b.setAttribute('aria-pressed',String(Number(b.dataset.grayValue)===state.brushValue));}
const exposedatelierEffectTools={refresh};
window.atelierEffectTools=exposedatelierEffectTools;refresh();
return {atelierEffectTools:exposedatelierEffectTools};
})();
