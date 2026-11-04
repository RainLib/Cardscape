const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../dist/renderer/action-audio-model.js');
const Runtime=require('../dist/renderer/action-audio-runtime.js');
const bytes=M.pcm([Float32Array.from({length:48000},(_,i)=>Math.sin(i*.05)*.4)],48000);
const src='data:audio/wav;base64,'+Buffer.from(bytes).toString('base64');
const event=(extra={})=>({id:'sfx',name:'Test',src,sourceDuration:1,at:.25,duration:1.2,offset:.1,volume:.6,playbackRate:1,loop:false,enabled:true,...extra});
const action=(extra={})=>({id:'cast',name:'Cast',duration:4,loop:false,audioEvents:[event()],...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
test('audio cues reconstruct trimmed playback, rate, loops and half-open event windows',()=>{
 const a=action();assert.equal(M.cues(a,.99).length,0);close(M.cues(a,1)[0].offset,.1);close(M.cues(a,1.5)[0].offset,.6);assert.equal(M.cues(a,1.9).length,0);
 const fast=action({audioEvents:[event({playbackRate:2})]});close(M.cues(fast,1.2)[0].offset,.5);assert.equal(M.cues(fast,1.5).length,0);
 const loop=action({loop:true,audioEvents:[event({loop:true})]});close(M.cues(loop,2)[0].offset,.2);assert.match(M.cues(loop,5)[0].key,/:1$/);assert.equal(M.cues(loop,2.2).length,0);
 assert.deepEqual(M.cues(a,1.4),M.cues(a,1.4));assert.equal(M.cues(action({audioEvents:[event({enabled:false})]}),1.2).length,0);
});
test('PCM encoding preserves stereo samples, validates headers, trims metadata and rejects unknown fields',()=>{
 const stereo=M.pcm([new Float32Array(160).fill(-1),new Float32Array(160).fill(1)],8000),d=new DataView(stereo.buffer);
 assert.equal(d.getInt16(44,true),-32768);assert.equal(d.getInt16(46,true),32767);assert.deepEqual(M.wav(stereo),{duration:.02,channels:2,sampleRate:8000});
 M.validate(action());for(const extra of [{offset:1},{volume:2},{playbackRate:0},{duration:4},{src:'data:audio/wav;base64,AAAA'},{sourceDuration:2},{unrecognized:true}])assert.throws(()=>M.validate(action({audioEvents:[event(extra)]})));
 const broken=bytes.slice();new DataView(broken.buffer).setUint32(40,2,true);assert.throws(()=>M.wav(broken));assert.throws(()=>M.pcm([new Float32Array([NaN])],48000));
 assert.throws(()=>M.validate(action({audioEvents:[event(),event()]})));assert.throws(()=>M.validate(action({audioEvents:Array.from({length:17},(_,i)=>event({id:String(i)}))})));
 assert.equal(M.cues(action({audioEvents:Array.from({length:16},(_,i)=>event({id:String(i)}))}),1.2).length,8);
});
function fakeAudio(){
 const contexts=[],sources=[];let decodes=0;
 const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){}});
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};contexts.push(this);}
  async resume(){this.state='running';}async close(){this.state='closed';}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createAnalyser(){return {fftSize:256,connect(){},disconnect(){},getFloatTimeDomainData(out){out.fill(.2);}};}
  createBufferSource(){const source={playbackRate:param(),connect(){},disconnect(){},start(at,offset){this.started={at,offset};},stop(at){this.stopAt=at;}};sources.push(source);return source;}
  async decodeAudioData(buffer){decodes++;const info=M.wav(new Uint8Array(buffer));return {duration:info.duration,length:info.duration*info.sampleRate,numberOfChannels:info.channels};}
 }
 return {Context,contexts,sources,get decodes(){return decodes;}};
}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
test('hidden or paused transport cannot be restarted by a pending audio decode',async()=>{
 const original=global.AudioContext,fake=fakeAudio();let finish;
 class Delayed extends fake.Context{async decodeAudioData(buffer){await new Promise(resolve=>{finish=resolve;});return super.decodeAudioData(buffer);}}
 global.AudioContext=Delayed;const card=Runtime.create();
 try{await card.enable(true);card.sync(action(),1.1,true);await settle();card.stop();finish();await settle();assert.equal(fake.sources.length,0);assert.equal(card.state().voices,0);}
 finally{finish?.();await card.dispose();if(original===undefined)delete global.AudioContext;else global.AudioContext=original;}
});
test('Web Audio shares one context and decoded clip, seeks, pauses, switches and releases owned resources',async()=>{
 const original=global.AudioContext,fake=fakeAudio();global.AudioContext=fake.Context;const a=Runtime.create(),b=Runtime.create();
 try{
  assert.equal(a.state().context,'uninitialized');await a.enable(true);await b.enable(true);assert.equal(fake.contexts.length,1);
  a.sync(action(),1.2,true);b.sync(action(),1.2,true);await settle();assert.equal(fake.decodes,1);assert.equal(a.state().voices,1);assert.equal(b.state().voices,1);close(fake.sources[0].started.offset,.3);
  a.sync(action(),1.4,false);assert.equal(a.state().voices,0);a.sync(action(),1.4,true);assert.equal(a.state().voices,1);close(fake.sources.at(-1).started.offset,.5);
  a.sync(action(),1.1,true);close(fake.sources.at(-1).started.offset,.2);a.sync({...action(),id:'other'},1.2,true);assert.equal(a.state().voices,1);
  await a.dispose();assert.equal(a.state().sources,0);assert.equal(fake.contexts[0].state,'running');assert.equal(b.state().voices,1);
  await b.dispose();assert.equal(fake.contexts[0].state,'closed');assert.equal(b.state().decodedBytes,0);
 }finally{await a.dispose();await b.dispose();if(original===undefined)delete global.AudioContext;else global.AudioContext=original;}
});
test('global voice budget stays bounded across many cards and does not silence other cards on mute',async()=>{
 const original=global.AudioContext,fake=fakeAudio();global.AudioContext=fake.Context;const cards=Array.from({length:36},()=>Runtime.create());
 try{
  for(const card of cards){await card.enable(true);card.sync(action(),1.1,true);}await settle();assert.equal(fake.contexts.length,1);assert.equal(fake.decodes,1);
  assert.equal(cards.reduce((n,c)=>n+c.state().voices,0),32);
  await cards[0].enable(false);assert.equal(cards[1].state().voices,1);cards.at(-1).sync(action(),1.15,true);assert.equal(cards.at(-1).state().voices,1);
 }finally{for(const c of cards)await c.dispose();if(original===undefined)delete global.AudioContext;else global.AudioContext=original;}
});
test('late decode after disposal cannot start voices or resurrect a closed audio context',async()=>{
 const original=global.AudioContext,fake=fakeAudio();let finish;
 class Delayed extends fake.Context{async decodeAudioData(buffer){await new Promise(resolve=>{finish=resolve;});return super.decodeAudioData(buffer);}}
 global.AudioContext=Delayed;const card=Runtime.create();
 try{await card.enable(true);card.sync(action(),1.1,true);await settle();assert.equal(typeof finish,'function');await card.dispose();finish();await settle();assert.equal(fake.sources.length,0);assert.equal(card.state().voices,0);assert.equal(card.state().sources,0);assert.equal(fake.contexts[0].state,'closed');}
 finally{finish?.();await card.dispose();if(original===undefined)delete global.AudioContext;else global.AudioContext=original;}
});
test('concurrent decodes reserve the shared PCM budget before allocating and release reservations on cancellation',async()=>{
 const original=global.AudioContext,fake=fakeAudio(),waiters=[],cards=[];
 class Delayed extends fake.Context{async decodeAudioData(buffer){await new Promise(resolve=>waiters.push(resolve));return super.decodeAudioData(buffer);}}
 global.AudioContext=Delayed;
 const originalBytes=Buffer.from(M.pcm([new Float32Array(30*48000)],48000));
 try{
  for(let i=0;i<12;i++){
   const content=Buffer.from(originalBytes);content.writeInt16LE(i,44);
   const card=Runtime.create();cards.push(card);await card.enable(true);
   card.sync(action({duration:30,audioEvents:[event({src:'data:audio/wav;base64,'+content.toString('base64'),sourceDuration:30,at:0,duration:30,offset:0})]}),.1,true);
  }
  for(let attempt=0;attempt<100 && !cards.some(c=>c.state().error);attempt++)await settle();
  assert.equal(waiters.length,11);assert.match(cards.at(-1).state().error,/64 MiB/);
  assert.ok(cards.reduce((n,c)=>n+c.state().decodedBytes,0)<=64*1024*1024);
  for(const card of cards)await card.dispose();for(const finish of waiters)finish();await settle();
  assert.ok(cards.every(c=>c.state().voices===0 && c.state().decodedBytes===0));
 }finally{for(const finish of waiters)finish();for(const card of cards)await card.dispose();if(original===undefined)delete global.AudioContext;else global.AudioContext=original;}
});
