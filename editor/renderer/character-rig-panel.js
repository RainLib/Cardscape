/* Rest-pose authoring uses the document transaction and history boundaries. */
(() => {
'use strict';
const host=window.cardEditorHost,R=window.CardCharacterAnimation,T=window.CardCharacterWeightTools,imports=window.CardCharacterImport.createRegistry(),$=id=>document.getElementById(id);
let selected='',lastDocument=null;
const panel=document.createElement('details');panel.className='fold';panel.id='character-rig-panel';panel.open=true;
panel.innerHTML=`<summary>人物关节与图层绑定</summary><p class="panel-note">先设置初始关节，再把图片绑定到关节。在时间轴选择关节制作动作；坐标为母版像素，子关节坐标相对父节点。</p>
<label><input id="rig-show" type="checkbox" checked>显示实心骨架</label>
<div class="button-row"><label><input id="rig-dim" type="checkbox" checked>暗化原画</label><label><input id="rig-labels" type="checkbox" checked>骨骼名称</label></div>
<label class="field">画布操作 <select id="rig-canvas-tool" aria-label="骨架画布操作"><option value="select">选择骨骼</option><option value="rest">调整初始关节</option><option value="translate">动作位移 · 松手记录</option><option value="rotate">动作旋转 · 松手记录</option><option value="ik">IK 目标 · 松手记录</option><option value="off">关闭骨架操作</option></select></label>
<p class="panel-note">实心骨段表示父子连接，圆点为关节。点击选中后拖动；动作操作写入当前时间轴时刻，Esc 取消，一次拖动可一次撤销。原画显示初始绑定，右侧预览显示变形。</p>
<label class="field">当前关节 <select id="rig-bone" aria-label="当前人物关节"></select></label>
<div class="button-row"><button id="rig-add-root">新建根关节</button><button id="rig-add-child">新建子关节</button><button id="rig-remove">删除关节</button></div>
<label class="field">名称 <input id="rig-name" maxlength="100" aria-label="关节名称"></label>
<label class="field">父关节 <select id="rig-parent" aria-label="父关节"></select></label>
<div class="button-row"><label>X <input id="rig-x" type="number" min="-4096" max="4096" step="any" aria-label="关节初始 X"></label><label>Y <input id="rig-y" type="number" min="-4096" max="4096" step="any" aria-label="关节初始 Y"></label></div>
<div class="button-row"><label>角度 <input id="rig-rotation" type="number" min="-360" max="360" step="any" aria-label="关节初始角度"></label><label>缩放 <input id="rig-scale" type="number" min="0.05" max="10" step="0.01" aria-label="关节初始缩放"></label></div>
<button id="rig-apply">应用初始姿势</button><p id="rig-binding" class="panel-note"></p>
<div class="button-row"><button id="rig-bind">绑定当前图层</button><button id="rig-unbind">解除图层绑定</button><button id="rig-animate">制作关节动画</button></div>
<div class="button-row"><button id="rig-export">导出人物动画</button><button id="rig-import">导入人物动画</button></div><input id="rig-file" type="file" accept=".json" hidden aria-label="导入原生人物动画"><p id="rig-status" role="status" class="panel-note"></p>`;
document.querySelector('[data-panel="motion"] .panel-note').after(panel);
const toolbar=document.createElement('div');toolbar.className='character-canvas-toolbar';toolbar.setAttribute('aria-label','骨架快捷工具');
for(const [mode,name,title] of [['select','选骨','选择骨骼'],['rest','初始','调整初始关节'],['translate','位移','拖动骨骼记录位移关键帧'],['rotate','旋转','拖动旋转圈记录旋转关键帧'],['ik','IK','拖动 IK 目标记录关键帧'],['weights','权重','刷涂当前骨骼网格权重']]){const b=document.createElement('button');b.textContent=name;b.dataset.mode=mode;b.title=title;b.setAttribute('aria-label',title);b.onclick=()=>{if(mode==='weights'){$('character-advanced-panel').querySelector('details').open=true;$('skin-tool').value='add';$('skin-tool').onchange();}else{$('rig-canvas-tool').value=mode;$('rig-canvas-tool').onchange();}host.redraw();};toolbar.append(b);}
const toolbarStatus=document.createElement('span');toolbarStatus.className='character-canvas-selection';toolbar.append(toolbarStatus);$('canvas-wrap').append(toolbar);
function status(message){$('rig-status').textContent=message;}
function bone(doc){return doc?.characterRig?.bones.find(b=>b.id===selected);}
function refresh(){const state=host.state(),doc=state.document;if(!doc)return;const bones=doc.characterRig?.bones||[];if(doc.id!==lastDocument){selected='';lastDocument=doc.id;}if(!bones.some(b=>b.id===selected))selected=bones[0]?.id||'';
 toolbar.hidden=!doc.characterRig;toolbarStatus.textContent=bones.find(b=>b.id===selected)?.name||'';
 const select=$('rig-bone');select.replaceChildren();if(!bones.length)select.add(new Option('尚未创建关节',''));for(const b of bones)select.add(new Option(b.name,b.id));select.value=selected;
 const b=bone(doc),parent=$('rig-parent');parent.replaceChildren(new Option('无 · 人物根节点',''));for(const p of bones)if(p.id!==selected)parent.add(new Option(p.name,p.id));parent.value=b?.parentId||'';
 for(const key of ['name','x','y','rotation','scale'])if(document.activeElement!==$('rig-'+key))$('rig-'+key).value=b?.[key]??'';
 for(const id of ['rig-name','rig-parent','rig-x','rig-y','rig-rotation','rig-scale','rig-apply','rig-remove','rig-add-child','rig-animate','rig-export'])$(id).disabled=state.busy||!b;
 for(const id of ['rig-add-root','rig-import'])$(id).disabled=state.busy;
 const layer=state.layer,binding=doc.characterRig?.bindings.find(v=>v.layerId===layer?.id),bound=bones.find(v=>v.id===binding?.boneId);$('rig-binding').textContent=layer?layer.name+' → '+(bound?.name||'未独立绑定'):'请先选择人物图层';
 $('rig-bind').disabled=state.busy||!b||!layer||layer.locked||!['foreground','image'].includes(layer.kind)||layer.previewReference;$('rig-unbind').disabled=state.busy||!binding||layer?.locked;
}
function mutate(label,fn){try{if(host.mutate(label,d=>{d.previewMode='authored';fn(d);})){refresh();window.cardPreview.stopAction();host.refreshPreview();status(label+' · 可撤销');}}catch(e){status(e.message);}}
function add(parentId){const state=host.state(),l=state.layer,p=window.CardRuntime.placement(state.document,l),pivot=l?.pivot||{u:.5,v:.5},position=R.point(R.matrix(512+p.x,768+p.y,p.rotation*180/Math.PI,p.scale),(pivot.u-.5)*1024,(pivot.v-.5)*1536),id='bone-'+crypto.randomUUID();mutate(parentId?'新建子关节':'新建人物根关节',d=>{R.addBone(d,{id,name:parentId?(l?.name||'子关节'):'人物根节点',parentId,x:position.x,y:position.y});selected=id;});}
$('rig-add-root').onclick=()=>add(null);$('rig-add-child').onclick=()=>add(selected);
function selectBone(id){selected=id;refresh();window.atelierCharacterAdvanced?.selectBone(id);if(window.atelierAnimation.isOpen())window.atelierAnimation.selectBone(id,'bone',false);host.redraw();}
$('rig-bone').onchange=()=>selectBone($('rig-bone').value);
for(const id of ['rig-show','rig-dim','rig-labels'])$(id).onchange=()=>host.redraw();
$('rig-canvas-tool').onchange=()=>{host.selectTool('move');window.atelierCharacterAdvanced?.stopBrush();if(['rotate','translate','ik'].includes($('rig-canvas-tool').value))window.atelierAnimation.open();host.redraw();};
$('rig-apply').onclick=()=>mutate('修改人物初始关节',d=>{const b=bone(d);if(!b)throw Error('关节已不存在');b.name=$('rig-name').value.trim();b.parentId=$('rig-parent').value||null;for(const k of ['x','y','rotation','scale']){const el=$('rig-'+k);if(!el.value||!el.validity.valid)throw Error('请输入有效的初始姿势');b[k]=Number(el.value);}});
$('rig-bind').onclick=()=>mutate('绑定人物图层',d=>R.bind(d,host.state().layer.id,selected));$('rig-unbind').onclick=()=>mutate('解除人物图层绑定',d=>R.bind(d,host.state().layer.id,null));$('rig-remove').onclick=()=>mutate('删除人物关节',d=>R.removeBone(d,selected));
$('rig-animate').onclick=()=>window.atelierAnimation.selectBone(selected);
$('rig-export').onclick=()=>{try{const doc=host.state().document,blob=new Blob([JSON.stringify(window.CardCharacterImport.pack(doc),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='character-animation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出原生绑定和人物动作；图片仍保留在卡片工程中');}catch(e){status(e.message);}};
$('rig-import').onclick=()=>$('rig-file').click();$('rig-file').onchange=async()=>{const file=$('rig-file').files[0];if(!file)return;const captured=host.state();try{if(file.size>64*1024*1024)throw Error('人物动画文件超过 64 MiB');const payload=await file.text(),now=host.state();if(now.documentToken!==captured.documentToken||now.revision!==captured.revision)throw Error('工程已变化，请重新导入');mutate('导入原生人物动画',d=>{const next=imports.convert('cardscape',payload,d);window.CardRuntime.validate(next);d.characterRig=next.characterRig;d.actions=next.actions;});}catch(e){status(e.message);}finally{$('rig-file').value='';}};
const visible=()=>!!host.state().document?.characterRig&&$('rig-show').checked&&document.body.dataset.inspectorPanel==='motion';
function posed(doc){const mode=$('rig-canvas-tool').value,a=window.atelierAnimation.context();return ['rotate','translate','ik'].includes(mode)?R.sample(doc,a.action,a.seconds,{seek:true}):R.rest(doc);}
function background(ctx){if(visible()&&$('rig-dim').checked){ctx.save();ctx.fillStyle='#080f20a6';ctx.fillRect(0,0,1024,1536);ctx.restore();}}
function shaft(ctx,a,b,color,zoom){const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)return;const width=Math.min(10/zoom,Math.max(5/zoom,len*.14)),nx=-dy/len*width,ny=dx/len*width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+dx*.2+nx,a.y+dy*.2+ny);ctx.lineTo(b.x,b.y);ctx.lineTo(a.x+dx*.2-nx,a.y+dy*.2-ny);ctx.closePath();ctx.lineJoin='round';ctx.strokeStyle='#071020';ctx.lineWidth=5/zoom;ctx.stroke();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#ffffffb8';ctx.lineWidth=1/zoom;ctx.stroke();}
let labelBoxes=[];
function label(ctx,text,p,color,zoom,offset=0){ctx.font=`600 ${11/zoom}px system-ui`;const w=ctx.measureText(text).width,h=18/zoom;let box;
 for(let n=0;n<40;n++){const side=n%2? -1:1,dy=(Math.floor(n/2)%2?1:-1)*Math.ceil(Math.floor(n/2)/2)*20/zoom;const x=side>0?p.x+12/zoom:p.x-12/zoom-w,y=p.y+(offset-12)/zoom+dy;box={x:x-4/zoom,y:y-12/zoom,w:w+8/zoom,h};if(!labelBoxes.some(b=>box.x<b.x+b.w+3/zoom&&box.x+box.w+3/zoom>b.x&&box.y<b.y+b.h+2/zoom&&box.y+box.h+2/zoom>b.y))break;
 }labelBoxes.push(box);ctx.fillStyle='#071020ed';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle=color;ctx.fillText(text,box.x+4/zoom,box.y+12/zoom);}

function draw(ctx,zoom){if(!visible())return;const doc=host.state().document,compiled=R.compile(doc.characterRig),pose=posed(doc),points=new Map(compiled.order.map(b=>[b.id,R.point(pose.bones.get(b.id).world,0,0)])),handles=[];labelBoxes=[];ctx.save();
 for(const b of toolbar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===($('skin-tool')?.value!=='off'?'weights':$('rig-canvas-tool').value)));
 for(const [i,b] of compiled.order.entries()){const p=points.get(b.id),color=b.id===selected?'#ffcf66':T.color(i);if(b.parentId)shaft(ctx,points.get(b.parentId),p,color,zoom);}
 for(const [i,b] of compiled.order.entries()){const p=points.get(b.id),chosen=b.id===selected,color=chosen?'#ffcf66':T.color(i);ctx.fillStyle=color;ctx.strokeStyle='#071020';ctx.lineWidth=3/zoom;ctx.beginPath();ctx.arc(p.x,p.y,(chosen?8:5)/zoom,0,Math.PI*2);ctx.fill();ctx.stroke();if($('rig-labels').checked||chosen)label(ctx,b.name,p,color,zoom,i%2?22:0);handles.push({id:b.id,x:p.x,y:p.y,selected:chosen});}
 if($('rig-canvas-tool').value==='rotate'&&points.has(selected)){const p=points.get(selected);ctx.strokeStyle='#ffcf66';ctx.lineWidth=2/zoom;ctx.setLineDash([4/zoom,4/zoom]);ctx.beginPath();ctx.arc(p.x,p.y,36/zoom,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
 for(const c of doc.characterRig.constraints||[]){const a=window.atelierAnimation.context(),animated=$('rig-canvas-tool').value==='ik',target=animated?R.control(doc,a.action,'ik',c.id,a.seconds/a.action.duration):{x:c.target[0],y:c.target[1]},end=R.point(pose.bones.get(c.tipId).world,...c.end);shaft(ctx,points.get(c.tipId),end,'#eab0ff',zoom);ctx.strokeStyle='#ff99eb';ctx.lineWidth=3/zoom;ctx.beginPath();ctx.arc(target.x,target.y,12/zoom,0,Math.PI*2);ctx.moveTo(target.x-18/zoom,target.y);ctx.lineTo(target.x+18/zoom,target.y);ctx.moveTo(target.x,target.y-18/zoom);ctx.lineTo(target.x,target.y+18/zoom);ctx.stroke();label(ctx,'IK · '+c.name,target,'#ffb4ef',zoom,30);handles.push({id:c.id,type:'ik',x:target.x,y:target.y});}
 $('editor-canvas').dataset.boneHandles=JSON.stringify(handles);ctx.restore();}
function pointerDown(p,zoom){if(!visible()||$('rig-canvas-tool').value==='off')return null;const state=host.state(),doc=state.document,mode=$('rig-canvas-tool').value,pose=posed(doc),a=window.atelierAnimation.pauseContext();
 if(mode==='ik'){const c=doc.characterRig.constraints?.find(c=>{const target=R.control(doc,a.action,'ik',c.id,a.seconds/a.action.duration);return Math.hypot(p.x-target.x,p.y-target.y)<22/zoom;});if(!c)return {};window.atelierAnimation.selectBone(c.id,'ik');const original=structuredClone(a.action),start=R.control(doc,a.action,'ik',c.id,a.seconds/a.action.duration);return {onPress:false,label:'拖动 IK 目标关键帧',update(d,q){let next=R.controlKeyframe(d,original,'ik',c.id,'x',a.seconds,start.x+q.x-p.x);next=R.controlKeyframe(d,next,'ik',c.id,'y',a.seconds,start.y+q.y-p.y);Object.assign(d.actions.find(v=>v.id===original.id),next);},finish:()=>window.atelierAnimation.seek(a.seconds)};}
 const all=doc.characterRig.bones,positions=all.map(b=>({b,p:R.point(pose.bones.get(b.id).world,0,0)}));let found=positions.filter(v=>Math.hypot(v.p.x-p.x,v.p.y-p.y)<13/zoom).sort((a,b)=>Math.hypot(a.p.x-p.x,a.p.y-p.y)-Math.hypot(b.p.x-p.x,b.p.y-p.y))[0];
 if(!found&&mode==='rotate')found=positions.find(v=>v.b.id===selected&&Math.abs(Math.hypot(v.p.x-p.x,v.p.y-p.y)*zoom-36)<10);
 if(!found)found=positions.find(v=>v.b.parentId&&T.distance(p,positions.find(w=>w.b.id===v.b.parentId).p,v.p)<9/zoom);if(!found&&mode==='rotate')found=positions.find(v=>v.b.id===selected&&Math.hypot(v.p.x-p.x,v.p.y-p.y)<44/zoom);if(!found)return {};
 selectBone(found.b.id);if(mode==='select')return {};
 if(mode==='rest'){const start=found.p;return {onPress:false,label:'拖动初始人物关节',update(d,q){T.moveJoint(d,selected,{x:start.x+q.x-p.x,y:start.y+q.y-p.y});}};}
 window.atelierAnimation.selectBone(selected);const original=structuredClone(a.action),values=R.local(original,selected,a.seconds/original.duration),parent=found.b.parentId?pose.bones.get(found.b.parentId).world:R.matrix(0,0),inv=R.inverse(parent),start=R.point(inv,p.x,p.y),pivot=found.p,theta=Math.atan2(p.y-pivot.y,p.x-pivot.x);
 return {onPress:false,label:mode==='rotate'?'拖动骨骼旋转关键帧':'拖动骨骼位移关键帧',update(d,q){let next;if(mode==='rotate'){const angle=Math.atan2(q.y-pivot.y,q.x-pivot.x)-theta,delta=Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI;next=R.keyframe(original,selected,'rotation',a.seconds,values.rotation+delta);}else{const local=R.point(inv,q.x,q.y);next=R.keyframe(original,selected,'x',a.seconds,values.x+local.x-start.x);next=R.keyframe(next,selected,'y',a.seconds,values.y+local.y-start.y);}Object.assign(d.actions.find(v=>v.id===original.id),next);},finish:()=>window.atelierAnimation.seek(a.seconds)};
}
window.addEventListener('atelier-preview-frame',()=>{if(visible()&&['rotate','translate','ik'].includes($('rig-canvas-tool').value))host.redraw();});
window.atelierCharacterRig={refresh,draw,background,pointerDown,selectBone,selected:()=>selected};refresh();
})();
