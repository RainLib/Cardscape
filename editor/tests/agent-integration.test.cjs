const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createServices}=require('../electron/services.cjs');
async function mask(s,weights=[0,0,0,0],width=32,height=48){return (await s.worker.call('bake_mask',{width,height,uv:[0,0,1,0,1,1,0,1],weights,indices:[0,1,2,0,2,3]})).image;}
function request(source,mode='edit'){return {adapter:'handoff',mode,prompt:'Modify only the requested art region',source,layerId:'background',layerName:'背景',documentToken:'audit-document',revision:2,padding:[0,0,0,0]};}
test('external handoff validates real output, preserves inpaint pixels and recovers jobs',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-agent-'));let s=createServices({runtimeDir:dir});
 try{
  const black=await mask(s),white=await mask(s,[1,1,1,1]),half=await mask(s,[0,1,1,0]);
  const job=await s.invoke('agent-start',{...request(black,'inpaint'),mask:half});assert.equal(job.state,'waiting');
  const contract=JSON.parse(await fs.readFile(path.join(job.directory,'contract.json')));assert.equal(contract.selection,'selection-mask.png');assert.equal(contract.output.width,32);
  await fs.writeFile(path.join(job.directory,'input.png'),Buffer.from(white.split(',')[1],'base64')); // An agent cannot change the immutable source snapshot.
  await fs.writeFile(path.join(job.directory,'output.png'),Buffer.from(white.split(',')[1],'base64'));
  await fs.writeFile(path.join(job.directory,'result.json'),JSON.stringify({status:'completed',image:'output.png',message:'fixture'}));
  assert.equal((await s.invoke('agent-collect',{id:job.id})).state,'ready');
  const result=await s.invoke('agent-result',{id:job.id});const expected=await s.worker.call('resize',{image:half,width:32,height:48});assert.equal(result.image,expected.image);
  s.close();s=createServices({runtimeDir:dir});assert.equal((await s.invoke('agent-status',{id:job.id})).state,'ready');assert.equal((await s.invoke('agent-result',{id:job.id})).image,result.image);
  const escape=await s.invoke('agent-start',request(black));await fs.writeFile(path.join(escape.directory,'result.json'),JSON.stringify({status:'completed',image:'../'+job.id+'/output.png',message:'bad'}));assert.equal((await s.invoke('agent-collect',{id:escape.id})).state,'failed');assert.match((await s.invoke('agent-status',{id:escape.id})).message,/越过/);
  const invalid=await s.invoke('agent-start',request(black));const wrong=await mask(s,[1,1,1,1],16,24);assert.equal((await s.invoke('agent-import',{id:invalid.id,image:wrong})).state,'failed');assert.match((await s.invoke('agent-status',{id:invalid.id})).message,/dimensions/);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('custom CLI receives structured contract and cancellation stops its process',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-cli-')),s=createServices({runtimeDir:dir});
 try{
  const fixture=path.join(dir,'fixture.cjs');await fs.writeFile(fixture,"const fs=require('node:fs'),path=require('node:path');const c=JSON.parse(fs.readFileSync(process.argv[2]));fs.copyFileSync('input.png','output.png');fs.writeFileSync('result.json',JSON.stringify({status:'completed',image:'output.png',message:c.instruction}));");
  await s.invoke('agent-config',{codexExecutable:'codex',custom:{name:'test fixture',executable:process.execPath,requiresLogin:false,args:[fixture,'{contract}']}});
  const png=await mask(s);const job=await s.invoke('agent-start',{...request(png),adapter:'custom'});
  let status;for(let i=0;i<100;i++){status=await s.invoke('agent-status',{id:job.id});if(['ready','failed'].includes(status.state))break;await new Promise(r=>setTimeout(r,50));}assert.equal(status.state,'ready',status.message);
  await fs.writeFile(fixture,"setTimeout(()=>{},60000);");
  const slow=await s.invoke('agent-start',{...request(png),adapter:'custom'});await new Promise(r=>setTimeout(r,100));assert.equal((await s.invoke('agent-cancel',{id:slow.id})).state,'canceled');await new Promise(r=>setTimeout(r,200));assert.equal((await s.invoke('agent-status',{id:slow.id})).state,'canceled');
  await assert.rejects(s.invoke('agent-result',{id:slow.id}),/尚未/);
  await assert.rejects(s.invoke('agent-config',{codexExecutable:'codex',custom:{name:'bad',executable:'node',args:'shell text'}}),/无效/);
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('outpaint retains source pixels and refuses incorrect extension dimensions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-outpaint-')),s=createServices({runtimeDir:dir});
 try{const source=await mask(s),candidate=await mask(s,[1,1,1,1],48,64);const job=await s.invoke('agent-start',{...request(source,'outpaint'),padding:[8,8,8,8]});assert.equal((await s.invoke('agent-import',{id:job.id,image:candidate})).state,'ready');const result=await s.invoke('agent-result',{id:job.id});const stats=await s.worker.call('mask_stats',{image:result.image});assert.equal(stats.width,48);assert.equal(stats.active_pixels,48*64-32*48);await assert.rejects(s.invoke('agent-start',{...request(source,'outpaint'),padding:[0,0,0,0]}),/至少/);}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('a completed file contract is collected even if the CLI session keeps running',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-cli-tail-')),s=createServices({runtimeDir:dir});
 try{const fixture=path.join(dir,'fixture.cjs');await fs.writeFile(fixture,"const fs=require('fs');fs.copyFileSync('input.png','output.png');fs.writeFileSync('result.json',JSON.stringify({status:'completed',image:'output.png',message:'test fixture'}));setInterval(()=>{},1000);");await s.invoke('agent-config',{codexExecutable:'codex',custom:{name:'test fixture',executable:process.execPath,requiresLogin:false,args:[fixture]}});const png=await mask(s),job=await s.invoke('agent-start',{...request(png),adapter:'custom'});let status;for(let i=0;i<60;i++){status=await s.invoke('agent-status',{id:job.id});if(['ready','failed'].includes(status.state))break;await new Promise(r=>setTimeout(r,100));}assert.equal(status.state,'ready',status.message);assert.equal((await s.invoke('agent-result',{id:job.id})).image,(await s.worker.call('resize',{image:png,width:32,height:48})).image);}finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
