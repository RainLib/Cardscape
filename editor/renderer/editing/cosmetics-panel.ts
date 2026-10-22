import importedCardCosmetics from './cosmetics-model.ts';
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost,M=importedCardCosmetics;
for(const id of ['card-tier-preview','cosmetics-level'] as const)$(id).replaceChildren(...M.levels.map(l=>new Option(l.name,l.id)));
$('cosmetics-finish').replaceChildren(...M.finishes.map(f=>new Option(f.id==='original'?'使用原画 / 材质组件':f.name,f.id)));
$('cosmetics-flare').replaceChildren(new Option('使用粒子组件设置','authored'),new Option('无','none'),...Object.entries<any>(M.presets).map(([id,p]: any)=>new Option(p.name,id)));
$('cosmetics-quality').replaceChildren(...Object.entries<any>(M.qualities).map(([id,q]: any)=>new Option(q.name,id)));
function refresh(){const s=host.state(),d=s.document;if(!d)return;$('cosmetics-settings').hidden=!!d.assetKind;const c=M.config(d.cosmetics),view=window.cardPreview.getPreviewLevel?.()||c.level;for(const k of ['level','finish','flare','quality','border'] as const){const el=$('cosmetics-'+k);if(document.activeElement!==el)el.value=c[k];el.disabled=s.busy;}$('card-tier-preview').value=view;$('card-tier-preview').disabled=s.busy||!!d.assetKind;const l=M.levels.find(l=>l.id===view)||M.levels[0];$('cosmetics-feature').textContent=l.name+' · '+l.feature+(view!==c.level?'（临时预览）':'');const q=M.budget(c.quality);$('cosmetics-budget').textContent=`粒子上限 ${q.particles} · ${q.fps} fps · 分辨率倍率 ≤ ${q.dpr}`;const missing=M.requirements(d);$('cosmetics-assets').textContent=missing.length?'待准备：'+missing.join('、'):'所需图层与 Mask 已登记；可切换等级检查实际效果';$('cosmetics-level').disabled=s.busy||!!d.assetKind;}
$('card-tier-preview').onchange=()=>{window.cardPreview.setPreviewLevel($('card-tier-preview').value);refresh();};
for(const k of ['level','finish','flare','quality','border'] as const)$('cosmetics-'+k).onchange=()=>{try{const value=$('cosmetics-'+k).value;host.mutate('设置卡片外观 / '+k,d=>{d.cosmetics={...M.config(d.cosmetics),[k]:value};if(k==='level')d.cosmetics.border='grade';if(k==='flare'&&M.presets[value])d.particles=M.particlePreset(value,d.particles);});if(k==='level')window.cardPreview.setPreviewLevel(null);refresh();}catch(e){host.say(e.message);refresh();}};
function open(panel){document.body.classList.remove('dock-collapsed','panels-hidden');window.atelierWorkspace.panel(panel);window.atelierWorkspace.syncLayout();}
$('cosmetics-particles').onclick=()=>open('particles');$('cosmetics-frame').onclick=()=>open('frame');
const exposedatelierCosmetics={refresh};
window.atelierCosmetics=exposedatelierCosmetics;refresh();
return {atelierCosmetics:exposedatelierCosmetics};
})();
