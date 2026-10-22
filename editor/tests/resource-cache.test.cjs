const test=require('node:test'),assert=require('node:assert/strict');
const {ResourceCache}=require('../dist/renderer/core/resource-cache.js');
const {rendererLocations}=require('../dist/electron/security.cjs');
const {encoder}=require('../dist/renderer/session-model.js');
const {snapshot}=require('../dist/renderer/core/document-snapshot.js');
const {prepare}=require('../dist/renderer/core/document-assets.js');

test('decoded resources deduplicate pending work and obey LRU and byte budgets',async()=>{
 let calls=0;
 const cache=new ResourceCache({load:async key=>{calls++;return key;},size:()=>4,maxEntries:2,maxBytes:8});
 const first=cache.get('a');assert.equal(cache.get('a'),first);await first;
 await cache.get('b');await cache.get('a');await cache.get('c');
 assert.equal(calls,3);assert.equal(cache.stats.bytes,8);assert.equal(cache.stats.entries,2);
 await cache.get('b');assert.equal(calls,4);
 const oversize=new ResourceCache({load:async()=>42,size:()=>100,maxEntries:2,maxBytes:8});
 assert.equal(await oversize.get('large'),42);assert.equal(oversize.stats.bytes,0);
 const keyed=new ResourceCache({load:async()=>1,size:()=>1,keyBytes:key=>key.length*2,maxEntries:2,maxBytes:4});
 await keyed.get('base64');assert.equal(keyed.stats.entries,0);
});

test('decode concurrency stays bounded and a rejected resource can be retried',async()=>{
 let active=0,peak=0;const releases=[];
 const cache=new ResourceCache({load:async key=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(resolve));active--;return key;},size:()=>1,maxEntries:8,maxBytes:8,concurrency:2});
 const values=Array.from({length:6},(_,i)=>cache.get(String(i)));
 assert.equal(cache.stats.active,2);assert.equal(cache.stats.queued,4);
 for(let i=0;i<3;i++){releases.splice(0).forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));}
 assert.deepEqual(await Promise.all(values),['0','1','2','3','4','5']);assert.equal(peak,2);
 let attempts=0;const retry=new ResourceCache({load:async()=>{if(!attempts++)throw Error('decode');return 1;},size:()=>1,maxEntries:1,maxBytes:1});
 await assert.rejects(retry.get('x'),/decode/);assert.equal(await retry.get('x'),1);
});

test('late decoding after clear cannot resurrect obsolete cached image references',async()=>{
 let release;const cache=new ResourceCache({load:()=>new Promise(resolve=>release=resolve),size:()=>4,maxEntries:2,maxBytes:8});
 const pending=cache.get('old');cache.clear();release(42);assert.equal(await pending,42);
 assert.equal(cache.stats.entries,0);assert.equal(cache.stats.bytes,0);
});

test('recovery hashing shares pixels, retries unacknowledged saves and supports undo after eviction',async()=>{
 const encode=encoder(),a='data:image/png;base64,AAA',b='data:image/png;base64,BBB';
 const first=await encode({a,also:a});assert.equal(Object.keys(first.blobs).length,1);
 assert.deepEqual(first.project.a,first.project.also);
 assert.equal(Object.keys((await encode({a})).blobs).length,1);first.ack();
 const second=await encode({a});assert.equal(Object.keys(second.blobs).length,0);second.ack();
 const next=await encode({b});next.ack();
 const undo=await encode({a});assert.equal(Object.keys(undo.blobs).length,1);
});

test('development origins remain loopback-only and production uses the app protocol',()=>{
 assert.deepEqual(rendererLocations(undefined),{editor:'atelier://app/index.html',splash:'atelier://app/splash.html'});
 assert.equal(rendererLocations('http://127.0.0.1:8770').editor,'http://127.0.0.1:8770/index.html');
 for(const value of ['https://example.com','file:///tmp/index.html','http://user:pass@localhost:8770','http://localhost.evil.test'])assert.throws(()=>rendererLocations(value));
});

test('undo snapshots isolate nested editable metadata and retain immutable image bytes',()=>{
 const src='data:image/png;base64,AAA',doc={schema:'card-atelier/1',name:'snapshot',width:1024,height:1536,effects:{paused:false},masks:{motion:src},characterRig:{bones:[{id:'arm',rotation:1}]},particles:{emitter:{angle:10}},layers:[{id:'art',name:'art',kind:'image',src,x:0,y:0,scale:1,opacity:1,spatial:{z:.1},titleArt:{variants:[{src,text:'old'}]}}]};
 const before=snapshot(doc);doc.characterRig.bones[0].rotation=2;doc.particles.emitter.angle=20;doc.layers[0].spatial.z=.2;doc.layers[0].titleArt.variants[0].text='new';doc.masks.motion='replacement';
 assert.equal(before.characterRig.bones[0].rotation,1);assert.equal(before.particles.emitter.angle,10);assert.equal(before.layers[0].spatial.z,.1);assert.equal(before.layers[0].titleArt.variants[0].text,'old');assert.equal(before.masks.motion,src);assert.equal(before.layers[0].src,src);
});

test('asset preflight rejects invalid images without mutating an imported document',async()=>{
 const doc={layers:[{id:'art',src:'art'}],masks:{motion:'motion'}};const before=structuredClone(doc);
 const options={imageFrom:async()=>({naturalWidth:1024,naturalHeight:1536}),fallbackBack:()=>'back',fallbackMask:()=>'foil',maskNames:{motion:'运动',foil:'盔甲'},progress(){}};
 const result=await prepare(doc,options);assert.equal(result.backSource,'back');assert.ok(result.prepared.has('mask:foil'));assert.deepEqual(doc,before);
 await assert.rejects(prepare(doc,{...options,imageFrom:async()=>({naturalWidth:10000,naturalHeight:10000})}),/16 MP/);assert.deepEqual(doc,before);
});
