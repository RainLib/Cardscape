const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createServices}=require('../electron/services.cjs'),{createAgentSetup,authResult,compareVersions,quote}=require('../electron/agent-setup.cjs'),diagnostics=require('../renderer/agent-diagnostics.js');
test('login states never expose CLI authentication output and separate old CLI detection',()=>{
 const yes=authResult('codex',{code:0,output:'Logged in using API key - sk-secret-example'});assert.equal(yes.ready,true);assert.equal(JSON.stringify(yes).includes('secret'),false);
 assert.equal(authResult('codex',{code:1,output:'Not logged in'}).state,'logged_out');assert.equal(authResult('codex',{code:0,output:'Not logged in'}).ready,false);
 assert.equal(authResult('codex',{code:0,output:'a random reply'}).ready,false);assert.equal(authResult('codex',{code:2,output:'unexpected argument status'}).state,'unsupported');assert.equal(authResult('codex',{timeout:true}).state,'error');
 assert.equal(authResult('external',{code:0,output:'signed_out'},'signed_in').ready,false);assert.equal(authResult('external',{code:0,output:'signed_in'},'signed_in').ready,true);
});
test('selected CLI is checked freshly and blocks both chat and image before writing a task',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-cli-auth-')),s=createServices({runtimeDir:dir});
 try{const fixture=path.join(dir,'status.cjs'),flag=path.join(dir,'signed-in'),count=path.join(dir,'checks');await fs.writeFile(fixture,`const fs=require('fs');fs.appendFileSync(${JSON.stringify(count)},'1');if(fs.existsSync(${JSON.stringify(flag)}))process.stdout.write('signed_in');else{process.stdout.write('signed_out');process.exitCode=1;}`);
  await s.invoke('agent-config',{profiles:[{id:'auth-test',name:'登录协议测试',executable:process.execPath,requiresLogin:true,statusArgs:[fixture],statusSuccessText:'signed_in',loginArgs:['--version'],chatArgs:['-e','process.stdout.write("ok")'],args:[]}]});const c=await s.invoke('agent-chat-create',{adapter:'auth-test'});
  await assert.rejects(s.invoke('agent-chat-send',{id:c.id,text:'test'}),/未通过/);await assert.rejects(s.invoke('agent-start',{adapter:'auth-test'}),/未通过/);assert.equal((await s.invoke('agent-chat-status',{id:c.id})).messages.length,0);assert.equal((await s.invoke('agent-list')).length,0);
  await fs.writeFile(flag,'fixture, not real credentials');assert.equal((await s.invoke('agent-setup-status',{adapter:'auth-test'})).ready,true);await s.invoke('agent-chat-send',{id:c.id,text:'test'});let completed=false;const deadline=Date.now()+15000;while(Date.now()<deadline){const next=await s.invoke('agent-chat-status',{id:c.id});if(next.state!=='running'){assert.equal(next.messages.at(-1).text,'ok');completed=true;break;}await new Promise(r=>setTimeout(r,50));}assert.ok(completed,'CLI fixture must finish before testing the subsequent login check');
  await fs.unlink(flag);await assert.rejects(s.invoke('agent-chat-send',{id:c.id,text:'again'}),/未通过/);assert.ok((await fs.readFile(count,'utf8')).length>=5);
  await s.invoke('agent-config',{profiles:[{id:'auth-test',name:'未配置检测',executable:process.execPath,chatArgs:['--version']}]});assert.equal((await s.invoke('agent-setup-status',{adapter:'auth-test'})).state,'unconfigured');await assert.rejects(s.invoke('agent-chat-send',{id:c.id,text:'again'}),/检测参数/);
  await s.invoke('agent-config',{codexExecutable:path.join(dir,'missing')});assert.equal((await s.invoke('agent-setup-status',{adapter:'codex'})).state,'missing');
 }finally{s.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('update diagnostics compare versions, network failures remain unknown, and terminal arguments are quoted',async()=>{
 assert.equal(compareVersions('codex-cli 0.142.1','0.153.4'),-1);assert.equal(compareVersions('codex-cli 0.153.4','0.153.4'),0);assert.equal(compareVersions('unknown','0.153.4'),null);
 assert.equal(diagnostics.classify("The 'gpt-x' model is not supported when using Codex with a ChatGPT account.").kind,'model');assert.equal(diagnostics.classify('unexpected argument --json').kind,'version');assert.equal(diagnostics.classify('401 unauthorized').kind,'login');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atelier-cli-terminal-'));let opened=null;const cfg={codexExecutable:'missing',profiles:[{id:'external',name:'测试',executable:process.execPath,requiresLogin:true,statusArgs:['-e','process.exit(1)'],loginArgs:['-e',"process.stdout.write(`$x 'quoted'`)"]}]};
 try{const setup=createAgentSetup({runtimeDir:dir,configuration:async()=>cfg,executable:async name=>name==='missing'?null:process.execPath,dialogs:{openSetup:async file=>{opened=file;return '';}},latest:async()=> '0.153.4'});
  const update=await setup.invoke('agent-setup-check-update');assert.equal(update.update.state,'install');assert.equal(update.update.latest,'0.153.4');
  const login=await setup.invoke('agent-setup-login',{adapter:'external'});assert.ok(login.command.includes(quote(cfg.profiles[0].loginArgs[1])));if(process.platform==='darwin'){assert.ok(opened);const content=await fs.readFile(opened,'utf8');assert.ok(content.includes(login.command));assert.equal((await fs.stat(opened)).mode&0o777,0o700);}
  const offline=createAgentSetup({runtimeDir:dir,configuration:async()=>cfg,executable:async()=>null,latest:async()=>{throw Error('offline');}});assert.equal((await offline.invoke('agent-setup-check-update')).update.state,'error');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
