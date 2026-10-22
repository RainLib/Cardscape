import importedCardWorkshop from './workshop-model.ts';
export const moduleApi=(() => {
'use strict';
const host=window.cardEditorHost,$=id=>(document.getElementById(id) as any);
const referenceLabel=document.createElement('label'),reference=document.createElement('input');reference.type='checkbox';reference.setAttribute('aria-label','仅作组件预览参考');referenceLabel.className='field';referenceLabel.title='参考图层只在独立编辑中显示，不参与整卡组合';referenceLabel.append(reference,document.createTextNode('仅作预览参考'));$('layer-name').parentElement.after(referenceLabel);
reference.onchange=()=>host.mutate('设置组件参考图层',(d,l)=>l.previewReference=reference.checked);
function refresh(state){const e=state.workshop?.editingAsset,bar=$('asset-workspace-bar');bar.hidden=!e;document.body.dataset.editingAsset=e?.kind||'';referenceLabel.hidden=!e;reference.checked=!!state.layer?.previewReference;reference.disabled=state.busy||!state.layer||state.layer.locked;if(!e)return;bar.querySelector('span').textContent=importedCardWorkshop.kinds[e.kind];
 if(document.activeElement!==$('asset-workspace-name'))$('asset-workspace-name').value=state.document.name;
 $('asset-workspace-version').textContent=e.version?'v'+e.version+' · 草稿':'新资产 · 草稿';
 for(const id of ['asset-workspace-name','asset-workspace-publish','asset-workspace-preview','asset-workspace-return'] as const)$(id).disabled=state.busy;
 $('back-picker-open').disabled=true;
}
const run=fn=>async()=>{try{await fn();}catch(e){host.say(e.message);}};
$('asset-workspace-name').oninput=$('asset-workspace-name').onchange=()=>{const name=$('asset-workspace-name').value.trim();if(name)host.mutate('重命名组件',d=>d.name=name);refresh(host.state());};
$('asset-workspace-publish').onclick=run(()=>host.publishAsset());
$('asset-workspace-preview').onclick=run(()=>host.previewAsset());
$('asset-workspace-return').onclick=run(()=>host.returnAsset());
const exposedatelierAssetWorkspace={refresh};
window.atelierAssetWorkspace=exposedatelierAssetWorkspace;refresh(host.state());
return {atelierAssetWorkspace:exposedatelierAssetWorkspace};
})();
