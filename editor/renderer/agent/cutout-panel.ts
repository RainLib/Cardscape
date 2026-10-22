export const moduleApi=(() => {
'use strict';
const $=id=>(document.getElementById(id) as any),host=window.cardEditorHost;
let capture=null,candidate=null,working=false,generation=0,engine=null;
function engineNote(){const available=engine?.models?.find(m=>m.id===$('cutout-model').value)?.available;$('cutout-engine').textContent=available?'本地抠图已就绪 · 图片无需上传':'当前档位未就绪，请安装依赖与模型';}
function controls(){
 const available=engine?.models?.find(m=>m.id===$('cutout-model').value)?.available;
 $('cutout-run').disabled=working||!capture||!available;
 $('cutout-apply').disabled=working||!candidate;
 $('cutout-save-image').disabled=working||!candidate;$('cutout-save-mask').disabled=working||!candidate;
 $('cutout-model').disabled=working;$('cutout-output').disabled=working;
 $('cutout-cancel-task').hidden=!working;
}
function clear(){candidate=null;for(const id of ['cutout-result','cutout-mask'] as const)$(id).removeAttribute('src');controls();}
async function detect(){
 try{engine=await window.cardAIHost.invoke('cutout-info');engineNote();controls();}
 catch(e){engine=null;$('cutout-engine').textContent=e.message;controls();}
}
async function run(){
 if(working||!capture)return;clear();working=true;const token=++generation;controls();$('cutout-status').textContent='正在识别主体…首次加载模型需要数秒，可取消';
 try{
  const result=await window.cardAIHost.invoke('process',{op:'remove_background',args:{image:capture.source,model:$('cutout-model').value}});
  if(token!==generation)return;host.checkCutout(capture);candidate=result;
  $('cutout-result').src=result.image;$('cutout-mask').src=result.mask;
  $('cutout-status').textContent='抠图完成 · '+(result.elapsedMs/1000).toFixed(2)+' 秒 · '+Math.round(result.foregroundPixels/(result.width*result.height)*100)+'% 主体区域';
 }catch(e){if(token===generation)$('cutout-status').textContent=e.message;}
 finally{if(token===generation){working=false;controls();}}
}
async function cancel(){generation++;working=false;await window.cardAIHost.invoke('cancel');$('cutout-status').textContent='已取消，原图未修改';controls();}
async function close(){if(working)await cancel();generation++;$('cutout-dialog').close();capture=null;clear();}
$('cutout-open').onclick=async()=>{
 try{capture=await host.captureCutout();clear();$('cutout-original').src=capture.source;$('cutout-target').textContent=capture.layerName;
  const coverage=$('cutout-output').querySelector('[value="coverage"]');coverage.disabled=!capture.canCoverage;$('cutout-output').value=capture.canCoverage?'coverage':'new';
  $('cutout-status').textContent='检查本地模型…';$('cutout-dialog').showModal();await detect();
  if(engine?.models?.find(m=>m.id===$('cutout-model').value)?.available)await run();
  else $('cutout-status').textContent='安装后点击重新检测，再开始抠图。';
 }catch(e){host.say(e.message);}
};
$('cutout-run').onclick=run;$('cutout-model').onchange=()=>{clear();engineNote();if(engine?.models?.find(m=>m.id===$('cutout-model').value)?.available)run();else $('cutout-status').textContent='安装当前档位模型后重新检测，或选择已就绪的档位。';};
for(const [id,key,suffix] of [['cutout-save-image','image','透明'],['cutout-save-mask','mask','Mask']] as const)$(id).onclick=async()=>{if(!candidate||working)return;try{const result=await window.cardAIHost.invoke('save-image',{image:candidate[key],name:capture.layerName.replace(/\.[^.]+$/,'')+'-'+suffix});if(!result.canceled)$('cutout-status').textContent='已保存：'+result.file;}catch(e){$('cutout-status').textContent=e.message;}};
$('cutout-detect').onclick=detect;
$('cutout-setup').onclick=async()=>{try{const r=await window.cardAIHost.invoke('cutout-setup');$('cutout-setup-command').textContent=r.opened?'安装终端已打开，完成后点击重新检测':r.command;$('cutout-setup-command').hidden=false;}catch(e){$('cutout-status').textContent=e.message;}};
$('cutout-cancel-task').onclick=cancel;$('cutout-close').onclick=close;
$('cutout-dialog').addEventListener('cancel',e=>{e.preventDefault();close();});
$('cutout-smart').onclick=async()=>{await close();host.smartCutout();};
$('cutout-apply').onclick=async()=>{if(!candidate||working)return;working=true;controls();try{await host.applyCutout(capture,candidate,$('cutout-output').value);working=false;await close();}catch(e){working=false;$('cutout-status').textContent=e.message;controls();}};
const exposedatelierCutout={refresh(state){$('cutout-open').disabled=state.busy||!state.layer?.src;}};
window.atelierCutout=exposedatelierCutout;
return {atelierCutout:exposedatelierCutout};
})();
