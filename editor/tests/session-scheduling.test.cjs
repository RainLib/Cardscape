const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function harness(){
 const source=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8'),start=source.indexOf('function queueSession(){'),end=source.indexOf('async function newSession()',start),timers=new Map(),writes=[],status={textContent:''},body={dataset:{appMode:'editor',sessionState:'saved'}};let timerId=0,acks=0;
 assert.ok(start>0&&end>start);
 const context=vm.createContext({sessionReady:true,loading:false,doc:{schema:'card-atelier/1',frameStyle:{finish:'brains'}},gesture:false,freeTransform:false,applying:false,workshop:null,documentToken:'card',revision:1,savedRevision:0,sessionToken:'test-session',sessionSequence:0,sessionRunning:false,sessionAgain:false,sessionFingerprint:'',sessionFlight:null,sessionTimer:null,document:{body},$:()=>status,editorView:()=>({view:'effects'}),snapshot:()=>structuredClone(context.doc),cardThumbnail:()=>'',encodeSession:async project=>({project,blobs:{},ack:()=>acks++}),bridge:{invoke(method,args){assert.equal(method,'editor-session-save');let resolve;const promise=new Promise(r=>resolve=r);writes.push({args,resolve});return promise;}},console,setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source.slice(start,end),context);
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {context,writes,status,body,get acks(){return acks;},get pendingTimers(){return timers.size;},queue:()=>context.queueSession(),async run(){const [id,fn]=timers.entries().next().value||[];assert.ok(fn,'Latest state must have a scheduled save');timers.delete(id);fn();await tick();},async finish(index){writes[index].resolve({stale:false});await tick();}};
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
