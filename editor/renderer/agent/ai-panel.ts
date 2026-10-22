import importedCardSpatial from '../rendering/spatial-model.ts';
/* UI for external production jobs; document changes remain owned by app.js. */
export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardAIHost;
let info=null,job=null,candidate=null,input=null,selectionState=null,pollTimer=null,working=false,fetchGeneration=0;
const running=()=>job&&['preparing','running','validating'].includes(job.state);
const stateNames={preparing:'准备素材',running:'Agent 处理中',validating:'Rust 校验中',waiting:'等待外部产出',ready:'候选已就绪',failed:'任务未完成',canceled:'已取消',interrupted:'任务已中断'};
const editor=window.atelierSourceEditor;
function message(text){$('ai-message').textContent=text;host.say(text);}
function controls(){
 const active=running()||working;editor.configure({mode:$('ai-mode').value,readOnly:active||!!job});const draft=editor.state();let valid=draft.ready&&!draft.error;
 if($('ai-mode').value==='inpaint')valid=valid&&draft.hasMask&&$('ai-mask-feather').validity.valid;
 if($('ai-mode').value==='outpaint'){try{valid=valid&&editor.readPadding().some(n=>n>0);}catch{valid=false;}}
 const bound=input?.documentToken===selectionState?.documentToken&&input?.layerId===selectionState?.layerId&&input?.revision===selectionState?.revision;
 $('ai-start').disabled=active||!!job||!valid||!bound||!$('ai-prompt').value.trim()||!selectionState?.available||!window.atelierAgents?.ready($('ai-adapter').value);
 $('ai-inspect-open').disabled=working||!input;
 $('ai-model-picker')?.toggleAttribute('disabled',active||!!job);
 $('ai-new').disabled=active;$('ai-mode').disabled=active||!!job;$('ai-adapter').disabled=active||!!job;$('ai-defaults-mode').disabled=active||!!job;for(const id of ['ai-model','ai-reasoning'] as const)$(id).disabled=active||!!job||window.atelierAgents?.selection('ai').inheritDefaults;
 $('ai-cancel').hidden=!job||!['preparing','running','validating','waiting'].includes(job.state);$('ai-files').hidden=!job;$('ai-collect').disabled=!job||!['waiting','failed','interrupted'].includes(job.state);$('ai-import').disabled=$('ai-collect').disabled;$('ai-recovery-tools').hidden=!job||job.mode!=='generate'||!['waiting','failed','interrupted'].includes(job.state);$('ai-recover-alpha').disabled=working;
 $('ai-padding').hidden=$('ai-mode').value!=='outpaint';$('ai-fit-label').hidden=job?.mode!=='outpaint';
 for(const id of ['ai-left','ai-top','ai-right','ai-bottom','ai-prompt'] as const)$(id).disabled=active||!!job;
 const same=job?.documentToken===selectionState?.documentToken;
 $('ai-apply').disabled=!candidate||active||!same||selectionState?.revision!==job?.revision;
 $('ai-add').disabled=!candidate||active||!same;const repair=$('ai-underpaint').checked;$('ai-underpaint').disabled=active||!!job&&job.mode!=='inpaint'||$('ai-mode').value!=='inpaint';$('ai-apply').textContent=repair?'补全后层缺口':'应用到原图层';
 if(candidate){$('ai-apply-note').textContent=!same?'该候选属于另一工程，请在原工程重新提交。':selectionState?.revision!==job.revision?'工程已发生修改。可作为新图层加入；要替换原图层，请基于当前版本重新提交。':job.mode==='outpaint'?'默认保持原画构图。背景新增区域用于 3D 视差；勾选整图适应可展示完整扩图。':'结果可替换原图层或加入新图层，均支持撤销。人物原有 Mask 保留，请检查对应区域。';}
 $('ai-open').classList.toggle('ai-running',!!running());$('ai-open').textContent=running()?'AI 任务处理中…':job?.state==='ready'&&!job.applied?'AI 结果已就绪':'AI 图片编辑';
}
function syncInspect(){if(!input)return;if(!job&&$('ai-mode').value==='inpaint')input.mask=editor.state().hasMask?editor.maskPNG():null;$('inspect-source').src=input.source;$('inspect-mask').hidden=!input.mask||!$('ai-inspect-mask-toggle').checked;if(input.mask)$('inspect-mask').src=input.mask;$('inspect-result').hidden=!candidate;$('inspect-result-empty').hidden=!!candidate;if(candidate)$('inspect-result').src=candidate;}
function showCharacter(value){const context=value?.characterContext,section=$('ai-character-context');section.hidden=!context;if(!context){section.open=false;$('ai-character-master').removeAttribute('src');$('ai-character-surfaces').replaceChildren();return;}$('ai-character-reference').hidden=!value.characterMaster;if(value.characterMaster)$('ai-character-master').src=value.characterMaster;else $('ai-character-master').removeAttribute('src');$('ai-character-surfaces').replaceChildren(...context.surfaces.map(p=>{const row=document.createElement('li');row.textContent=(p.id===context.layerId?'当前 · ':'')+p.name+' · '+importedCardSpatial.roles[p.role].name+' · '+(importedCardSpatial.parts[p.part]?.name||'未分类')+(p.z===null?' · 待启用统一空间':' · Z '+p.z.toFixed(3))+(p.visible===false?' · 已隐藏':'')+(p.paintOrder===undefined?'':' · 绘制 '+p.paintOrder);return row;}));}
async function showSource(value,mode=$('ai-mode').value,options: any={}){input=value;showCharacter(value);$('ai-source').src=value.source;if(value.mask)$('ai-mask').src=value.mask;await editor.load(value,mode,options);const size=editor.state();$('ai-source-size').textContent=size.width+' × '+size.height;if($('ai-inspect').open)syncInspect();}
async function prepare(mode,preserve=false){const value=await host.capture(mode);await showSource(value,mode,{preserve});$('ai-context').textContent=value.layerName+(value.locked?' · 锁定':'');return value;}
async function refreshInfo(){info=await window.atelierAgents.refresh();$('ai-capability').textContent=(info.adapters.find(a=>a.id===$('ai-adapter').value)?.auth?.message||'')+' · '+info.imageCapability;controls();}
async function history(){const list=await host.invoke('agent-list');const select=$('ai-jobs');select.replaceChildren(new Option('选择历史任务…',''));for(const j of list)select.add(new Option(j.layerName+' · '+({edit:'改图',inpaint:'重绘',outpaint:'扩图',generate:'生成'}[j.mode])+' · '+stateNames[j.state],j.id));select.value=job?.id||'';}
async function setJob(value){
 job=value;$('ai-state').textContent=stateNames[job.state]||job.state;$('ai-message').textContent=job.message||'';$('ai-mode').value=job.mode;window.atelierAgents?.set({...job,inheritDefaults:false},'ai');$('ai-prompt').value=job.prompt;$('ai-directory').value=job.directory;
 $('ai-events').textContent=(job.events||[]).map(e=>new Date(e.at).toLocaleTimeString()+'  '+e.message).join('\n');
 $('ai-dialog').dataset.jobId=job.id;$('ai-dialog').dataset.state=job.state;
 if(job.state==='ready'&&!candidate){const id=job.id,result=await host.invoke('agent-result',{id});if(job?.id!==id)return;candidate=result.image;$('ai-result').src=candidate;$('ai-result').hidden=false;$('ai-empty').hidden=true;$('ai-result-size').textContent=job.outputWidth+' × '+job.outputHeight;}
 if($('ai-inspect').open)syncInspect();controls();schedulePoll();
}
function schedulePoll(){clearTimeout(pollTimer);if(!running())return;const id=job.id;pollTimer=setTimeout(async()=>{try{const value=await host.invoke('agent-status',{id});if(job?.id===id){await setJob(value);if(!running())await history();}}catch(e){message(e.message);schedulePoll();}},1200);}
function clearJob(){$('ai-underpaint').checked=false;clearTimeout(pollTimer);job=null;candidate=null;input=null;showCharacter(null);editor.clear();fetchGeneration++;if(window.atelierAgents)window.atelierAgents.defaults('ai');$('ai-dialog').dataset.state='draft';delete $('ai-dialog').dataset.jobId;$('ai-result').hidden=true;$('ai-empty').hidden=false;$('ai-result-size').textContent='';$('ai-state').textContent='待提交';$('ai-events').textContent='';$('ai-message').textContent='';$('ai-fit').checked=false;controls();}
async function open(mode='edit'){
 try{
  const sameBinding=job?.documentToken===selectionState?.documentToken&&job?.layerId===selectionState?.layerId;
  if(job&&!running()&&(!sameBinding||job.applied||mode==='inpaint'))clearJob();
  if(!job){const sameDraft=input?.documentToken===selectionState?.documentToken&&input?.layerId===selectionState?.layerId&&input?.revision===selectionState?.revision;$('ai-mode').value=mode;if(!sameDraft){clearJob();await prepare(mode);}else await prepare(mode,true);}
  if(!$('ai-dialog').open)$('ai-dialog').show();editor.resume();controls();
  refreshInfo().then(history).catch(e=>message('Agent 检测失败：'+e.message));
 }catch(e){host.say(e.message);}
}
const exposedatelierAI={open,async openRepair({background=false}: any={}){await open('inpaint');if(!$('ai-dialog').open)return;$('ai-underpaint').checked=!background;$('ai-prompt').value=background?'移除选中区域内的前景人物、衣料或武器，补齐原本被遮住的完整背景。延续原有透视、纹理、光照和构图，保持选区外完全不变，不添加新的人物。':'补齐选中区域中被前景遮住的后层内容与隐藏轮廓，延续原有材质、人体结构和光照。保留已有的人物、手、武器和可见衣料，保持注册位置与尺寸，不添加新的前景。';message(background?'在源图涂抹被人物／衣料挡住的区域；AI 重绘选区内的背景，选区外保持不变。':'在源图涂抹需要补全的隐藏区域；生成后只填补透明缺口，保留已有可见像素。');controls();},draftChanged:controls,async loadJob(id){if(working)throw Error('正在准备任务');candidate=null;job=await host.invoke('agent-status',{id});await showSource(await host.invoke('agent-input',{id}),job.mode,{padding:job.padding});$('ai-result').hidden=true;$('ai-empty').hidden=false;await setJob(job);if(!$('ai-dialog').open)$('ai-dialog').show();editor.resume();},updateControls:controls,refresh(state){selectionState=state;$('ai-open').disabled=!state.available;$('ai-inpaint').disabled=!state.available;controls();}};
window.atelierAI=exposedatelierAI;
$('ai-open').onclick=()=>open('edit');$('ai-inpaint').onclick=()=>open('inpaint');$('ai-close').onclick=()=>$('ai-dialog').close();
$('ai-underpaint').onchange=controls;
$('ai-mode').onchange=async()=>{try{if($('ai-mode').value!=='inpaint')$('ai-underpaint').checked=false;controls();await prepare($('ai-mode').value,true);message('');}catch(e){message(e.message);$('ai-mask').hidden=true;}};
$('ai-prompt').oninput=controls;
$('ai-mask-import').onclick=async()=>{try{const value=await host.capture('inpaint');if(!value.mask)throw Error('主画布没有选区，可直接在上方源图涂抹');if(value.documentToken!==input.documentToken||value.revision!==input.revision||value.layerId!==input.layerId)throw Error('图层已变化，请创建新任务');await editor.importMask(value.mask,true);message('画布选区已导入，可继续涂抹或擦除');}catch(e){message(e.message);}};
$('ai-new').onclick=async()=>{try{clearJob();await prepare($('ai-mode').value);message('已绑定当前选中图层');}catch(e){message(e.message);}};
$('ai-start').onclick=async()=>{
 if(working||running())return;working=true;controls();const generation=++fetchGeneration;
 try{const mode=$('ai-mode').value,value=await host.capture('edit');if(value.documentToken!==input?.documentToken||value.revision!==input?.revision||value.layerId!==input?.layerId||value.source!==input?.source)throw Error('工程或源图已变化，请创建新任务再提交');let mask=null;if(mode==='inpaint'){if(!editor.state().hasMask)throw Error('请在源图上涂抹需要重绘的区域');mask=editor.maskPNG();const radius=Number($('ai-mask-feather').value);if(radius>0)mask=(await host.invoke('process',{op:'feather',args:{image:mask,radius}})).image;}const padding=mode==='outpaint'?editor.readPadding():[0,0,0,0];const verify=await host.capture('edit');if(value.documentToken!==verify.documentToken||value.revision!==verify.revision||value.layerId!==verify.layerId||value.source!==verify.source)throw Error('准备期间工程已变化，请重新提交');input={...value,mask};$('ai-mask').hidden=!mask;if(mask)$('ai-mask').src=mask;const result=await host.invoke('agent-start',{...value,mask,...window.atelierAgents.selection('ai'),sessionId:window.atelierAgentChat?.sessionId()||null,mode,prompt:$('ai-prompt').value,padding});if(generation!==fetchGeneration)return;candidate=null;await setJob(result);if(mask)await editor.importMask(mask);await history();}catch(e){message(e.message);await refreshInfo().catch(()=>{});}finally{working=false;controls();}
};
$('ai-cancel').onclick=async()=>{if(!job)return;try{await setJob(await host.invoke('agent-cancel',{id:job.id}));await history();}catch(e){message(e.message);}};
$('ai-collect').onclick=async()=>{if(!job||working)return;working=true;controls();try{await setJob(await host.invoke('agent-collect',{id:job.id}));await history();}catch(e){message(e.message);}finally{working=false;controls();}};
$('ai-reveal').onclick=async()=>{try{const result=await host.invoke('agent-reveal',{id:job.id});message('任务目录：'+result.directory);}catch(e){message(e.message);}};
$('ai-recover-alpha').onclick=async()=>{if(!job||working)return;const input=$('ai-alpha-threshold');if(!input.validity.valid||input.value==='')return message('透明残留阈值须为 0–16');working=true;controls();try{await setJob(await host.invoke('agent-recover-candidate',{id:job.id,documentToken:host.binding().documentToken,threshold:Number(input.value)}));await history();}catch(e){message(e.message);}finally{working=false;controls();}};
$('ai-import').onclick=()=>$('ai-result-file').click();
$('ai-result-file').onchange=async()=>{const file=$('ai-result-file').files[0];if(!file||!job)return;const id=job.id;working=true;controls();try{if(file.size>24*1024*1024)throw Error('产出 PNG 超过 24 MB');const image=await new Promise((resolve: any,reject: any)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const value=await host.invoke('agent-import',{id,image});if(job?.id===id)await setJob(value);await history();}catch(e){message(e.message);}finally{$('ai-result-file').value='';working=false;controls();}};
async function apply(asNew){if(!candidate||!job||working)return;working=true;controls();try{if(!asNew&&$('ai-underpaint').checked){const value=await host.invoke('agent-input',{id:job.id});await host.repair(job,value.mask);}else await host.apply(job,candidate,asNew,$('ai-fit').checked);job=await host.invoke('agent-applied',{id:job.id});message('候选图已应用，可通过撤销恢复原图');$('ai-dialog').close();}catch(e){message(e.message);}finally{working=false;controls();}}
$('ai-apply').onclick=()=>apply(false);$('ai-add').onclick=()=>apply(true);
$('ai-jobs').onchange=async()=>{const id=$('ai-jobs').value;if(!id||running()||working)return;const generation=++fetchGeneration;working=true;controls();try{const value=await host.invoke('agent-status',{id}),source=await host.invoke('agent-input',{id});if(generation!==fetchGeneration)return;candidate=null;await showSource(source,value.mode,{padding:value.padding});$('ai-result').hidden=true;$('ai-empty').hidden=false;$('ai-context').textContent='任务图层：'+value.layerName+' · '+new Date(value.createdAt).toLocaleString();await setJob(value);}catch(e){message(e.message);}finally{working=false;controls();}};
$('ai-settings').onclick=()=>window.atelierAgents.manage('preferences');
$('ai-inspect-open').onclick=()=>{if(!input||working)return;syncInspect();$('ai-inspect').showModal();};
$('ai-inspect-close').onclick=()=>$('ai-inspect').close();
$('ai-inspect-zoom').oninput=()=>$('ai-inspect').style.setProperty('--inspect-zoom',Number($('ai-inspect-zoom').value)/100);
$('ai-inspect-mask-toggle').onchange=()=>$('inspect-mask').hidden=!input?.mask||!$('ai-inspect-mask-toggle').checked;
let scrolling=false;for(const [source,destination] of [['inspect-source-scroll','inspect-result-scroll'],['inspect-result-scroll','inspect-source-scroll']] as const)$(source).onscroll=()=>{if(scrolling)return;scrolling=true;$(destination).scrollTop=$(source).scrollTop;$(destination).scrollLeft=$(source).scrollLeft;requestAnimationFrame(()=>scrolling=false);};
return {atelierAI:exposedatelierAI};
})();
