/* Post-stroke feedback checks every existing action off the UI thread.
 * A warning leaves the edit available for undo or further correction. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost;
const root=document.createElement('div');root.id='character-weight-audit';root.innerHTML='<div class="button-row"><button id="weight-audit-run">检查全部动作</button><button id="weight-audit-locate" hidden>定位问题</button></div><p id="weight-audit-status" role="status"></p>';$('character-weight-test').after(root);
let run=null,result=null;
function cancel(){if(run)run.worker.terminate();run=null;}
function matches(captured){const s=host.state();return s.documentToken===captured.documentToken&&s.revision===captured.revision&&s.document===captured.document&&s.layer?.id===captured.layer?.id&&!s.busy;}
function refresh(){const s=host.state(),m=s.document?.characterRig?.meshes?.find(m=>m.layerId===s.layer?.id);$('weight-audit-run').disabled=s.busy||!m;
 if(run&&!matches(run.captured)){cancel();$('weight-audit-status').textContent='工程或图片已变化，可重新检查';}
 if(result&&!matches(result.captured)){result=null;$('weight-audit-status').textContent='工程或图片已变化，可重新检查';delete root.dataset.report;delete root.dataset.ok;}
 $('weight-audit-locate').hidden=!result?.issue;
}
function check(layerId=host.state().layer?.id){cancel();result=null;delete root.dataset.report;delete root.dataset.ok;$('weight-audit-locate').hidden=true;const captured=host.state();if(captured.busy||captured.layer?.id!==layerId||!captured.document?.characterRig?.meshes?.some(m=>m.layerId===layerId))return;
 $('weight-audit-status').textContent='正在检查当前网格的全部动作…';
 try{const worker=new Worker('character-weight-audit-worker.js');run={worker,captured};
  const finish=()=>{worker.terminate();if(run?.worker===worker)run=null;};
  worker.onerror=e=>{if(run?.worker!==worker)return;finish();if(matches(captured))$('weight-audit-status').textContent='检查失败：'+e.message;};
  worker.onmessage=({data})=>{if(run?.worker!==worker)return;finish();if(!matches(captured)){refresh();$('weight-audit-status').textContent='工程或图片已变化，旧检查结果已丢弃';return;}if(data.error){$('weight-audit-status').textContent='检查失败：'+data.error;return;}
   const reports=data.reports,issue=reports.find(r=>!r.ok),samples=reports.reduce((n,r)=>n+r.samples,0);result={captured,issue};root.dataset.ok=String(!issue);root.dataset.report=JSON.stringify(reports);$('weight-audit-locate').hidden=!issue;
   $('weight-audit-status').textContent=issue?`${issue.name} ${issue.firstIssue.seconds.toFixed(3)} s · ${issue.flippedTriangles} 次翻面 / ${issue.compressedTriangles} 次过度压缩${issue.unreachableSamples||issue.unresolvedSamples?' / IK 异常':''}；可撤销本笔或继续修正`:`${reports.length} 个动作 · ${samples} 个采样时刻 · 未发现翻面或过度压缩`;
  };
  worker.postMessage({document:window.CardCharacterMeshReduction.snapshot(captured.document),layerId});
 }catch(e){cancel();$('weight-audit-status').textContent='检查失败：'+e.message;}
}
$('weight-audit-run').onclick=()=>check();$('weight-audit-locate').onclick=()=>{if(!result?.issue||!matches(result.captured)){refresh();return;}const issue=result.issue;window.atelierWorkspace.selectAction(issue.actionId);window.atelierAnimation.seek(issue.firstIssue.seconds);const vertex=issue.firstIssue.vertices?.[0];if(vertex!==undefined)window.atelierCharacterAdvanced.selectVertex(vertex);};
window.atelierWeightAudit={run:check,refresh};refresh();
})();
