/* Region workflow stays beside the selected layer, with advanced controls folded. */
(() => {
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost;
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
<div class="button-row"><button id="region-split-front">选区拆为前层</button><button id="region-split-rear">选区拆为后层</button></div>
<button id="region-underpaint">AI 补全后层缺口…</button><p class="panel-note">先拆出衣料，再选中缺口所在的后层，框选隐藏区域并补绘。原有可见像素保留；候选先预览再应用。</p>
<div class="button-row"><button id="anchor-cloth">画布设置衣料锚点</button><button id="anchor-pivot">画布设置旋转中心</button></div>
<button id="anchor-write-motion">锚点生成运动 Mask</button>
<label>图层旋转 ° <input id="region-rotation" type="number" min="-180" max="180" value="0" aria-label="围绕旋转中心旋转图层"></label>
<p id="region-anchor-note" class="panel-note">蓝色固定点，黄色自由端。拆出的衣料直接使用连接权重；连续人物可写入运动 Mask。</p></details>`);
insert($('mask-start-brush').parentElement,`<details class="fold"><summary>运动固定点</summary><button id="mask-anchor-cloth">在画布拖动固定点与自由端</button><button id="mask-anchor-write">按锚点生成运动 Mask</button><p class="panel-note">先圈选披风／裙摆，再设固定点和自由端。黑色固定，灰色过渡，白色运动。</p></details>`);
const safe=fn=>async()=>{try{await fn();}catch(e){host.say(e.message);}};
for(const button of document.querySelectorAll('[data-gray-value]')){button.style.setProperty('--gray',`rgb(${button.dataset.grayValue},${button.dataset.grayValue},${button.dataset.grayValue})`);button.onclick=()=>host.setMaskBrush(Number(button.dataset.grayValue));}
$('mask-brush-value').onchange=()=>{if($('mask-brush-value').validity.valid)host.setMaskBrush(Number($('mask-brush-value').value));};
$('mask-brush-hardness').onchange=()=>{if($('mask-brush-hardness').validity.valid)host.setMaskHardness(Number($('mask-brush-hardness').value)/100);};
$('region-smart').onclick=()=>host.selectTool('smart');$('region-lasso').onclick=()=>host.selectTool('magnetic');
$('region-mask').onclick=()=>{$('effects-area-open').click();};
$('region-split-front').onclick=safe(()=>host.splitSelection('front'));$('region-split-rear').onclick=safe(()=>host.splitSelection('rear'));
$('region-underpaint').onclick=()=>window.atelierAI.openRepair({background:window.CardSpatial.background(host.state().layer)});
for(const id of ['anchor-cloth','mask-anchor-cloth'])$(id).onclick=()=>host.startAnchor('cloth');
$('anchor-pivot').onclick=()=>host.startAnchor('pivot');
for(const id of ['anchor-write-motion','mask-anchor-write'])$(id).onclick=safe(()=>host.motionFromAnchors());
$('mask-flow-speed').oninput=$('mask-flow-speed').onchange=()=>{const el=$('mask-flow-speed');if(el.validity.valid)host.mutate('调整武器流光速度',d=>d.effects.flowSpeed=Number(el.value));};
$('region-rotation').oninput=$('region-rotation').onchange=()=>{const el=$('region-rotation');if(el.validity.valid)host.mutate('围绕旋转中心旋转图层',(d,l)=>{l.rotation=Number(el.value);});};
function refresh(){const state=host.state(),l=state.layer,enabled=l&&!l.locked&&!state.busy&&['image','foreground','text'].includes(l.kind);for(const id of ['region-smart','region-lasso','region-underpaint','anchor-pivot','region-rotation'])$(id).disabled=!enabled||(['region-smart','region-lasso','region-underpaint'].includes(id)&&!l?.src);for(const id of ['region-split-front','region-split-rear'])$(id).disabled=!enabled||l.kind!=='foreground'||!state.selection;$('anchor-cloth').disabled=!enabled||!window.CardSpatial.character(l);$('anchor-write-motion').disabled=!enabled||l.kind!=='foreground'||!l.motionAnchor;$('region-underpaint').textContent=window.CardSpatial.background(l)?'AI 还原背景遮挡区…':'AI 补全后层缺口…';$('mask-flow-settings').hidden=!['emission','phase'].includes($('selection-target').value);$('mask-flow-speed').value=state.document?.effects.flowSpeed??1;$('mask-flow-speed').disabled=!enabled;$('region-rotation').value=l?.rotation||0;$('mask-brush-value').value=state.brushValue;$('mask-brush-hardness').value=Math.round(state.brushHardness*100);for(const b of document.querySelectorAll('[data-gray-value]'))b.setAttribute('aria-pressed',String(Number(b.dataset.grayValue)===state.brushValue));}
window.atelierEffectTools={refresh};refresh();
})();
