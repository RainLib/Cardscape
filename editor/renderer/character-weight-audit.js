/* All-action feedback and local repair run off the UI thread. A validated host
 * transaction commits a fully checked candidate once; stale/cancelled work cannot. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),host=window.cardEditorHost;
const root=document.createElement('div');root.id='character-weight-audit';root.innerHTML='<div class="button-row"><button id="weight-audit-run">检查全部动作</button><button id="weight-audit-locate" hidden>定位问题</button><button id="weight-audit-repair" hidden>一键局部平滑修正</button><button id="weight-audit-compare" hidden>修正前后对比</button><button id="weight-audit-cancel" hidden>取消处理</button></div><p id="weight-audit-status" role="status"></p>';$('character-weight-test').after(root);
let run=null,result=null,comparison=null,applying=false;
function cancel(){if(run)run.worker.terminate();run=null;}
function matches(captured){const s=host.state();return s.documentToken===captured.documentToken&&s.revision===captured.revision&&s.document===captured.document&&s.layer?.id===captured.layer?.id&&!s.busy;}
function controls(){const s=host.state(),m=s.document?.characterRig?.meshes?.find(m=>m.layerId===s.layer?.id);$('weight-audit-run').disabled=s.busy||!m||!!run;$('weight-audit-cancel').hidden=!run;$('weight-audit-locate').hidden=!result?.issue;$('weight-audit-locate').disabled=!!run;$('weight-audit-repair').hidden=!result?.reports.some(r=>r.flippedTriangles||r.compressedTriangles);$('weight-audit-repair').disabled=!!run||s.busy||!!s.layer?.locked;$('weight-audit-compare').hidden=!comparison;}
function refresh(){if(applying)return;let stale=false;
 if(run&&!matches(run.captured)){cancel();stale=true;}
 if(result&&!matches(result.captured)){result=null;delete root.dataset.report;delete root.dataset.ok;stale=true;}
 if(comparison&&!matches(comparison)){comparison=null;delete root.dataset.repair;stale=true;}
 if(stale)$('weight-audit-status').textContent='工程或图片已变化，可重新检查';controls();
}
function show(reports,captured){const issue=reports.find(r=>!r.ok),samples=reports.reduce((n,r)=>n+r.samples,0);result={captured,issue,reports};root.dataset.ok=String(!issue);root.dataset.report=JSON.stringify(reports);
 $('weight-audit-status').textContent=issue?`${issue.name} ${issue.firstIssue.seconds.toFixed(3)} s · ${issue.flippedTriangles} 次翻面 / ${issue.compressedTriangles} 次过度压缩${issue.unreachableSamples||issue.unresolvedSamples?' / IK 异常':''}；可定位或局部修正`:`${reports.length} 个动作 · ${samples} 个采样时刻 · 未发现翻面或过度压缩`;controls();
}
function check(layerId=host.state().layer?.id,mode='check'){
 if(mode==='repair'&&(!result||!matches(result.captured)))return refresh();cancel();
 const captured=host.state();if(captured.busy||captured.layer?.id!==layerId||!captured.document?.characterRig?.meshes?.some(m=>m.layerId===layerId)||mode==='repair'&&captured.layer.locked)return;
 if(mode==='check'){result=null;delete root.dataset.report;delete root.dataset.ok;}
 const locks=window.atelierCharacterAdvanced?.weightLocks()||[];
 $('weight-audit-status').textContent=mode==='repair'?'正在局部平滑并复查全部动作… 可取消':'正在检查当前网格的全部动作…';
 try{const worker=new Worker('character-weight-audit-worker.js');run={worker,captured};controls();
  const finish=()=>{worker.terminate();if(run?.worker===worker)run=null;controls();};
  worker.onerror=e=>{if(run?.worker!==worker)return;finish();if(matches(captured))$('weight-audit-status').textContent='处理失败：'+e.message;};
  worker.onmessage=({data})=>{if(run?.worker!==worker)return;if(data.progress){if(!matches(captured)){refresh();return;}$('weight-audit-status').textContent=({prepare:'准备局部支撑区',smooth:'局部平滑',verify:'复查全部动作'})[data.progress.stage]+'… 可取消';return;}
   finish();if(!matches(captured)){refresh();$('weight-audit-status').textContent='工程或图片已变化，旧检查结果已丢弃';return;}if(data.error){$('weight-audit-status').textContent='处理失败：'+data.error;return;}
   if(mode==='check'){show(data.reports,captured);return;}
   const repair=data.result;if(!repair.changed){$('weight-audit-status').textContent=repair.reason;return;}
   try{applying=true;window.atelierCharacterAdvanced.applyWeightRepair(captured,repair,locks);const now=host.state();show(repair.after,now);comparison=now;root.dataset.repair=JSON.stringify({...repair,weights:undefined,comparison:undefined});$('weight-audit-status').textContent=`修正 ${repair.vertices.length} 个局部顶点 · 最大权重变化 ${(repair.maxWeightDelta*100).toFixed(2)} 个百分点 · ${repair.reason} · 可撤销`;
   }catch(e){$('weight-audit-status').textContent=e.message;}finally{applying=false;controls();}
  };
  worker.postMessage({mode,document:window.CardCharacterMeshReduction.snapshot(captured.document),layerId,locked:locks});
 }catch(e){cancel();controls();$('weight-audit-status').textContent='处理失败：'+e.message;}
}
$('weight-audit-run').onclick=()=>check();$('weight-audit-repair').onclick=()=>check(host.state().layer?.id,'repair');$('weight-audit-cancel').onclick=()=>{cancel();controls();$('weight-audit-status').textContent='已取消处理，工程未修改';};
$('weight-audit-compare').onclick=()=>{if(comparison&&matches(comparison))window.atelierCharacterAdvanced.openWeightComparison();else refresh();};
$('weight-audit-locate').onclick=()=>{if(!result?.issue||!matches(result.captured)){refresh();return;}const issue=result.issue;window.atelierWorkspace.selectAction(issue.actionId);window.atelierAnimation.seek(issue.firstIssue.seconds);const vertex=issue.firstIssue.vertices?.[0];if(vertex!==undefined)window.atelierCharacterAdvanced.selectVertex(vertex);};
window.atelierWeightAudit={run:check,refresh};refresh();
})();
