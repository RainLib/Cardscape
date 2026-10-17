// QA-only controls around the unmodified exported player and its public API.
(async()=>{
 'use strict';
 const wait=()=>new Promise(r=>requestAnimationFrame(r));
 while(document.body.dataset.ready!=='true'){if(document.body.dataset.error)throw Error(document.body.dataset.error);await wait();}
 const reference=await(await fetch('review-reference.json')).json(),manifest=await(await fetch('manifest.json')).json(),canvas=document.getElementById('author-model-canvas'),preview=window.cardPreview;
 const section=document.createElement('section');section.style.cssText='padding:16px;background:#151923;color:#eee';
 section.innerHTML='<button id="qa-matrix">生成动作与九角度验证图</button><output id="qa-result">待验证</output><div id="qa-contact" style="display:grid;grid-template-columns:repeat(9,1fr);gap:6px"></div>';
 document.body.append(section);
 const report={frames:[],status:'pending'};
 function capture(action,seconds,yaw,pitch,record=true){
  preview.pose(yaw,pitch);preview.playAction(action,seconds,true);
  if(canvas.dataset.glError!=='0')throw Error('GL error: '+canvas.dataset.glError);
  if(canvas.dataset.action!==action||Math.abs(Number(canvas.dataset.actionSeconds)-seconds)>.002||(action!=='flip'&&Number(canvas.dataset.angle)!==yaw)||Math.abs(Number(canvas.dataset.pitch)-pitch)>.002)throw Error('Stale render / action sample');
  const frame={action,seconds,yaw,pitch,glError:canvas.dataset.glError,pose:JSON.parse(canvas.dataset.characterPose),png:canvas.toDataURL('image/png')};
  const expected=reference.samples.find(s=>s.action===action&&Math.abs(s.seconds-seconds)<.00001);
  if(expected)for(const bone of frame.pose)for(let i=0;i<6;i++)if(Math.abs(bone.matrix[i]-expected.bones[bone.id].matrix[i])>.00001)throw Error('Character pose differs from reference');
  if(expected?.geometry){const actual=preview.getCharacterGeometry();for(const [id,mesh] of Object.entries(expected.geometry)){if(actual[id]?.positions.length!==mesh.positions.length)throw Error('Skinned vertex count differs: '+id);for(let i=0;i<mesh.positions.length;i++){const error=Math.abs(actual[id].positions[i]-mesh.positions[i]);report.maxGeometryError=Math.max(report.maxGeometryError||0,error);if(error>.000005)throw Error('Skinned vertex buffer differs: '+id+' vertex '+i+' error '+error);}}}
  if(record)report.frames.push({...frame,png:undefined});return frame;
 }
 document.getElementById('qa-matrix').onclick=async()=>{try{
  const out=document.getElementById('qa-result'),contact=document.getElementById('qa-contact');out.textContent='正在渲染';contact.replaceChildren();report.frames=[];
  for(const sample of reference.samples){for(const [yaw,pitch] of sample.angles||reference.angles){
   const frame=capture(sample.action,sample.seconds,yaw,pitch),figure=document.createElement('figure');figure.style.margin='0';
   const img=new Image();img.src=frame.png;img.style.width='100%';const label=document.createElement('figcaption');label.textContent=`${sample.action} ${sample.seconds.toFixed(2)}s ${yaw}/${pitch}`;label.style.fontSize='10px';figure.append(img,label);contact.append(figure);
   const id=sample.captureId||`${sample.action}-${sample.seconds}-${yaw}-${pitch}`;
   await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,png:frame.png})}).then(r=>{if(!r.ok)throw Error('capture failed');});
  }}
  const a=capture(reference.primaryAction||'trigger',reference.primarySeconds??.45,0,0,false).png,b=capture(reference.primaryAction||'trigger',reference.primarySeconds??.45,0,0,false).png;report.pauseStable=a===b;if(!report.pauseStable)throw Error('paused frame changed');
  for(const id of reference.hidden){
   preview.setRenderOverrides({layers:manifest.layers.map(l=>({...l,visible:l.visible&&l.id!==id}))});
   const frame=capture(reference.primaryAction||'trigger',reference.primarySeconds??.45,20,12,false);
   await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'hidden-'+id,png:frame.png})}).then(r=>{if(!r.ok)throw Error('capture failed');});
  }
  preview.setRenderOverrides({layers:manifest.layers});report.hidden=reference.hidden;
  const back=capture('flip',1.2,0,0,false);await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'back',png:back.png})}).then(r=>{if(!r.ok)throw Error('capture failed');});report.flipRendered=true;
  capture(reference.primaryAction||'trigger',reference.primarySeconds??.45,0,0,false);
  report.status='rendered-needs-visual-review';out.textContent=`${report.frames.length} 帧已导出；暂停稳定；待人工像素验收`;
  section.dataset.report=JSON.stringify(report);await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
 }catch(e){report.status='failed';document.getElementById('qa-result').textContent=e.message;section.dataset.report=JSON.stringify(report);}};
})();
