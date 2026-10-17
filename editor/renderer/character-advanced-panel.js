/* Authoring shares the host's validation, undo, save and preview transactions. */
(()=>{
'use strict';
const host=window.cardEditorHost,C=window.CardCharacterAnimation,A=C.advanced,T=window.CardCharacterWeightTools,U=window.CardCharacterMeshTools,N=window.CardCharacterMeshReduction,$=id=>document.getElementById(id);
let reductionRun=null;let constraintId='',expressionId='',documentId='',locked=new Set(),influences=new Set();
const panel=document.createElement('div');panel.id='character-advanced-panel';
panel.innerHTML=`
<details class="fold"><summary>自有网格蒙皮</summary>
<p class="panel-note">先编辑图片网格，再选择骨骼调整顶点权重。在测试姿势中刷涂，查看图片和网格的实时变形；手与武器应保持同一骨骼权重。</p>
<label><input id="skin-outline" type="checkbox" checked>图片轮廓高亮 · 跟随形变</label><label class="field">影响骨骼 <select id="skin-bone" aria-label="蒙皮骨骼"></select></label><details class="fold" id="skin-topology-panel"><summary>网格结构与轮廓</summary>
<label class="field">建网方式 <select id="skin-topology" aria-label="蒙皮建网方式"><option value="contour">透明轮廓与关节布点</option><option value="grid">规则网格 · 快速起步</option></select></label><div class="button-row"><label>内部间距 <input id="skin-spacing" type="number" min="16" max="160" value="56" aria-label="轮廓网格内部间距"></label><label>轮廓采样 <input id="skin-cell" type="number" min="2" max="32" value="8" step="1" aria-label="轮廓采样尺寸"></label></div><label><input id="skin-shared" type="checkbox" checked>同步同拓扑蒙皮 · 保持拆层接缝</label><label><input id="skin-shared-morphs" type="checkbox" checked>拆层共用表情形变 · 保持连接</label><div class="button-row" id="skin-grid-settings"><label>列 <input id="skin-columns" type="number" min="1" max="63" value="12" aria-label="网格列数"></label><label>行 <input id="skin-rows" type="number" min="1" max="63" value="18" aria-label="网格行数"></label></div>
<div class="button-row"><button id="skin-create">建立当前图片网格</button><button id="skin-remove">移除当前网格</button></div>
<div class="button-row"><button id="skin-outline-new">手工描边新轮廓</button><button id="skin-outline-close">闭合并自动填充</button><button id="skin-outline-cancel">取消描边 / 连边</button></div>
<label><input id="skin-motion-quality" type="checkbox" checked>保护现有动作 · 检查误差与翻面</label><button id="skin-fill">自动补网 · 保留已有顶点</button>
<div class="button-row"><label>加密间距 px <input id="skin-detail-spacing" type="number" min="8" max="160" value="24" aria-label="局部加密间距"></label><label>加密半径 px <input id="skin-detail-radius" type="number" min="8" max="512" value="96" aria-label="局部加密半径"></label></div>
<button id="skin-refine-selection">加密框选区域</button>
<div class="button-row"><button id="skin-pin">标记选中关键点</button><button id="skin-unpin">取消选中关键点</button></div>
<div class="button-row"><button id="skin-edge-add">连接选中约束边</button><button id="skin-edge-remove">移除选中约束边</button></div>
<p id="skin-topology-status" role="status" class="panel-note">青线为轮廓，橙线为手工约束边，金色菱形为关键点。自动补网保留已有点及绑定数据。手工加点、移动点会标为关键点；删除前可取消标记。</p>
<details class="fold" id="skin-reduction-panel" open><summary>减面与动画误差</summary>
<label class="field">保留顶点 % <input id="skin-reduce-ratio" type="number" min="5" max="100" value="50" aria-label="减面保留顶点百分比"></label>
<label class="field">动画误差 px <input id="skin-error-limit" type="number" min="0" max="1024" step=".05" value=".75" aria-label="最大动画误差像素"></label>
<label class="field">轮廓误差 px <input id="skin-boundary-limit" type="number" min="0" max="1024" step=".05" value=".5" aria-label="最大轮廓误差像素"></label>
<label class="field">权重误差百分点 <input id="skin-weight-limit" type="number" min="0" max="100" step=".1" value="5" aria-label="最大权重误差百分点"></label>
<label><input id="skin-reduce-boundary" type="checkbox">减面时允许删除边界点</label>
<div class="button-row"><button id="skin-reduce">按误差减面</button><button id="skin-reduce-cancel" disabled>取消减面</button></div>
<p class="panel-note">删点、重建会比较前后的初始姿势与全部动作，检查位置、运动、轮廓和权重误差。减面使用累计误差阈值，保留关键点、约束边及剩余点的权重和 FFD；达到误差限制时可能高于目标数量。检查包含关键帧、区间中点和固定采样，不保证任意未来动作。</p>
<button id="skin-review" disabled>动画对比与误差热力图</button><p class="panel-note">完成减面、删点或重建后可对比最近一次操作。可同步播放、查看误差热力图并定位原顶点及动作时刻；超限操作可预览未应用候选。继续编辑、撤销或切换工程后，比较快照会清除。</p>
<p id="skin-error-status" role="status" class="panel-note">尚未检查拓扑误差</p></details>
<button id="skin-rebuild">按轮廓重建当前网格</button><button id="skin-inherit-morphs">同步共享组表情形变</button><p class="panel-note">轮廓留出透明边距，内部按疏密布点，关节和表情区域加密。重建插值保留权重、表情与深度；FFD 网格保留原有动画采样点和分片边界，并在内部重新布点与连边；同拓扑拆层同步重建，避免接缝两侧使用不同连边。</p></details><label><input id="skin-full-topology" type="checkbox">显示完整共享拓扑 · 含透明区</label><label><input id="skin-show" type="checkbox">显示网格与顶点</label><p id="skin-info" class="panel-note"></p>
<label><input id="skin-posed" type="checkbox" checked>在当前动作姿势中编辑</label>
<div class="button-row"><label>测试旋转 ° <input id="skin-test-angle" type="number" min="-90" max="90" step="1" value="0" aria-label="权重测试旋转角度"></label><button id="skin-test">测试弯曲 20°</button><button id="skin-test-reset">恢复姿势</button></div><p id="skin-test-status" role="status" class="panel-note">初始姿势下调权重通常不会移动图片。使用测试弯曲，查看当前骨骼如何驱动网格；测试姿势只用于预览。</p><label class="field">顶点圆饼 <select id="skin-pies" aria-label="顶点权重圆饼"><option value="all">全部可见顶点 · 自动避让</option><option value="bone">当前骨骼影响的顶点</option><option value="selected">仅选中顶点</option><option value="off">关闭圆饼</option></select></label>
<label><input id="skin-links" type="checkbox" checked>显示顶点与骨骼关联线</label>
<div class="button-row"><button id="skin-select-all">全选可见顶点</button><button id="skin-select-clear">清除顶点选择</button></div>
<p id="skin-selection-summary" role="status">未选顶点 · 笔刷作用于当前网格</p>
<label class="field">权重显示 <select id="skin-display" aria-label="蒙皮权重显示"><option value="off">关闭</option><option value="selected">当前骨骼 · 热力图</option><option value="all">所有骨骼 · 混色</option></select></label>
<div id="skin-weight-legend" class="weight-legend" hidden><span>0%</span><i></i><span>100%</span></div>
<p class="panel-note">左侧勾选参与初绑的骨骼，右侧锁定当前网格的骨骼权重。Alt 点击画布骨骼可切换影响骨骼。</p><div id="skin-bones" class="skin-bones" aria-label="骨骼影响与权重"></div>
<label class="field">画布权重工具 <select id="skin-tool" aria-label="画布权重工具"><option value="off">关闭</option><option value="vertex">点击选择顶点</option><optgroup label="编辑初始拓扑"><option value="mesh-select">拓扑选点 · 拖框选择</option><option value="mesh-outline">手工描边 · 闭合轮廓</option><option value="mesh-refine">局部加密笔刷</option><option value="mesh-edge">手工连接约束边</option><option value="mesh-move">移动拓扑点 · 同步 UV</option><option value="mesh-add">加点 · 分割三角形</option><option value="mesh-delete">删除拓扑点 · 含边界</option></optgroup><option value="add">增加权重</option><option value="remove">减少权重</option><option value="replace">替换权重</option><option value="smooth">平滑权重</option></select></label>
<div class="button-row"><label>半径 px <input id="skin-radius" type="number" min="1" max="512" value="60" aria-label="权重笔刷半径"></label><label>强度 <input id="skin-strength" type="number" min=".01" max="1" step=".01" value=".3" aria-label="权重笔刷强度"></label></div>
<label class="field">羽化 <input id="skin-feather" type="number" min="0" max="1" step=".01" value=".65" aria-label="权重笔刷羽化"></label>
<label class="field">替换目标 <input id="skin-brush-value" type="number" min="0" max="1" step=".01" value="1" aria-label="笔刷替换目标权重"></label>
<p class="panel-note">圆饼颜色对应骨骼。选点工具中点击选点，Shift / ⌘ / Ctrl 加选，拖动框选；点击选中圆饼扇区选择关联骨骼。外圈为笔刷范围，内圈为满强度区。锁定权重按网格记忆。</p>
<div class="button-row"><button id="skin-flip-edge">翻转选中内部边</button><button id="skin-delete-points">删除选中顶点</button></div><p class="panel-note">拓扑工具在初始姿势操作。普通网格移动点同步 UV；FFD 网格移动点保留 UV，调整初始形状。加点插值继承权重、逐骨骼绑定与全部 FFD 帧；删点同步重排动画索引，删除的局部细节随之移除。Shift 加选边的两个端点可翻转连边。边界点可删除并重新连接轮廓；超出误差阈值会取消整次操作。</p><div class="button-row"><button id="skin-auto">按距离初绑</button><button id="skin-smooth">平滑整个网格</button></div>
<div class="button-row"><button id="skin-copy-weights">复制顶点权重</button><button id="skin-paste-weights">粘贴顶点权重</button><button id="skin-prune">清理微小权重</button></div>
<p class="panel-note">初绑按骨骼自身骨段距离计算起点权重，需播放极限动作后刷涂修正。每顶点最多 4 骨骼，始终归一化至 100%。手和武器宜保留同一骨骼 100% 权重。</p><details class="fold" id="skin-joint-panel"><summary>关节支撑与父子过渡</summary><p class="panel-note">仅调整当前图片。关节中心使用所选骨骼的初始位置；支撑环保留原顶点、UV、表情和手工约束边。先框选袖口或髋部顶点，再应用父子过渡；手、枪与握点保留单骨骼权重。</p><div class="button-row"><label>内半径 px <input id="skin-joint-inner" type="number" min="0" max="512" value="32" aria-label="关节过渡内半径"></label><label>外半径 px <input id="skin-joint-outer" type="number" min="8" max="1024" value="190" aria-label="关节过渡外半径"></label></div><button id="skin-joint-rings">增加关节支撑环</button><button id="skin-joint-weights">应用选区父子过渡</button></details>
<label class="field">顶点编号 <input id="skin-vertex" type="number" min="0" value="0" aria-label="蒙皮顶点编号"></label>
<div class="button-row"><label>X <input id="skin-x" type="number" step="any" min="-4096" max="4096" aria-label="顶点初始 X"></label><label>Y <input id="skin-y" type="number" step="any" min="-4096" max="4096" aria-label="顶点初始 Y"></label></div><button id="skin-position">应用顶点位置</button>
<label class="field">该骨骼权重 <input id="skin-weight" type="number" min="0" max="1" step="any" value="1" aria-label="顶点骨骼权重"></label>
<button id="skin-paint">应用顶点权重</button><p id="skin-weights" class="panel-note"></p>
</details>
<details class="fold"><summary>自有 IK · 两节骨骼</summary>
<p class="panel-note">支持连续的 1–16 节骨链。两节解析保留旧动作，多节 CCD 支持关节限制。目标可使用卡片坐标或独立骨骼的局部偏移；不拉伸骨长。</p>
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
const mesh=d=>d?.characterRig?.meshes?.find(m=>m.layerId===host.state().layer?.id),weightView=window.CardCharacterWeightView.create({host,C,T,$,refresh,mutate,checkTopology}),vertex=()=>weightView.primary();
const meshReview=window.CardCharacterMeshReview.create({host,button:$('skin-review'),selectVertex:i=>weightView.selectPrimary(i),repairRegion,reduceAgain});
function number(id){const e=$(id);if(e.value===''||!e.validity.valid)throw Error('请输入有效数值');return Number(e.value);}
function set(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function select(id,options,value){const e=$(id);e.replaceChildren();for(const [id,name] of options)e.add(new Option(name,id));e.value=value||options[0]?.[0]||'';}
function mutate(label,fn){try{const s=host.state();if(s.layer?.locked)throw Error('请先解锁当前图层');if(host.mutate(label,d=>{if(!d.characterRig?.bones.length)throw Error('请先创建人物关节');fn(d);C.validate(d);})){host.refreshPreview();refresh();weightView.previewTest();host.setAnimationFeedback(null);$('character-advanced-status').textContent=label+' · 可撤销';return true;}$('character-advanced-status').textContent='';return false;}catch(e){$('character-advanced-status').textContent=e.message;return false;}}
function reductionSettings(){return N.settings({maxError:number('skin-error-limit'),maxBoundaryError:number('skin-boundary-limit'),maxWeightError:number('skin-weight-limit')/100});}
function reportTopology(report,prefix='上次拓扑检查'){const e=$('skin-error-status');e.textContent=prefix+' · '+N.describe(report);e.dataset.report=JSON.stringify(report);}
function checkTopology(d,group,edit){const limits=reductionSettings(),before=N.snapshot(d),compare=N.audit(d,group),ids=group.map(m=>m.layerId);edit();const next=ids.map(id=>d.characterRig.meshes.find(m=>m.layerId===id)),report=compare(d,next),rejected=$('skin-motion-quality').checked&&!N.passes(report,limits);reportTopology(report,rejected?'已取消，超出阈值':'上次操作前后误差');meshReview.capture(before,N.snapshot(d),ids,report,{limits,rejected});if($('skin-motion-quality').checked)N.assert(report,limits);return report;}
function cancelReduction(){if(!reductionRun)return;reductionRun.worker.terminate();reductionRun=null;$('skin-error-status').textContent='已取消减面，工程未修改';refresh();}
$('skin-reduce-cancel').onclick=cancelReduction;
function runReduction({ids:requestedIds=null,options:requestedOptions=null,reopen=false,reviewState=null}={}){try{
 const captured=host.state();if(captured.busy||reductionRun)throw Error('请先结束当前处理');const group=requestedIds?requestedIds.map(id=>captured.document.characterRig.meshes.find(m=>m.layerId===id)):topologyGroup(captured.document);if(!group.length||group.some(m=>!m||captured.document.layers.find(l=>l.id===m.layerId)?.locked))throw Error('请选择并解锁参与减面的图层');
 window.atelierAnimation.pauseContext();const options=requestedOptions||{...reductionSettings(),ratio:number('skin-reduce-ratio')/100,allowBoundary:$('skin-reduce-boundary').checked},ids=group.map(m=>m.layerId),before=N.snapshot(captured.document),worker=new Worker('character-mesh-reduction-worker.js');reductionRun={worker,token:captured.documentToken};$('skin-error-status').textContent='正在计算减面与动画误差… 可取消';refresh();
 const finish=()=>{worker.terminate();if(reductionRun?.worker===worker)reductionRun=null;refresh();};
 worker.onerror=e=>{$('skin-error-status').textContent='减面失败：'+e.message;finish();};
 worker.onmessage=({data})=>{if(reductionRun?.worker!==worker)return;if(data.progress){$('skin-error-status').textContent=`正在减面：已移除 ${data.progress.removed} 点，剩余 ${data.progress.remaining} / 目标 ${data.progress.target} · 可取消`;return;}try{
  if(data.error)throw Error(data.error);const now=host.state();if(now.documentToken!==captured.documentToken||now.revision!==captured.revision||now.document!==captured.document)throw Error('计算期间工程已变化，减面结果未应用，请重试');
  const applied=mutate('按累计动画误差减面',d=>{for(const next of data.meshes){const i=d.characterRig.meshes.findIndex(m=>m.layerId===next.layerId);d.characterRig.meshes[i]=next;}for(let i=0;i<d.actions.length;i++)for(const id of ids)if(data.deforms[i]?.[id]){d.actions[i].deformTracks||={};d.actions[i].deformTracks[id]=data.deforms[i][id];}});
  if(!applied&&data.report.removed)throw Error($('character-advanced-status').textContent||'减面结果未应用，请重试');
  meshReview.capture(before,N.snapshot(host.state().document),ids,data.report,{limits:options,reduction:options,reviewState,label:'减面 '+data.report.beforeVertices+' → '+data.report.afterVertices+' 点'});weightView.clearSelection();reportTopology(data.report,applied?`上次减面 ${data.report.beforeVertices} → ${data.report.afterVertices} 点${data.report.reachedTarget?'':' · 已到误差或约束限制'}`:data.report.reachedTarget?'未删除顶点 · 已满足目标':'未删除顶点 · 已到误差或约束限制');
  if(reopen)queueMicrotask(()=>meshReview.open());
 }catch(e){$('skin-error-status').textContent=e.message;}finally{finish();}};
 worker.postMessage({document:before,ids,options});return true;
}catch(e){$('skin-error-status').textContent=e.message;throw e;}}

$('skin-reduce').onclick=()=>{try{runReduction();}catch(e){host.say(e.message);}};
function reduceAgain({ids,options,reviewState}){return runReduction({ids,options,reviewState,reopen:true});}
function repairRegion(request){
 const captured=host.state();if(captured.busy||reductionRun)throw Error('请先结束当前处理');
 if(captured.documentToken!==request.token||captured.revision!==request.revision||captured.document!==request.document)throw Error('工程已变化，请重新检查误差');
 if(request.ids.some(id=>!captured.document.layers.some(l=>l.id===id&&!l.locked)))throw Error('请先解锁参与修正的图层');
 const result=request.result||window.CardCharacterMeshRepair.plan({...request,current:captured.document});
 const changed=host.mutate(request.kind==='auto'?'扫描全部动作并修正高误差网格':request.kind==='refine'?'从误差选区恢复 FFD 并局部加密保护':'从误差选区恢复 FFD 并保护关键顶点',d=>{
  for(const id of request.ids)d.characterRig.meshes[d.characterRig.meshes.findIndex(m=>m.layerId===id)]=result.document.characterRig.meshes.find(m=>m.layerId===id);
  for(const action of d.actions){const next=result.document.actions.find(a=>a.id===action.id);for(const id of request.ids){if(next.deformTracks?.[id]){action.deformTracks||={};action.deformTracks[id]=next.deformTracks[id];}else if(action.deformTracks)delete action.deformTracks[id];}}C.validate(d);
 });
 host.refreshPreview();weightView.clearSelection();host.setAnimationFeedback(null);refresh();
 reportTopology(result.after||result.report,request.kind==='auto'?'全部动作自动修正后的误差':'区域修正后的误差');
 return {...result,changed,document:window.CardCharacterMeshReduction.snapshot(host.state().document)};
}

function refresh(){
 const s=host.state(),d=s.document;if(!d)return;if(documentId!==d.id){documentId=d.id;constraintId='';expressionId='';$('skin-error-status').textContent='尚未检查拓扑误差';delete $('skin-error-status').dataset.report;}
 if(reductionRun&&reductionRun.token!==s.documentToken){reductionRun.worker.terminate();reductionRun=null;}$('skin-reduce').disabled=s.busy||!!reductionRun||!mesh(d)||!!s.layer?.locked;$('skin-reduce-cancel').disabled=!reductionRun;
 meshReview.refresh();
 const rig=d.characterRig,bones=(rig?.bones||[]).map(b=>[b.id,b.name]),m=mesh(d),n=m?.vertices.length/2||0;
 const weightState=weightView.bind(s,d,s.layer,m);locked=weightState.locked;influences=weightState.influences;const selection=weightView.selection(),stats=m?T.summary(m,selection):new Map();
 const selectedBone=$('skin-bone').value,root=$('ik-root').value,tip=$('ik-tip').value;
 select('skin-bone',bones,selectedBone);select('ik-root',bones,root);select('ik-tip',bones,tip);
 if(!rig?.constraints?.some(c=>c.id===constraintId))constraintId=rig?.constraints?.[0]?.id||'';
 select('ik-list',(rig?.constraints||[]).map(c=>[c.id,c.name]),constraintId);
 const c=rig?.constraints?.find(c=>c.id===constraintId);
 if(c){set('ik-name',c.name);$('ik-root').value=c.rootId;$('ik-tip').value=c.tipId;set('ik-end-x',c.end[0]);set('ik-end-y',c.end[1]);set('ik-x',c.target[0]);set('ik-y',c.target[1]);set('ik-mix',c.mix);set('ik-bend',c.bend);}window.atelierIKPanel?.refresh(c,s);
 if(!rig?.expressions?.some(e=>e.id===expressionId))expressionId=rig?.expressions?.[0]?.id||'';
 select('expression-list',(rig?.expressions||[]).map(e=>[e.id,e.name]),expressionId);const e=rig?.expressions?.find(e=>e.id===expressionId);if(e){set('expression-name',e.name);set('expression-value',e.value);}
 const meshInfo=m?`${s.layer.name}：${n} 顶点，${m.triangles.length/3} 三角形，${m.morphs.length} 形变目标 · ${m.topology?.pins.length||0} 关键点 · ${m.topology?.edges.length||0} 约束边${m.binds?' · FFD 网格 · 拓扑编辑同步保留绑定与全部动画':''}`:'当前图片尚无蒙皮网格';
 $('skin-info').title=meshInfo;$('skin-info').textContent=window.atelierCharacterWorkflow&&m?`${n} 顶点 · ${m.triangles.length/3} 面${m.binds?' · FFD':''}`:meshInfo;
 $('skin-vertex').max=Math.max(0,n-1);if(vertex()>=n)$('skin-vertex').value=0;
 if(m){const index=vertex();set('skin-x',m.vertices[index*2]);set('skin-y',m.vertices[index*2+1]);set('skin-weight',+(stats.get($('skin-bone').value)?.average||0).toFixed(6));$('skin-weights').textContent=selection.size===1?m.weights[index].map(w=>(rig.bones.find(b=>b.id===w.boneId)?.name||w.boneId)+' '+(w.weight*100).toFixed(1)+'%').join(' / '):selection.size?`批量修改 ${selection.size} 个顶点；下方骨骼列表显示权重范围`:'选择圆饼或框选顶点后查看权重';}else $('skin-weights').textContent='';
 const list=$('skin-bones');list.replaceChildren();for(const [id,name] of bones){const row=document.createElement('div');row.className='skin-bone-row';const chosen=$('skin-bone').value===id,range=stats.get(id),w=range?.average||0;row.classList.toggle('selected',chosen);row.classList.toggle('influencing',!!range);const include=document.createElement('input');include.type='checkbox';include.checked=influences.has(id);include.setAttribute('aria-label','参与初绑 · '+name);include.onchange=()=>{include.checked?influences.add(id):influences.delete(id);weightView.saveTools();};const button=document.createElement('button');button.style.setProperty('--bone-color',T.boneColor(d,id));button.textContent=name+(selection.size?' '+(range&&range.max-range.min>.0001?`${(range.min*100).toFixed(1)}–${(range.max*100).toFixed(1)}%`:(w*100).toFixed(1)+'%'):'');button.title=range?`平均权重 ${(w*100).toFixed(1)}%`:'选择骨骼并查看影响范围';button.setAttribute('aria-pressed',String(chosen));button.onclick=()=>window.atelierCharacterRig.selectBone(id);const lock=document.createElement('input');lock.type='checkbox';lock.checked=locked.has(id);lock.setAttribute('aria-label','锁定权重 · '+name);lock.title='锁定权重';lock.onchange=()=>{lock.checked?locked.add(id):locked.delete(id);weightView.saveTools();refresh();};row.append(include,button,lock);list.append(row);}

 $('skin-grid-settings').hidden=$('skin-topology').value!=='grid';$('skin-position').textContent=$('skin-tool').value.startsWith('mesh-')?(m?.binds?'应用拓扑位置 · 保留 UV':'应用拓扑位置与 UV'):'应用顶点位置';$('skin-paint').textContent=selection.size>1?`应用到 ${selection.size} 个顶点`:'应用顶点权重';
 $('skin-weight-legend').hidden=$('skin-display').value!=='selected';
 for(const id of ['skin-remove','skin-position','skin-paint','morph-apply'])$(id).disabled=s.busy||!m||!!s.layer?.locked||(id==='morph-apply'&&!e)||(id==='skin-position'&&selection.size!==1)||(id==='skin-paint'&&!selection.size);
 $('skin-create').disabled=s.busy||!bones.length||!!s.layer?.locked||!['foreground','image'].includes(s.layer?.kind)||!!m;
 $('skin-joint-rings').disabled=s.busy||!m||!!s.layer?.locked||!rig?.bones.find(b=>b.id===$('skin-bone').value)?.parentId;$('skin-joint-weights').disabled=$('skin-joint-rings').disabled||!selection.size;
 for(const id of ['skin-inherit-morphs','skin-rebuild','skin-flip-edge','skin-delete-points','skin-auto','skin-smooth','skin-fill','skin-refine-selection','skin-pin','skin-unpin','skin-edge-add','skin-edge-remove'])$(id).disabled=s.busy||!m||!!s.layer?.locked;
 $('skin-rebuild').textContent=m?.binds?'保留动画重建当前网格':'按轮廓重建当前网格';
 $('skin-tool').disabled=s.busy||!!s.layer?.locked||!bones.length||!['foreground','image'].includes(s.layer?.kind);$('skin-outline-new').disabled=$('skin-tool').disabled;for(const id of ['skin-pin','skin-unpin'])$(id).disabled||=!selection.size;for(const id of ['skin-edge-add','skin-edge-remove'])$(id).disabled||=selection.size!==2;$('skin-refine-selection').disabled||=selection.size<2;
 $('skin-flip-edge').disabled||=selection.size!==2;$('skin-delete-points').disabled||=!selection.size;
 $('skin-auto').textContent=selection.size?'初绑选中顶点':'按距离初绑';$('skin-smooth').textContent=selection.size?'平滑选中顶点':'平滑整个网格';for(const id of ['skin-copy-weights','skin-paste-weights','skin-prune'])$(id).disabled=s.busy||!m||!!s.layer?.locked||(id!=='skin-prune'&&!selection.size)||(id==='skin-paste-weights'&&!weightView.clipboardReady());
 for(const id of ['skin-test','skin-test-angle','skin-test-reset'])$(id).disabled=s.busy||!m||!bones.length;
 for(const id of ['ik-apply','ik-remove','ik-animate'])$(id).disabled=s.busy||!c;
 for(const id of ['expression-apply','expression-remove','expression-animate'])$(id).disabled=s.busy||!e;
 window.atelierCharacterWorkflow?.refresh();
}
function topologyGroup(d){return U.shared(d,host.state().layer,$('skin-shared').checked);}
function contour(d,oldMeshes){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1536;const ctx=canvas.getContext('2d',{willReadFrequently:true});for(const id of oldMeshes.length?oldMeshes.map(m=>m.layerId):[host.state().layer.id]){const image=host.spaceSource(id);if(image)ctx.drawImage(image,0,0,1024,1536);}const rgba=ctx.getImageData(0,0,1024,1536).data,alpha=new Uint8Array(1024*1536);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 const features=T.segments(d).flatMap(b=>[b.p,b.tip]).map(p=>T.sourcePoint(d,host.state().layer,p));for(const m of oldMeshes)for(const morph of m.morphs){const ids=[];for(let j=0;j<morph.deltas.length;j+=3)ids.push(morph.deltas[j]);if(!ids.length)continue;const xs=ids.map(i=>m.vertices[i*2]),ys=ids.map(i=>m.vertices[i*2+1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;features.push({x,y},{x:Math.min(...xs),y},{x:Math.max(...xs),y},{x,y:Math.min(...ys)},{x,y:Math.max(...ys)});}
 const oldCount=oldMeshes.reduce((sum,m)=>sum+m.weights.length,0),total=(d.characterRig.meshes||[]).reduce((sum,m)=>sum+m.weights.length,0),maxVertices=Math.min(4096,Math.floor((16384-total+oldCount)/Math.max(1,oldMeshes.length)));return U.generate(alpha,1024,1536,{spacing:number('skin-spacing'),cell:number('skin-cell'),features,maxVertices});
}
$('skin-create').onclick=()=>mutate('建立自有蒙皮网格',d=>{d.characterRig.meshes||=[];const layerId=host.state().layer.id,boneId=$('skin-bone').value,m=$('skin-topology').value==='grid'?A.grid(layerId,boneId,number('skin-columns'),number('skin-rows')):{layerId,...contour(d,[]),morphs:[]};m.weights||=Array.from({length:m.vertices.length/2},()=>[{boneId,weight:1}]);d.characterRig.meshes.push(m);});
$('skin-rebuild').onclick=()=>{window.atelierAnimation.pauseContext();mutate('按轮廓与关节重建蒙皮拓扑',d=>{const group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');checkTopology(d,group,()=>{if(group.some(m=>m.binds||d.actions.some(a=>a.deformTracks?.[m.layerId]))){const M=window.CardCharacterMeshAuthoring;M.rebuild(group,{document:d,spacing:number('skin-spacing'),maxVertices:M.budget(d,group),accept:$('skin-motion-quality').checked?M.quality(d,group):null});return;}if(group.some(m=>m.topology?.pins.length||m.topology?.edges.length))throw Error('当前网格包含手工关键点或约束边，请使用“自动补网”保留它们，或先取消标记与约束边');const topology=contour(d,group);const next=group.map(old=>U.transfer(old,topology,{document:d}));if($('skin-shared-morphs').checked)U.inheritMorphs(next);for(let i=0;i<group.length;i++)d.characterRig.meshes[d.characterRig.meshes.indexOf(group[i])]=next[i];});});};
$('skin-inherit-morphs').onclick=()=>mutate('同步同拓扑拆层的表情形变',d=>{const group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');U.inheritMorphs(group);});
$('skin-flip-edge').onclick=()=>mutate('翻转蒙皮内部边',d=>{const ids=[...weightView.selection()],group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');checkTopology(d,group,()=>{for(const m of group)U.flip(m,...ids);});});
$('skin-delete-points').onclick=()=>{mutate('删除蒙皮顶点 · 含边界',d=>{const group=topologyGroup(d);if(group.some(m=>d.layers.find(l=>l.id===m.layerId).locked))throw Error('请先解锁参与同步的图层');checkTopology(d,group,()=>{for(const m of group)for(const i of [...weightView.selection()].sort((a,b)=>b-a))U.erase(m,i,{document:d});});});weightView.clearSelection();};
$('skin-topology').onchange=refresh;
$('skin-remove').onclick=()=>mutate('移除自有蒙皮网格',d=>{const id=host.state().layer.id;d.characterRig.meshes=d.characterRig.meshes.filter(m=>m.layerId!==id);for(const a of d.actions){if(a.deformTracks)delete a.deformTracks[id];if(a.layerTracks)delete a.layerTracks[id];}});
$('skin-position').onclick=()=>mutate('修改蒙皮顶点位置',d=>{const m=mesh(d),i=vertex(),p={x:number('skin-x'),y:number('skin-y')};if($('skin-tool').value.startsWith('mesh-')){for(const target of topologyGroup(d)){if(d.layers.find(l=>l.id===target.layerId).locked)throw Error('请先解锁参与同步的图层');U.move(target,i,p);window.CardCharacterMeshAuthoring.pin(target,[i]);}}else{m.vertices[i*2]=p.x;m.vertices[i*2+1]=p.y;}});
$('skin-paint').onclick=()=>mutate('修改蒙皮顶点权重',d=>{const m=mesh(d);const boneId=$('skin-bone').value,value=number('skin-weight');for(const i of weightView.selection()){if(m.weights[i].length===1&&m.weights[i][0].boneId===boneId&&value<1&&!locked.has(boneId))throw Error('单骨骼顶点的权重必须为 1；请先选择第二根骨骼分配权重');m.weights[i]=T.setWeight(m.weights[i],boneId,value,locked);}});
$('skin-bone').onchange=()=>{window.atelierCharacterRig.selectBone($('skin-bone').value);refresh();host.redraw();};
$('skin-display').onchange=()=>{refresh();host.redraw();};
$('skin-tool').onchange=()=>{if($('skin-tool').value!=='off'){host.selectTool('move',{character:true});if($('skin-tool').value.startsWith('mesh-')){weightView.stopTest();$('skin-posed').checked=false;$('skin-display').value='off';if(!window.atelierCharacterWorkflow)$('skin-topology-panel').open=true;}else{$('skin-posed').checked=true;if($('skin-display').value==='off')$('skin-display').value='selected';}$('rig-canvas-tool').value='off';$('skin-show').checked=true;}weightView.stop();refresh();window.atelierCharacterRig?.updateToolbar();host.redraw();};
$('skin-auto').onclick=()=>mutate('按骨段距离初始化权重',d=>T.auto(d,host.state().layer,mesh(d),[...influences],locked,weightView.selection()));
$('skin-smooth').onclick=()=>mutate('按网格相邻顶点平滑权重',d=>T.smooth(mesh(d),locked,weightView.selection()));
function jointSettings(d){const bone=d.characterRig.bones.find(b=>b.id===$('skin-bone').value);if(!bone?.parentId)throw Error('请选择有父骨骼的关节');const mat=C.compile(d.characterRig).rest.get(bone.id),pivot=T.sourcePoint(d,host.state().layer,{x:mat[4],y:mat[5]}),inner=number('skin-joint-inner'),outer=number('skin-joint-outer');if(outer<=inner)throw Error('外半径需大于内半径');return {pivot,inner,outer,boneId:bone.id,parentId:bone.parentId};}
function checkJointQuality(d,m){if(!$('skin-motion-quality').checked)return;const quality=window.CardCharacterMeshAuthoring.quality(d,[m]);if(!quality(m))throw Error('关节调整会影响已有动作：'+quality.issue+'；请调整过渡或支撑网格');}
$('skin-joint-rings').onclick=()=>mutate('增加当前图片关节支撑环',d=>{const m=mesh(d),settings=jointSettings(d);window.CardCharacterJointTools.rings(m,{document:d,pivot:settings.pivot,radii:[.25,.5,.75,1].map(v=>settings.outer*v),maxVertices:window.CardCharacterMeshAuthoring.budget(d,[m])});checkJointQuality(d,m);});
$('skin-joint-weights').onclick=()=>mutate('调整选区父子关节过渡',d=>{const m=mesh(d);window.CardCharacterJointTools.radial(m,{...jointSettings(d),selection:weightView.selection(),locked});checkJointQuality(d,m);});

$('skin-copy-weights').onclick=()=>{const n=weightView.copy();$('character-advanced-status').textContent=`已复制 ${n} 个顶点权重`;refresh();};$('skin-paste-weights').onclick=()=>mutate('粘贴顶点权重',d=>weightView.paste(mesh(d)));$('skin-prune').onclick=()=>mutate('清理小于 1% 的骨骼权重',d=>T.prune(mesh(d),.01,locked,weightView.selection()));
$('skin-vertex').oninput=()=>{weightView.selectPrimary(Number($('skin-vertex').value));host.setAnimationFeedback(null);};$('skin-show').onchange=()=>host.setAnimationFeedback(null);
function constraint(){return {name:$('ik-name').value.trim(),rootId:$('ik-root').value,tipId:$('ik-tip').value,end:[number('ik-end-x'),number('ik-end-y')],target:[number('ik-x'),number('ik-y')],bend:number('ik-bend'),mix:number('ik-mix'),...(window.atelierIKPanel?.read()||{})};}
$('ik-create').onclick=()=>{const previous=constraintId;const added=mutate('添加自有 IK',d=>{constraintId='ik-'+crypto.randomUUID();d.characterRig.constraints||=[];d.characterRig.constraints.forEach((c,i)=>{if(c.order===undefined)c.order=i;});d.characterRig.constraints.push({id:constraintId,...constraint()});});if(!added){constraintId=previous;window.atelierIKPanel?.invalidate();refresh();}};
$('ik-apply').onclick=()=>mutate('修改自有 IK',d=>{const i=d.characterRig.constraints.findIndex(c=>c.id===constraintId);if(i<0)throw Error('约束已不存在，请重新选择');d.characterRig.constraints[i]={id:constraintId,...constraint()};});
$('ik-remove').onclick=()=>mutate('移除自有 IK',d=>{d.characterRig.constraints=d.characterRig.constraints.filter(c=>c.id!==constraintId);for(const a of d.actions)if(a.ikTracks)delete a.ikTracks[constraintId];constraintId='';});
$('ik-list').onchange=()=>{constraintId=$('ik-list').value;window.atelierIKPanel?.invalidate();$('character-advanced-status').textContent='';refresh();};$('ik-animate').onclick=()=>window.atelierAnimation.selectBone(constraintId,'ik');
$('expression-create').onclick=()=>mutate('添加表情控制器',d=>{expressionId='expression-'+crypto.randomUUID();d.characterRig.expressions||=[];d.characterRig.expressions.push({id:expressionId,name:$('expression-name').value.trim(),value:number('expression-value')});});
$('expression-apply').onclick=()=>mutate('修改表情控制器',d=>Object.assign(d.characterRig.expressions.find(e=>e.id===expressionId),{name:$('expression-name').value.trim(),value:number('expression-value')}));
$('expression-remove').onclick=()=>mutate('移除表情控制器',d=>{d.characterRig.expressions=d.characterRig.expressions.filter(e=>e.id!==expressionId);for(const m of d.characterRig.meshes||[])m.morphs=m.morphs.filter(v=>v.expressionId!==expressionId);for(const a of d.actions)if(a.expressionTracks)delete a.expressionTracks[expressionId];expressionId='';});
$('expression-list').onchange=()=>{expressionId=$('expression-list').value;refresh();};$('expression-animate').onclick=()=>window.atelierAnimation.selectBone(expressionId,'expression');
$('morph-apply').onclick=()=>mutate('写入表情形变目标',d=>A.morph(mesh(d),expressionId,[number('morph-x'),number('morph-y')],number('morph-radius'),[number('morph-dx'),number('morph-dy')]));
window.atelierCharacterAdvanced={refresh,draw:weightView.draw,foreground:weightView.foreground,drawLayer:weightView.drawLayer,outline:weightView.outline,previewTest:weightView.previewTest,beginFrame:weightView.prepare,pose:weightView.pose,pointerDown:weightView.pointerDown,hover:weightView.hover,related:weightView.related,selectBone(id){$('skin-bone').value=id;refresh();host.redraw();},stopTest:weightView.stopTest,stopBrush(){$('skin-tool').value='off';weightView.stop();weightView.stopTest();}};
for(const id of ['skin-radius','skin-strength','skin-feather'])$('character-brush-options').append($(id).closest('label'));
for(const id of ['skin-outline-new','skin-fill'])$('character-mesh-actions').append($(id));
const toolStorage=document.createElement('div');toolStorage.hidden=true;toolStorage.append($('skin-tool').closest('label'));panel.append(toolStorage);
// Keep binding structure, topology and weights in distinct inspector sections.
const skinFold=panel.querySelector('details');skinFold.id='skin-panel';skinFold.open=true;
const weights=document.createElement('div');weights.id='skin-weight-properties';
let node=$('skin-posed').closest('label');while(node){const next=node.nextSibling;weights.append(node);node=next;}skinFold.append(weights);
for(const id of ['skin-flip-edge','skin-delete-points'])$('skin-topology-panel').append($(id));
$('character-rig-panel').open=false;
let lastCanvasFrame=0,lastCanvasPose='';
window.addEventListener('atelier-preview-frame',e=>{if(document.body.dataset.inspectorPanel!=='motion'||!$('skin-posed').checked)return;weightView.syncTest();const a=window.atelierAnimation.context(),key=a.action?.id+':'+a.seconds,now=performance.now();if(key!==lastCanvasPose&&(e.detail.paused||now-lastCanvasFrame>=66)){lastCanvasPose=key;lastCanvasFrame=now;host.redraw();}});refresh();
})();
