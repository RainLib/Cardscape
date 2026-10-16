/* Authoring shares the host's validation, undo, save and preview transactions. */
(()=>{
'use strict';
const host=window.cardEditorHost,C=window.CardCharacterAnimation,A=C.advanced,T=window.CardCharacterWeightTools,$=id=>document.getElementById(id);
let constraintId='',expressionId='',documentId='',weightLayer='',cursor=null,locked=new Set(),influences=new Set();
const panel=document.createElement('div');panel.id='character-advanced-panel';
panel.innerHTML=`
<details class="fold"><summary>自有网格蒙皮</summary>
<p class="panel-note">选中人物图片后建立网格。顶点采用母版坐标，UV 保持原图；权重会自动归一化，手与武器应保持同一骨骼权重。</p>
<label class="field">初始骨骼 <select id="skin-bone" aria-label="蒙皮骨骼"></select></label>
<div class="button-row"><label>列 <input id="skin-columns" type="number" min="1" max="63" value="12" aria-label="网格列数"></label><label>行 <input id="skin-rows" type="number" min="1" max="63" value="18" aria-label="网格行数"></label></div>
<div class="button-row"><button id="skin-create">建立当前图片网格</button><button id="skin-remove">移除当前网格</button></div>
<label><input id="skin-show" type="checkbox">显示网格与顶点</label><p id="skin-info" class="panel-note"></p>
<label class="field">权重显示 <select id="skin-display" aria-label="蒙皮权重显示"><option value="off">关闭</option><option value="selected">当前骨骼 · 热力图</option><option value="all">所有骨骼 · 混色</option></select></label>
<div id="skin-weight-legend" class="weight-legend" hidden><span>0%</span><i></i><span>100%</span></div>
<div id="skin-bones" class="skin-bones" aria-label="骨骼影响与权重"></div>
<label class="field">画布权重工具 <select id="skin-tool" aria-label="画布权重工具"><option value="off">关闭</option><option value="vertex">点击选择顶点</option><option value="add">增加权重</option><option value="remove">减少权重</option><option value="replace">替换权重</option><option value="smooth">平滑权重</option></select></label>
<div class="button-row"><label>半径 px <input id="skin-radius" type="number" min="1" max="512" value="60" aria-label="权重笔刷半径"></label><label>强度 <input id="skin-strength" type="number" min=".01" max="1" step=".01" value=".3" aria-label="权重笔刷强度"></label></div>
<label class="field">替换目标 <input id="skin-brush-value" type="number" min="0" max="1" step=".01" value="1" aria-label="笔刷替换目标权重"></label>
<p class="panel-note">热力图：蓝色影响小，红色影响大。点击骨骼查看权重；左侧勾选参与初绑，右侧勾选锁定权重。每笔可撤销，Esc 取消。</p>
<div class="button-row"><button id="skin-auto">按距离初绑</button><button id="skin-smooth">平滑整个网格</button></div>
<p class="panel-note">初绑按父子骨段距离计算起点权重，需播放极限动作后刷涂修正。每顶点最多 4 骨骼，始终归一化至 100%。手和武器宜保留同一骨骼 100% 权重。</p>
<label class="field">顶点编号 <input id="skin-vertex" type="number" min="0" value="0" aria-label="蒙皮顶点编号"></label>
<div class="button-row"><label>X <input id="skin-x" type="number" step="any" min="-4096" max="4096" aria-label="顶点初始 X"></label><label>Y <input id="skin-y" type="number" step="any" min="-4096" max="4096" aria-label="顶点初始 Y"></label></div><button id="skin-position">应用顶点位置</button>
<label class="field">该骨骼权重 <input id="skin-weight" type="number" min="0" max="1" step="any" value="1" aria-label="顶点骨骼权重"></label>
<button id="skin-paint">应用顶点权重</button><p id="skin-weights" class="panel-note"></p>
</details>
<details class="fold"><summary>自有 IK · 两节骨骼</summary>
<p class="panel-note">目标使用卡片注册像素。两节必须是直接父子；不可达目标保持骨长并限于可达范围。</p>
<label class="field">约束 <select id="ik-list" aria-label="IK 约束"></select></label>
<label class="field">名称 <input id="ik-name" maxlength="100" value="瞄准" aria-label="IK 名称"></label>
<label class="field">起始骨骼 <select id="ik-root" aria-label="IK 起始骨骼"></select></label>
<label class="field">末节骨骼 <select id="ik-tip" aria-label="IK 末节骨骼"></select></label>
<div class="button-row"><label>末端 X <input id="ik-end-x" type="number" step="any" min="-4096" max="4096" value="100" aria-label="IK 末端局部 X"></label><label>末端 Y <input id="ik-end-y" type="number" step="any" min="-4096" max="4096" value="0" aria-label="IK 末端局部 Y"></label></div>
<div class="button-row"><label>目标 X <input id="ik-x" type="number" step="any" min="-4096" max="4096" value="512" aria-label="IK 目标 X"></label><label>目标 Y <input id="ik-y" type="number" step="any" min="-4096" max="4096" value="768" aria-label="IK 目标 Y"></label></div>
<label class="field">弯曲侧 <select id="ik-bend" aria-label="IK 弯曲侧"><option value="1">正向</option><option value="-1">反向</option></select></label>
<label class="field">权重 <input id="ik-mix" type="number" min="0" max="1" step=".01" value="1" aria-label="IK 默认权重"></label>
<div class="button-row"><button id="ik-create">添加 IK</button><button id="ik-apply">应用 IK</button><button id="ik-remove">移除 IK</button><button id="ik-animate">制作 IK 动画</button></div>
</details>
<details class="fold"><summary>自有表情 · 形变混合</summary>
<p class="panel-note">眼、眉、口可使用独立控制器叠加。笔刷按源图像素写入形变目标，在骨骼蒙皮之前混合；动作权重在时间轴记录。</p>
<label class="field">表情控制器 <select id="expression-list" aria-label="表情控制器"></select></label>
<label class="field">名称 <input id="expression-name" maxlength="100" value="左眼闭合" aria-label="表情名称"></label>
<label class="field">默认权重 <input id="expression-value" type="number" min="0" max="1" step=".01" value="0" aria-label="表情默认权重"></label>
<div class="button-row"><button id="expression-create">添加表情控制器</button><button id="expression-apply">应用表情参数</button><button id="expression-remove">移除表情</button><button id="expression-animate">制作表情动画</button></div>
<div class="button-row"><label>中心 X <input id="morph-x" type="number" step="any" min="-4096" max="4096" value="512" aria-label="形变中心 X"></label><label>中心 Y <input id="morph-y" type="number" step="any" min="-4096" max="4096" value="300" aria-label="形变中心 Y"></label></div>
<label class="field">半径 <input id="morph-radius" type="number" min="1" max="1024" value="30" aria-label="形变半径"></label>
<div class="button-row"><label>偏移 X <input id="morph-dx" type="number" step="any" min="-512" max="512" value="0" aria-label="形变偏移 X"></label><label>偏移 Y <input id="morph-dy" type="number" step="any" min="-512" max="512" value="4" aria-label="形变偏移 Y"></label></div>
<button id="morph-apply">替换当前网格的该表情形变</button>
</details><p id="character-advanced-status" role="status" class="panel-note"></p>`;
$('character-rig-panel').after(panel);
const mesh=d=>d?.characterRig?.meshes?.find(m=>m.layerId===host.state().layer?.id),vertex=()=>Math.max(0,Math.min((mesh(host.state().document)?.weights.length||1)-1,Math.floor(Number($('skin-vertex').value)||0)));
function number(id){const e=$(id);if(e.value===''||!e.validity.valid)throw Error('请输入有效数值');return Number(e.value);}
function set(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function select(id,options,value){const e=$(id);e.replaceChildren();for(const [id,name] of options)e.add(new Option(name,id));e.value=value||options[0]?.[0]||'';}
function mutate(label,fn){try{const s=host.state();if(s.layer?.locked)throw Error('请先解锁当前图层');if(host.mutate(label,d=>{if(!d.characterRig?.bones.length)throw Error('请先创建人物关节');fn(d);C.validate(d);})){host.refreshPreview();refresh();host.setAnimationFeedback(null);$('character-advanced-status').textContent=label+' · 可撤销';}}catch(e){$('character-advanced-status').textContent=e.message;}}
function refresh(){
 const s=host.state(),d=s.document;if(!d)return;if(documentId!==d.id){documentId=d.id;constraintId='';expressionId='';}
 const rig=d.characterRig,bones=(rig?.bones||[]).map(b=>[b.id,b.name]),m=mesh(d),n=m?.vertices.length/2||0;
 if(weightLayer!==s.documentToken+':'+s.layer?.id){weightLayer=s.documentToken+':'+s.layer?.id;locked=new Set();influences=new Set(bones.map(b=>b[0]));}
 const selectedBone=$('skin-bone').value,root=$('ik-root').value,tip=$('ik-tip').value;
 select('skin-bone',bones,selectedBone);select('ik-root',bones,root);select('ik-tip',bones,tip);
 if(!rig?.constraints?.some(c=>c.id===constraintId))constraintId=rig?.constraints?.[0]?.id||'';
 select('ik-list',(rig?.constraints||[]).map(c=>[c.id,c.name]),constraintId);
 const c=rig?.constraints?.find(c=>c.id===constraintId);
 if(c){set('ik-name',c.name);$('ik-root').value=c.rootId;$('ik-tip').value=c.tipId;set('ik-end-x',c.end[0]);set('ik-end-y',c.end[1]);set('ik-x',c.target[0]);set('ik-y',c.target[1]);set('ik-mix',c.mix);set('ik-bend',c.bend);}
 if(!rig?.expressions?.some(e=>e.id===expressionId))expressionId=rig?.expressions?.[0]?.id||'';
 select('expression-list',(rig?.expressions||[]).map(e=>[e.id,e.name]),expressionId);const e=rig?.expressions?.find(e=>e.id===expressionId);if(e){set('expression-name',e.name);set('expression-value',e.value);}
 $('skin-info').textContent=m?`${s.layer.name}：${n} 顶点，${m.triangles.length/3} 三角形，${m.morphs.length} 形变目标`:'当前图片尚无蒙皮网格';
 $('skin-vertex').max=Math.max(0,n-1);if(vertex()>=n)$('skin-vertex').value=0;
 if(m){const index=vertex();set('skin-x',m.vertices[index*2]);set('skin-y',m.vertices[index*2+1]);set('skin-weight',+(m.weights[index].find(w=>w.boneId===$('skin-bone').value)?.weight||0).toFixed(6));$('skin-weights').textContent=m.weights[index].map(w=>(rig.bones.find(b=>b.id===w.boneId)?.name||w.boneId)+' '+(w.weight*100).toFixed(1)+'%').join(' / ');}else $('skin-weights').textContent='';
 const list=$('skin-bones');list.replaceChildren();for(const [i,[id,name]] of bones.entries()){const row=document.createElement('div');row.className='skin-bone-row';const chosen=$('skin-bone').value===id,w=m?.weights[vertex()]?.find(w=>w.boneId===id)?.weight||0;row.classList.toggle('selected',chosen);const include=document.createElement('input');include.type='checkbox';include.checked=influences.has(id);include.setAttribute('aria-label','参与初绑 · '+name);include.onchange=()=>include.checked?influences.add(id):influences.delete(id);const button=document.createElement('button');button.style.setProperty('--bone-color',T.color(i));button.textContent=name+' '+(w*100).toFixed(1)+'%';button.title='选择骨骼并查看影响范围';button.setAttribute('aria-pressed',String(chosen));button.onclick=()=>window.atelierCharacterRig.selectBone(id);const lock=document.createElement('input');lock.type='checkbox';lock.checked=locked.has(id);lock.setAttribute('aria-label','锁定权重 · '+name);lock.title='锁定权重';lock.onchange=()=>{lock.checked?locked.add(id):locked.delete(id);refresh();};row.append(include,button,lock);list.append(row);}
 $('skin-weight-legend').hidden=$('skin-display').value!=='selected';
 for(const id of ['skin-remove','skin-position','skin-paint','morph-apply'])$(id).disabled=s.busy||!m||!!s.layer?.locked||(id==='morph-apply'&&!e);
 $('skin-create').disabled=s.busy||!bones.length||!!s.layer?.locked||!['foreground','image'].includes(s.layer?.kind)||!!m;
 for(const id of ['skin-auto','skin-smooth','skin-tool'])$(id).disabled=s.busy||!m||!!s.layer?.locked;
 for(const id of ['ik-apply','ik-remove','ik-animate'])$(id).disabled=s.busy||!c;
 for(const id of ['expression-apply','expression-remove','expression-animate'])$(id).disabled=s.busy||!e;
}
$('skin-create').onclick=()=>mutate('建立自有蒙皮网格',d=>{d.characterRig.meshes||=[];d.characterRig.meshes.push(A.grid(host.state().layer.id,$('skin-bone').value,number('skin-columns'),number('skin-rows')));});
$('skin-remove').onclick=()=>mutate('移除自有蒙皮网格',d=>{d.characterRig.meshes=d.characterRig.meshes.filter(m=>m.layerId!==host.state().layer.id);});
$('skin-position').onclick=()=>mutate('修改蒙皮顶点位置',d=>{const m=mesh(d),i=vertex();m.vertices[i*2]=number('skin-x');m.vertices[i*2+1]=number('skin-y');});
$('skin-paint').onclick=()=>mutate('修改蒙皮顶点权重',d=>{const m=mesh(d),i=vertex();m.weights[i]=T.setWeight(m.weights[i],$('skin-bone').value,number('skin-weight'),locked);});
$('skin-bone').onchange=()=>{window.atelierCharacterRig.selectBone($('skin-bone').value);refresh();host.redraw();};
$('skin-display').onchange=()=>{refresh();host.redraw();};
$('skin-tool').onchange=()=>{if($('skin-tool').value!=='off'){host.selectTool('move');if($('skin-display').value==='off')$('skin-display').value='selected';$('rig-canvas-tool').value='off';$('skin-show').checked=true;}cursor=null;refresh();host.redraw();};
$('skin-auto').onclick=()=>mutate('按骨段距离初始化权重',d=>T.auto(d,host.state().layer,mesh(d),[...influences],locked));
$('skin-smooth').onclick=()=>mutate('按网格相邻顶点平滑权重',d=>T.smooth(mesh(d),locked));
$('skin-vertex').oninput=()=>{refresh();host.setAnimationFeedback(null);};$('skin-show').onchange=()=>host.setAnimationFeedback(null);
function constraint(){return {name:$('ik-name').value.trim(),rootId:$('ik-root').value,tipId:$('ik-tip').value,end:[number('ik-end-x'),number('ik-end-y')],target:[number('ik-x'),number('ik-y')],bend:number('ik-bend'),mix:number('ik-mix')};}
$('ik-create').onclick=()=>mutate('添加自有 IK',d=>{constraintId='ik-'+crypto.randomUUID();d.characterRig.constraints||=[];d.characterRig.constraints.push({id:constraintId,...constraint()});});
$('ik-apply').onclick=()=>mutate('修改自有 IK',d=>Object.assign(d.characterRig.constraints.find(c=>c.id===constraintId),constraint()));
$('ik-remove').onclick=()=>mutate('移除自有 IK',d=>{d.characterRig.constraints=d.characterRig.constraints.filter(c=>c.id!==constraintId);for(const a of d.actions)if(a.ikTracks)delete a.ikTracks[constraintId];constraintId='';});
$('ik-list').onchange=()=>{constraintId=$('ik-list').value;refresh();};$('ik-animate').onclick=()=>window.atelierAnimation.selectBone(constraintId,'ik');
$('expression-create').onclick=()=>mutate('添加表情控制器',d=>{expressionId='expression-'+crypto.randomUUID();d.characterRig.expressions||=[];d.characterRig.expressions.push({id:expressionId,name:$('expression-name').value.trim(),value:number('expression-value')});});
$('expression-apply').onclick=()=>mutate('修改表情控制器',d=>Object.assign(d.characterRig.expressions.find(e=>e.id===expressionId),{name:$('expression-name').value.trim(),value:number('expression-value')}));
$('expression-remove').onclick=()=>mutate('移除表情控制器',d=>{d.characterRig.expressions=d.characterRig.expressions.filter(e=>e.id!==expressionId);for(const m of d.characterRig.meshes||[])m.morphs=m.morphs.filter(v=>v.expressionId!==expressionId);for(const a of d.actions)if(a.expressionTracks)delete a.expressionTracks[expressionId];expressionId='';});
$('expression-list').onchange=()=>{expressionId=$('expression-list').value;refresh();};$('expression-animate').onclick=()=>window.atelierAnimation.selectBone(expressionId,'expression');
$('morph-apply').onclick=()=>mutate('写入表情形变目标',d=>A.morph(mesh(d),expressionId,[number('morph-x'),number('morph-y')],number('morph-radius'),[number('morph-dx'),number('morph-dy')]));
function heat(v){const stops=[[35,68,150],[33,188,204],[244,213,74],[244,77,61]],t=Math.max(0,Math.min(2.999999,v*3)),i=Math.floor(t),f=t-i;return stops[i].map((n,j)=>Math.round(n+(stops[i+1][j]-n)*f));}
const overlay=document.createElement('canvas');overlay.width=1024;overlay.height=1536;
function draw(ctx,zoom){if(document.body.dataset.inspectorPanel!=='motion')return;const s=host.state(),m=mesh(s.document);if(!m)return;const show=$('skin-show').checked,display=$('skin-display').value;if(!show&&display==='off')return;const points=T.vertexPoints(s.document,s.layer,m),p=i=>points[i];ctx.save();
 if(display!=='off'){const oc=overlay.getContext('2d');oc.clearRect(0,0,1024,1536);const rgb=m.weights.map(ws=>display==='selected'?heat(ws.find(w=>w.boneId===$('skin-bone').value)?.weight||0):ws.reduce((r,w)=>{const hex=T.color(s.document.characterRig.bones.findIndex(b=>b.id===w.boneId)).slice(1);return r.map((v,j)=>v+parseInt(hex.slice(j*2,j*2+2),16)*w.weight);},[0,0,0]));
  for(let j=0;j<m.triangles.length;j+=3){const ids=m.triangles.slice(j,j+3),color=[0,1,2].map(k=>Math.round(ids.reduce((sum,i)=>sum+rgb[i][k],0)/3));oc.fillStyle=`rgb(${color.join(',')})`;oc.beginPath();ids.forEach((i,n)=>n?oc.lineTo(m.vertices[i*2],m.vertices[i*2+1]):oc.moveTo(m.vertices[i*2],m.vertices[i*2+1]));oc.closePath();oc.fill();}
  const image=host.spaceSource(s.layer.id);if(image){oc.globalCompositeOperation='destination-in';oc.drawImage(image,0,0,1024,1536);oc.globalCompositeOperation='source-over';}const base=window.CardRuntime.placement(s.document,s.layer);ctx.save();ctx.translate(512+base.x,768+base.y);ctx.rotate(base.rotation);ctx.scale(base.scale,base.scale);ctx.globalAlpha=.72;ctx.drawImage(overlay,-512,-768);ctx.restore();}
 if(show){ctx.strokeStyle='#b6e8f066';ctx.lineWidth=.7/zoom;ctx.beginPath();for(let i=0;i<m.triangles.length;i+=3){const a=p(m.triangles[i]),b=p(m.triangles[i+1]),c=p(m.triangles[i+2]);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(a.x,a.y);}ctx.stroke();}
 const active=p(vertex());ctx.fillStyle='#ffcf66';ctx.strokeStyle='#071020';ctx.lineWidth=2/zoom;ctx.beginPath();ctx.arc(active.x,active.y,6/zoom,0,Math.PI*2);ctx.fill();ctx.stroke();if(cursor&&$('skin-tool').value!=='off'){const base=window.CardRuntime.placement(s.document,s.layer);ctx.strokeStyle='#fff';ctx.lineWidth=1.5/zoom;ctx.beginPath();ctx.arc(cursor.x,cursor.y,(Number($('skin-radius').value)||60)*base.scale,0,Math.PI*2);ctx.stroke();}ctx.restore();}
function pointerDown(p,zoom){if(document.body.dataset.inspectorPanel!=='motion'||$('skin-tool').value==='off')return null;const s=host.state(),m=mesh(s.document);if(!m||s.layer.locked)return {};const mode=$('skin-tool').value;if(mode==='vertex'){const points=T.vertexPoints(s.document,s.layer,m);let index=-1,best=14/zoom;for(let i=0;i<points.length;i++){const d=Math.hypot(points[i].x-p.x,points[i].y-p.y);if(d<best){best=d;index=i;}}if(index>=0){$('skin-vertex').value=index;refresh();host.redraw();}return {};}
 const boneId=$('skin-bone').value;if(locked.has(boneId)){host.say('该骨骼权重已锁定');return {};}
 const settings={radius:number('skin-radius'),strength:number('skin-strength'),value:number('skin-brush-value'),mode,locked:new Set(locked),adjacency:T.neighbors(m)},layer=s.layer,id=layer.id;let last=null;window.atelierAnimation.pauseContext();
 return {label:'刷涂骨骼权重 · '+mode,update(d,q){cursor=q;const source=T.sourcePoint(d,layer,q),centers=[];if(last){const length=Math.hypot(source.x-last.x,source.y-last.y),steps=Math.min(256,Math.max(1,Math.ceil(length/(settings.radius*.2))));for(let i=1;i<=steps;i++)centers.push({x:last.x+(source.x-last.x)*i/steps,y:last.y+(source.y-last.y)*i/steps});}else centers.push(source);T.paint(d.characterRig.meshes.find(m=>m.layerId===id),boneId,centers,settings);last=source;},finish(){cursor=null;refresh();host.redraw();}};
}
window.atelierCharacterAdvanced={refresh,draw,pointerDown,hover(p){if(host.state().tool!=='move'||host.state().target!=='image')return false;if(document.body.dataset.inspectorPanel!=='motion'||$('skin-tool').value==='off'||$('skin-tool').value==='vertex')return false;cursor=p;host.redraw();return true;},selectBone(id){$('skin-bone').value=id;refresh();host.redraw();},stopBrush(){$('skin-tool').value='off';cursor=null;}};refresh();
})();
