const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{gunzipSync}=require('node:zlib');
const {createServices}=require('../dist/electron/services.cjs'),W=require('../dist/renderer/workshop-model.js'),P=require('../dist/renderer/export-profile.js'),Audio=require('../dist/renderer/action-audio-model.js'),Remote=require('../dist/renderer/remote-assets.js'),{fixture}=require('./fixtures/character-animation.cjs');
test('audio survives workshop persistence and local, native, remote and offline delivery with shared bytes',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'card-audio-')),services=createServices({runtimeDir:temp});
 try{
  const bytes=Buffer.from(Audio.pcm([new Float32Array(24000).fill(.25)],48000));
  const d=fixture();d.actions[0].audioEvents=[{id:'sound',name:'Sound',src:'data:audio/wav;base64,'+bytes.toString('base64'),sourceDuration:.5,at:0,duration:.5,offset:0,volume:.5,playbackRate:1,loop:false,enabled:true}];d.exportSettings=P.config({preset:'mobile-list',remoteDelivery:true});
  let w=W.create(d,'audio-workshop','one');w=W.duplicate(w,'two');
  const encoded=await W.encode(w);assert.deepEqual(require('../dist/electron/workshop-storage.cjs').unpack(encoded).cards[0].document.actions[0].audioEvents,d.actions[0].audioEvents);
  const outputs=Object.fromEntries(w.cards.map(c=>[c.id,{front:d.layers[0].src}]));
  const result=await services.invoke('export-workshop',{workshop:encoded,outputs});
  const one=JSON.parse(await fs.readFile(path.join(result.directory,'cards','one','actions.json'))),two=JSON.parse(await fs.readFile(path.join(result.directory,'cards','two','actions.json')));
  assert.equal(one[0].audioEvents[0].src,two[0].audioEvents[0].src);assert.match(one[0].audioEvents[0].src,/^\.\.\/\.\.\/shared\//);
  assert.deepEqual(await fs.readFile(path.resolve(result.directory,'cards/one',one[0].audioEvents[0].src)),bytes);
  const resource=await fs.readFile(path.join(result.directory,'godot/library.tres'),'utf8');assert.match(resource,/type="AudioStream"/);assert.match(resource,/audio_streams =/);
  const root=path.join(result.directory,'remote'),catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json')));
  const object=async id=>{const m=catalog.objects[id],b=await fs.readFile(path.join(root,m.path));return m.compression==='gzip'?gunzipSync(b):b;};
  for(const card of catalog.cards){
    const native=JSON.parse(await object(card.godot.definition)),ids=Object.values(native.audioObjects);assert.equal(ids.length,1);assert.ok(card.godot.base.includes(ids[0]));assert.deepEqual(await object(ids[0]),bytes);assert.equal(catalog.objects[ids[0]].mime,'audio/wav');
  }
  let online=true,requests=0;const cache=Remote.memoryCache(),network=async url=>{requests++;if(!online)throw Error('offline');return new Response(await fs.readFile(path.join(root,new URL(url).pathname.slice(1))));};
  const client=Remote.create({fetcher:network,cache,retries:0});await client.open('https://audio.example/catalog.json');const loaded=await client.loadCard('one');const cue=loaded.actions[0].audioEvents[0];assert.match(cue.src,/^blob:/);const url=await client.resolve(cue.src);assert.match(url,/^blob:/);assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()),bytes);const before=requests;await client.loadCard('two');assert.ok(requests-before<catalog.cards[1].webgl.base.length);client.close();
  online=false;const offline=Remote.create({fetcher:network,cache,retries:0});await offline.open('https://audio.example/catalog.json');const saved=await offline.loadCard('one');assert.deepEqual(Buffer.from(await (await fetch(saved.actions[0].audioEvents[0].src)).arrayBuffer()),bytes);offline.close();
 }finally{services.close();await fs.rm(temp,{recursive:true,force:true});}
});
