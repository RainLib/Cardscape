/* Rest-pose authoring uses the document transaction and history boundaries. */
(() => {
'use strict';
const host=window.cardEditorHost,R=window.CardCharacterAnimation,imports=window.CardCharacterImport.createRegistry(),$=id=>document.getElementById(id);
let selected='',lastDocument=null;
const panel=document.createElement('details');panel.className='fold';panel.id='character-rig-panel';panel.open=true;
panel.innerHTML=`<summary>人物关节与图层绑定</summary><p class="panel-note">先设置初始关节，再把图片绑定到关节。在时间轴选择关节制作动作；坐标为母版像素，子关节坐标相对父节点。</p>
<label><input id="rig-show" type="checkbox" checked>在原图显示初始关节</label><label class="field">当前关节 <select id="rig-bone" aria-label="当前人物关节"></select></label>
<div class="button-row"><button id="rig-add-root">新建根关节</button><button id="rig-add-child">新建子关节</button><button id="rig-remove">删除关节</button></div>
<label class="field">名称 <input id="rig-name" maxlength="100" aria-label="关节名称"></label>
<label class="field">父关节 <select id="rig-parent" aria-label="父关节"></select></label>
<div class="button-row"><label>X <input id="rig-x" type="number" min="-4096" max="4096" step="1" aria-label="关节初始 X"></label><label>Y <input id="rig-y" type="number" min="-4096" max="4096" step="1" aria-label="关节初始 Y"></label></div>
<div class="button-row"><label>角度 <input id="rig-rotation" type="number" min="-360" max="360" step="1" aria-label="关节初始角度"></label><label>缩放 <input id="rig-scale" type="number" min="0.05" max="10" step="0.01" aria-label="关节初始缩放"></label></div>
<button id="rig-apply">应用初始姿势</button><p id="rig-binding" class="panel-note"></p>
<div class="button-row"><button id="rig-bind">绑定当前图层</button><button id="rig-unbind">解除图层绑定</button><button id="rig-animate">制作关节动画</button></div>
<div class="button-row"><button id="rig-export">导出人物动画</button><button id="rig-import">导入人物动画</button></div><input id="rig-file" type="file" accept=".json" hidden aria-label="导入原生人物动画"><p id="rig-status" role="status" class="panel-note"></p>`;
document.querySelector('[data-panel="motion"] .panel-note').after(panel);
function status(message){$('rig-status').textContent=message;}
function bone(doc){return doc?.characterRig?.bones.find(b=>b.id===selected);}
function refresh(){const state=host.state(),doc=state.document;if(!doc)return;const bones=doc.characterRig?.bones||[];if(doc.id!==lastDocument){selected='';lastDocument=doc.id;}if(!bones.some(b=>b.id===selected))selected=bones[0]?.id||'';
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
$('rig-bone').onchange=()=>{selected=$('rig-bone').value;refresh();host.setAnimationFeedback(null);};
$('rig-show').onchange=()=>host.setAnimationFeedback(null);
$('rig-apply').onclick=()=>mutate('修改人物初始关节',d=>{const b=bone(d);if(!b)throw Error('关节已不存在');b.name=$('rig-name').value.trim();b.parentId=$('rig-parent').value||null;for(const k of ['x','y','rotation','scale']){const el=$('rig-'+k);if(!el.value||!el.validity.valid)throw Error('请输入有效的初始姿势');b[k]=Number(el.value);}});
$('rig-bind').onclick=()=>mutate('绑定人物图层',d=>R.bind(d,host.state().layer.id,selected));$('rig-unbind').onclick=()=>mutate('解除人物图层绑定',d=>R.bind(d,host.state().layer.id,null));$('rig-remove').onclick=()=>mutate('删除人物关节',d=>R.removeBone(d,selected));
$('rig-animate').onclick=()=>window.atelierAnimation.selectBone(selected);
$('rig-export').onclick=()=>{try{const doc=host.state().document,blob=new Blob([JSON.stringify(window.CardCharacterImport.pack(doc),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='character-animation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出原生绑定和人物动作；图片仍保留在卡片工程中');}catch(e){status(e.message);}};
$('rig-import').onclick=()=>$('rig-file').click();$('rig-file').onchange=async()=>{const file=$('rig-file').files[0];if(!file)return;const captured=host.state();try{if(file.size>64*1024*1024)throw Error('人物动画文件超过 64 MiB');const payload=await file.text(),now=host.state();if(now.documentToken!==captured.documentToken||now.revision!==captured.revision)throw Error('工程已变化，请重新导入');mutate('导入原生人物动画',d=>{const next=imports.convert('cardscape',payload,d);window.CardRuntime.validate(next);d.characterRig=next.characterRig;d.actions=next.actions;});}catch(e){status(e.message);}finally{$('rig-file').value='';}};
function draw(ctx,zoom){const doc=host.state().document;if(!doc?.characterRig||!$('rig-show').checked||document.body.dataset.inspectorPanel!=='motion')return;const compiled=R.compile(doc.characterRig);ctx.save();ctx.lineWidth=2/zoom;ctx.font=(11/zoom)+'px sans-serif';for(const b of compiled.order){const p=R.point(compiled.rest.get(b.id),0,0);ctx.strokeStyle=b.id===selected?'#ffd58a':'#6bdaca';ctx.fillStyle=ctx.strokeStyle;if(b.parentId){const parent=R.point(compiled.rest.get(b.parentId),0,0);ctx.beginPath();ctx.moveTo(parent.x,parent.y);ctx.lineTo(p.x,p.y);ctx.stroke();}ctx.beginPath();ctx.arc(p.x,p.y,(b.id===selected?6:4)/zoom,0,Math.PI*2);ctx.fill();ctx.fillText(b.name,p.x+9/zoom,p.y-7/zoom);}ctx.restore();}
window.atelierCharacterRig={refresh,draw};refresh();
})();
