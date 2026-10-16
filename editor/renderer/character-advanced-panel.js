/* Authoring shares the host's validation, undo, save and preview transactions. */
(()=>{
'use strict';
const host=window.cardEditorHost,C=window.CardCharacterAnimation,A=C.advanced,T=window.CardCharacterWeightTools,U=window.CardCharacterMeshTools,$=id=>document.getElementById(id);
let constraintId='',expressionId='',documentId='',locked=new Set(),influences=new Set();
const panel=document.createElement('div');panel.id='character-advanced-panel';
panel.innerHTML=`
<details class="fold"><summary>自有网格蒙皮</summary>
<p class="panel-note">先编辑图片网格，再选择骨骼调整顶点权重。在测试姿势中刷涂，查看图片和网格的实时变形；手与武器应保持同一骨骼权重。</p>
<label><input id="skin-outline" type="checkbox" checked>图片轮廓高亮 · 跟随形变</label><label class="field">影响骨骼 <select id="skin-bone" aria-label="蒙皮骨骼"></select></label><details class="fold" id="skin-topology-panel"><summary>网格结构与轮廓</summary>
<label class="field">建网方式 <select id="skin-topology" aria-label="蒙皮建网方式"><option value="contour">透明轮廓与关节布点</option><option value="grid">规则网格 · 快速起步</option></select></label><div class="button-row"><label>内部间距 <input id="skin-spacing" type="number" min="16" max="160" value="56" aria-label="轮廓网格内部间距"></label><label>轮廓采样 <input id="skin-cell" type="number" min="2" max="32" value="8" step="1" aria-label="轮廓采样尺寸"></label></div><label><input id="skin-shared" type="checkbox" checked>同步同拓扑蒙皮 · 保持拆层接缝</label><label><input id="skin-shared-morphs" type="checkbox" checked>拆层共用表情形变 · 保持连接</label><div class="button-row" id="skin-grid-settings"><label>列 <input id="skin-columns" type="number" min="1" max="63" value="12" aria-label="网格列数"></label><label>行 <input id="skin-rows" type="number" min="1" max="63" value="18" aria-label="网格行数"></label></div>
<div class="button-row"><button id="skin-create">建立当前图片网格</button><button id="skin-remove">移除当前网格</button></div>
<button id="skin-rebuild">按轮廓重建当前网格</button><button id="skin-inherit-morphs">同步共享组表情形变</button><p class="panel-note">轮廓留出透明边距，内部按疏密布点，关节和表情区域加密。重建插值保留权重、表情与深度；同拓扑拆层同步重建，避免接缝两侧使用不同连边。</p></details><label><input id="skin-show" type="checkbox">显示网格与顶点</label><p id="skin-info" class="panel-note"></p>
<label><input id="skin-posed" type="checkbox" checked>在当前动作姿势中编辑</label>
<div class="button-row"><label>测试旋转 ° <input id="skin-test-angle" type="number" min="-90" max="90" step="1" value="0" aria-label="权重测试旋转角度"></label><button id="skin-test">测试弯曲 20°</button><button id="skin-test-reset">恢复姿势</button></div><p id="skin-test-status" role="status" class="panel-note">初始姿势下调权重通常不会移动图片。使用测试弯曲，查看当前骨骼如何驱动网格；测试姿势只用于预览。</p><label class="field">顶点圆饼 <select id="skin-pies" aria-label="顶点权重圆饼"><option value="all">全部可见顶点 · 自动避让</option><option value="bone">当前骨骼影响的顶点</option><option value="selected">仅选中顶点</option><option value="off">关闭圆饼</option></select></label>
<label><input id="skin-links" type="checkbox" checked>显示顶点与骨骼关联线</label>
<div class="button-row"><button id="skin-select-all">全选可见顶点</button><button id="skin-select-clear">清除顶点选择</button></div>
<p id="skin-selection-summary" role="status">未选顶点 · 笔刷作用于当前网格</p>
<label class="field">权重显示 <select id="skin-display" aria-label="蒙皮权重显示"><option value="off">关闭</option><option value="selected">当前骨骼 · 热力图</option><option value="all">所有骨骼 · 混色</option></select></label>
<div id="skin-weight-legend" class="weight-legend" hidden><span>0%</span><i></i><span>100%</span></div>
<p class="panel-note">左侧勾选参与初绑的骨骼，右侧锁定当前网格的骨骼权重。Alt 点击画布骨骼可切换影响骨骼。</p><div id="skin-bones" class="skin-bones" aria-label="骨骼影响与权重"></div>
<label class="field">画布权重工具 <select id="skin-tool" aria-label="画布权重工具"><option value="off">关闭</option><option value="vertex">点击选择顶点</option><optgroup label="编辑初始拓扑"><option value="mesh-move">移动拓扑点 · 同步 UV</option><option value="mesh-add">加点 · 分割三角形</option><option value="mesh-delete">删除内部拓扑点</option></optgroup><option value="add">增加权重</option><option value="remove">减少权重</option><option value="replace">替换权重</option><option value="smooth">平滑权重</option></select></label>
<div class="button-row"><label>半径 px <input id="skin-radius" type="number" min="1" max="512" value="60" aria-label="权重笔刷半径"></label><label>强度 <input id="skin-strength" type="number" min=".01" max="1" step=".01" value=".3" aria-label="权重笔刷强度"></label></div>
<label class="field">羽化 <input id="skin-feather" type="number" min="0" max="1" step=".01" value=".65" aria-label="权重笔刷羽化"></label>
<label class="field">替换目标 <input id="skin-brush-value" type="number" min="0" max="1" step=".01" value="1" aria-label="笔刷替换目标权重"></label>
<p class="panel-note">圆饼颜色对应骨骼。选点工具中点击选点，Shift / ⌘ / Ctrl 加选，拖动框选；点击选中圆饼扇区选择关联骨骼。外圈为笔刷范围，内圈为满强度区。锁定权重按网格记忆。</p>
<div class="button-row"><button id="skin-flip-edge">翻转选中内部边</button><button id="skin-delete-points">删除选中内部点</button></div><p class="panel-note">拓扑工具在初始姿势操作。移动点同步 UV，保留原画；加点继承周围权重、表情与深度。Shift 加选边的两个端点可翻转连边。轮廓点通过移动调整，内部点可删除。</p><div class="button-row"><button id="skin-auto">按距离初绑</button><button id="skin-smooth">平滑整个网格</button></div>
<div class="button-row"><button id="skin-copy-weights">复制顶点权重</button><button id="skin-paste-weights">粘贴顶点权重</button><button id="skin-prune">清理微小权重</button></div>
<p class="panel-note">初绑按骨骼自身骨段距离计算起点权重，需播放极限动作后刷涂修正。每顶点最多 4 骨骼，始终归一化至 100%。手和武器宜保留同一骨骼 100% 权重。</p>
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
const mesh=d=>d?.characterRig?.meshes?.find(m=>m.layerId===host.state().layer?.id),weightView=window.CardCharacterWeightView.create({host,C,T,$,refresh}),vertex=()=>weightView.primary();
function number(id){const e=$(id);if(e.value===''||!e.validity.valid)throw Error('请输入有效数值');return Number(e.value);}
function set(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function select(id,options,value){const e=$(id);e.replaceChildren();for(const [id,name] of options)e.add(new Option(name,id));e.value=value||options[0]?.[0]||'';}
function mutate(label,fn){try{const s=host.state();if(s.layer?.locked)throw Error('请先解锁当前图层');if(host.mutate(label,d=>{if(!d.characterRig?.bones.length)throw Error('请先创建人物关节');fn(d);C.validate(d);})){host.refreshPreview();refresh();weightView.previewTest();host.setAnimationFeedback(null);$('character-advanced-status').textContent=label+' · 可撤销';}}catch(e){$('character-advanced-status').textContent=e.message;}}
function refresh(){
 const s=host.state(),d=s.document;if(!d)return;if(documentId!==d.id){documentId=d.id;constraintId='';expressionId='';}
 const rig=d.characterRig,bones=(rig?.bones||[]).map(b=>[b.id,b.name]),m=mesh(d),n=m?.vertices.length/2||0;
 const weightState=weightView.bind(s,d,s.layer,m);locked=weightState.locked;influences=weightState.influences;const selection=weightView.selection(),stats=m?T.summary(m,selection):new Map();
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
 if(m){const index=vertex();set('skin-x',m.vertices[index*2]);set('skin-y',m.vertices[index*2+1]);set('skin-weight',+(stats.get($('skin-bone').value)?.average||0).toFixed(6));$('skin-weights').textContent=selection.size===1?m.weights[index].map(w=>(rig.bones.find(b=>b.id===w.boneId)?.name||w.boneId)+' '+(w.weight*100).toFixed(1)+'%').join(' / '):selection.size?`批量修改 ${selection.size} 个顶点；下方骨骼列表显示权重范围`:'选择圆饼或框选顶点后查看权重';}else $('skin-weights').textContent='';
 const list=$('skin-bones');list.replaceChildren();for(const [id,name] of bones){const row=document.createElement('div');row.className='skin-bone-row';const chosen=$('skin-bone').value===id,range=stats.get(id),w=range?.average||0;row.classList.toggle('selected',chosen);row.classList.toggle('influencing',!!range);const include=document.createElement('input');include.type='checkbox';include.checked=influences.has(id);include.setAttribute('aria-label','参与初绑 · '+name);include.onchange=()=>{include.checked?influences.add(id):influences.delete(id);weightView.saveTools();};const button=document.createElement('button');button.style.setProperty('--bone-color',T.boneColor(d,id));button.textContent=name+(selection.size?' '+(range&&range.max-range.min>.0001?`${(range.min*100).toFixed(1)}–${(range.max*100).toFixed(1)}%`:(w*100).toFixed(1)+'%'):'');button.title=range?`平均权重 ${(w*100).toFixed(1)}%`:'选择骨骼并查看影响范围';button.setAttribute('aria-pressed',String(chosen));button.onclick=()=>window.atelierCharacterRig.selectBone(id);const lock=document.createElement('input');lock.type='checkbox';lock.checked=locked.has(id);lock.setAttribute('aria-label','锁定权重 · '+name);lock.title='锁定权重';lock.onchange=()=>{lock.checked?locked.add(id):locked.delete(id);weightView.saveTools();refresh();};row.append(include,button,lock);list.append(row);}

 $('skin-grid-settings').hidden=$('skin-topology').value!=='grid';$('skin-position').textContent=$('skin-tool').value.startsWith('mesh-')?'应用拓扑位置与 UV':'应用顶点位置';$('skin-paint').textContent=selection.size>1?`应用到 ${selection.size} 个顶点`:'应用顶点权重';
 $('skin-weight-legend').hidden=$('skin-display').value!=='selected';
 for(const id of ['skin-remove','skin-position','skin-paint','morph-apply'])$(id).disabled=s.busy||!m||!!s.layer?.locked||(id==='morph-apply'&&!e)||(id==='skin-position'&&selection.size!==1)||(id==='skin-paint'&&!selection.size);
 $('skin-create').disabled=s.busy||!bones.length||!!s.layer?.locked||!['foreground','image'].includes(s.layer?.kind)||!!m;
 for(const id of ['skin-inherit-morphs','skin-rebuild','skin-flip-edge','skin-delete-points','skin-auto','skin-smooth','skin-tool'])$(id).disabled=s.busy||!m||!!s.layer?.locked;
 $('skin-flip-edge').disabled||=selection.size!==2;$('skin-delete-points').disabled||=!selection.size;
 $('skin-auto').textContent=selection.size?'初绑选中顶点':'按距离初绑';$('skin-smooth').textContent=selection.size?'平滑选中顶点':'平滑整个网格';for(const id of ['skin-copy-weights','skin-paste-weights','skin-prune'])$(id).disabled=s.busy||!m||!!s.layer?.locked||(id!=='skin-prune'&&!selection.size)||(id==='skin-paste-weights'&&!weightView.clipboardReady());
 for(const id of ['skin-test','skin-test-angle','skin-test-reset'])$(id).disabled=s.busy||!m||!bones.length;
 for(const id of ['ik-apply','ik-remove','ik-animate'])$(id).disabled=s.busy||!c;
 for(const id of ['expression-apply','expression-remove','expression-animate'])$(id).disabled=s.busy||!e;
}
function topologyGroup(d){return U.shared(d,host.state().layer,$('skin-shared').checked);}
function contour(d,oldMeshes){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;const ctx=canvas.getContext('2d',{willReadFrequently:true});for(const id of oldMeshes.length?oldMeshes.map(m=>m.layerId):[host.state().layer.id]){const image=host.spaceSource(id);if(image)ctx.drawImage(image,0,0,1024,1536);}const rgba=ctx.getImageData(0,0,1024,1536).data,alpha=new Uint8Array(1024*1536);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 const features=T.segments(d).flatMap(b=>[b.p,b.tip]).map(p=>T.sourcePoint(d,host.state().layer,p));for(const m of oldMeshes)for(const morph of m.morphs){const ids=[];for(let j=0;j<morph.deltas.length;j+=3)ids.push(morph.deltas[j]);if(!ids.length)continue;const xs=ids.map(i=>m.vertices[i*2]),ys=ids.map(i=>m.vertices[i*2+1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;features.push({x,y},{x:Math.min(...xs),y},{x:Math.max(...xs),y},{x,y:Math.min(...ys)},{x,y:Math.max(...ys)});}
 const oldCount=oldMeshes.reduce((sum,m)=>sum+m.weights.length,0),total=(d.characterRig.meshes||[]).reduce((sum,m)=>sum+m.weights.length,0),maxVertices=Math.min(4096,Math.floor((16384-total+oldCount)/Math.max(1,oldMeshes.length)));return U.generate(alpha,1024,1536,{spacing:number('skin-spacing'),cell:number('skin-cell'),features,maxVertices});
}
$('skin-create').onclick=()=>mutate('建立自有蒙皮网格',d=>{d.characterRig.meshes||=[];const layerId=host.state().layer.id,boneId=$('skin-bone').value,m=$('skin-topology').value==='grid'?A.grid(layerId,boneId,number('skin-columns'),number('skin-rows')):{layerId,...contour(d,[]),morphs:[]};m.weights||=Array.from({length:m.vertices.length/2},()=>[{boneId,weight:1}]);d.characterRig.meshes.push(m);});
$('skin-rebuild').onclick=()=>{window.atelierAnimation.pauseContext();mutate('按轮廓与关节重建蒙皮拓扑',d=>{const group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');const topology=contour(d,group);const next=group.map(old=>U.transfer(old,topology));if($('skin-shared-morphs').checked)U.inheritMorphs(next);for(let i=0;i<group.length;i++)d.characterRig.meshes[d.characterRig.meshes.indexOf(group[i])]=next[i];});};
$('skin-inherit-morphs').onclick=()=>mutate('同步同拓扑拆层的表情形变',d=>{const group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');U.inheritMorphs(group);});
$('skin-flip-edge').onclick=()=>mutate('翻转蒙皮内部边',d=>{const ids=[...weightView.selection()];for(const m of topologyGroup(d)){if(d.layers.find(l=>l.id===m.layerId).locked)throw Error('请先解锁参与同步的图层');U.flip(m,...ids);}});
$('skin-delete-points').onclick=()=>{mutate('删除蒙皮内部点',d=>{for(const m of topologyGroup(d)){if(d.layers.find(l=>l.id===m.layerId).locked)throw Error('请先解锁参与同步的图层');for(const i of [...weightView.selection()].sort((a,b)=>b-a))U.erase(m,i);}});weightView.clearSelection();};
$('skin-topology').onchange=refresh;
$('skin-remove').onclick=()=>mutate('移除自有蒙皮网格',d=>{d.characterRig.meshes=d.characterRig.meshes.filter(m=>m.layerId!==host.state().layer.id);});
$('skin-position').onclick=()=>mutate('修改蒙皮顶点位置',d=>{const m=mesh(d),i=vertex(),p={x:number('skin-x'),y:number('skin-y')};if($('skin-tool').value.startsWith('mesh-')){for(const target of topologyGroup(d)){if(d.layers.find(l=>l.id===target.layerId).locked)throw Error('请先解锁参与同步的图层');U.move(target,i,p);}}else{m.vertices[i*2]=p.x;m.vertices[i*2+1]=p.y;}});
$('skin-paint').onclick=()=>mutate('修改蒙皮顶点权重',d=>{const m=mesh(d);for(const i of weightView.selection())m.weights[i]=T.setWeight(m.weights[i],$('skin-bone').value,number('skin-weight'),locked);});
$('skin-bone').onchange=()=>{window.atelierCharacterRig.selectBone($('skin-bone').value);refresh();host.redraw();};
$('skin-display').onchange=()=>{refresh();host.redraw();};
$('skin-tool').onchange=()=>{if($('skin-tool').value!=='off'){host.selectTool('move');if($('skin-tool').value.startsWith('mesh-')){weightView.stopTest();$('skin-posed').checked=false;$('skin-display').value='off';$('skin-topology-panel').open=true;}else{$('skin-posed').checked=true;if($('skin-display').value==='off')$('skin-display').value='selected';}$('rig-canvas-tool').value='off';$('skin-show').checked=true;}weightView.stop();refresh();host.redraw();};
$('skin-auto').onclick=()=>mutate('按骨段距离初始化权重',d=>T.auto(d,host.state().layer,mesh(d),[...influences],locked,weightView.selection()));
$('skin-smooth').onclick=()=>mutate('按网格相邻顶点平滑权重',d=>T.smooth(mesh(d),locked,weightView.selection()));
$('skin-copy-weights').onclick=()=>{const n=weightView.copy();$('character-advanced-status').textContent=`已复制 ${n} 个顶点权重`;refresh();};$('skin-paste-weights').onclick=()=>mutate('粘贴顶点权重',d=>weightView.paste(mesh(d)));$('skin-prune').onclick=()=>mutate('清理小于 1% 的骨骼权重',d=>T.prune(mesh(d),.01,locked,weightView.selection()));
$('skin-vertex').oninput=()=>{weightView.selectPrimary(Number($('skin-vertex').value));host.setAnimationFeedback(null);};$('skin-show').onchange=()=>host.setAnimationFeedback(null);
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
window.atelierCharacterAdvanced={refresh,draw:weightView.draw,foreground:weightView.foreground,drawLayer:weightView.drawLayer,outline:weightView.outline,previewTest:weightView.previewTest,beginFrame:weightView.prepare,pose:weightView.pose,pointerDown:weightView.pointerDown,hover:weightView.hover,related:weightView.related,selectBone(id){$('skin-bone').value=id;refresh();host.redraw();},stopBrush(){$('skin-tool').value='off';weightView.stop();weightView.stopTest();}};
let lastCanvasFrame=0,lastCanvasPose='';
window.addEventListener('atelier-preview-frame',e=>{if(document.body.dataset.inspectorPanel!=='motion'||!$('skin-posed').checked)return;weightView.syncTest();const a=window.atelierAnimation.context(),key=a.action?.id+':'+a.seconds,now=performance.now();if(key!==lastCanvasPose&&(e.detail.paused||now-lastCanvasFrame>=66)){lastCanvasPose=key;lastCanvasFrame=now;host.redraw();}});refresh();
})();
