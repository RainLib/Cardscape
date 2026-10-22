const test=require('node:test'),assert=require('node:assert/strict');

function harness(){
 const {createSessionController}=require('../dist/renderer/core/session-controller.js');
 const timers=new Map(),writes=[],status={textContent:''},body={dataset:{appMode:'editor',sessionState:'saved'}};let timerId=0,acks=0;
 const context={sessionReady:true,loading:false,doc:{schema:'card-atelier/1',frameStyle:{finish:'brains'}},gesture:false,freeTransform:false,applying:false,workshop:null,documentToken:'card',revision:1,savedRevision:0,editorView:()=>({view:'effects'})};
 const controller=createSessionController({
  state:()=>({ready:context.sessionReady&&!context.loading&&!!context.doc&&body.dataset.appMode==='editor',blocked:context.gesture||context.freeTransform||context.applying,documentKey:JSON.stringify([context.documentToken,context.revision,context.savedRevision]),cardId:context.documentToken,revision:context.revision,savedRevision:context.savedRevision,view:context.editorView()}),
  capture:()=>structuredClone(context.doc),encode:async project=>({project,blobs:{},ack:()=>acks++}),
  save(args){let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});writes.push({args,resolve,reject});return promise;},
  status(state,cardId){body.dataset.sessionState=state;if(cardId)body.dataset.sessionCard=cardId;},error(){},
  schedule(fn){const id=++timerId;timers.set(id,fn);return id;},cancel:id=>timers.delete(id)
 });
 controller.activate('test-session');
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {context,writes,status,body,controller,tick,get acks(){return acks;},get pendingTimers(){return timers.size;},queue:()=>controller.queue(),async run(){const [id,fn]=timers.entries().next().value||[];assert.ok(fn,'Latest state must have a scheduled save');timers.delete(id);fn();await tick();},async finish(index,result={stale:false}){writes[index].resolve(result);await tick();}};
}

test('undo during an active recovery write schedules the latest document and never reports the old revision as synced',async()=>{
 const h=harness();h.queue();await h.run();assert.equal(h.writes[0].args.project.frameStyle.finish,'brains');
 h.context.doc.frameStyle.finish='refraction';h.context.revision=2;h.queue();await h.run();assert.equal(h.writes.length,1);
 await h.finish(0);assert.equal(h.body.dataset.sessionState,'pending');assert.ok(h.pendingTimers>0);
 await h.run();assert.equal(h.writes.length,2);assert.equal(h.writes[1].args.revision,2);assert.equal(h.writes[1].args.project.frameStyle.finish,'refraction');
 await h.finish(1);assert.equal(h.body.dataset.sessionState,'saved');assert.equal(h.acks,2);assert.equal(h.pendingTimers,0);
});

test('rapid edits coalesce into the latest recovery and a view change during save is also retained',async()=>{
 const h=harness();h.queue();await h.run();h.context.revision=2;h.context.doc.frameStyle.finish='glyphs';h.queue();await h.run();
 h.context.revision=3;h.context.doc.frameStyle.finish='refraction';h.context.editorView=()=>({view:'space'});h.queue();await h.run();await h.finish(0);
 await h.run();assert.equal(h.writes.length,2);assert.equal(h.writes[1].args.revision,3);assert.equal(h.writes[1].args.view.view,'space');
 h.context.editorView=()=>({view:'effects'});h.queue();await h.run();await h.finish(1);assert.equal(h.body.dataset.sessionState,'pending');
 await h.run();assert.equal(h.writes[2].args.revision,3);assert.equal(h.writes[2].args.view.view,'effects');await h.finish(2);assert.equal(h.body.dataset.sessionState,'saved');
});

test('automatic playback and camera movement do not continuously resave an unchanged workshop',async()=>{
 const h=harness();let seconds=0,yaw=0,paused=false;
 h.context.editorView=()=>({view:'effects',paused,pose:{time:seconds,yaw,paused}});
 h.queue();await h.run();assert.equal(h.writes[0].args.view.pose.time,0);
 seconds=10;yaw=45;await h.finish(0);
 assert.equal(h.body.dataset.sessionState,'saved');assert.equal(h.pendingTimers,0);assert.equal(h.writes.length,1);
 // An explicit pause/seek must still save the newly chosen view, including
 // an interaction that arrives while its first write is in flight.
 paused=true;seconds=1;h.queue();await h.run();assert.equal(h.writes[1].args.view.pose.time,1);
 seconds=2;h.queue();await h.run();await h.finish(1);assert.equal(h.body.dataset.sessionState,'pending');
 await h.run();assert.equal(h.writes[2].args.view.pose.time,2);await h.finish(2);
 assert.equal(h.body.dataset.sessionState,'saved');assert.equal(h.pendingTimers,0);
});

test('activating a different session ignores the previous in-flight acknowledgement',async()=>{
 const h=harness();h.queue();await h.run();h.controller.activate('next-session');h.context.documentToken='next-card';
 await h.finish(0);assert.equal(h.acks,0);h.queue();await h.run();assert.equal(h.writes[1].args.token,'next-session');assert.equal(h.writes[1].args.sequence,1);
 await h.finish(1);assert.equal(h.acks,1);assert.equal(h.body.dataset.sessionCard,'next-card');
});

test('flush waits for the current write then persists the latest edit exactly once',async()=>{
 const h=harness();h.queue();await h.run();h.context.revision=2;h.queue();const flushing=h.controller.flush();
 await h.finish(0);assert.equal(h.writes.length,2);assert.equal(h.writes[1].args.revision,2);await h.finish(1);await flushing;
 assert.equal(h.pendingTimers,0);assert.equal(h.body.dataset.sessionState,'saved');
});

test('flush rejects blocked editing and failed recovery writes',async()=>{
 const h=harness();h.context.gesture=true;await assert.rejects(h.controller.flush(),/结束当前操作/);assert.equal(h.writes.length,0);
 h.context.gesture=false;const flushing=h.controller.flush();await h.tick();h.writes[0].reject(Error('disk full'));await assert.rejects(flushing,/未同步成功/);assert.equal(h.body.dataset.sessionState,'error');
});

test('flush drains edits that arrive during a follow-up recovery write',async()=>{
 const h=harness();h.queue();await h.run();h.context.revision=2;h.queue();const flushing=h.controller.flush();
 await h.finish(0);assert.equal(h.writes.length,2);h.context.revision=3;h.context.doc.frameStyle.finish='glyphs';h.queue();
 await h.finish(1);assert.equal(h.writes.length,3);assert.equal(h.writes[2].args.revision,3);assert.equal(h.writes[2].args.project.frameStyle.finish,'glyphs');
 await h.finish(2);await flushing;assert.equal(h.pendingTimers,0);assert.equal(h.body.dataset.sessionState,'saved');
});
