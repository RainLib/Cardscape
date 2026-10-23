const {test}=require('node:test'),assert=require('node:assert/strict');
const Variants=require('../dist/renderer/shader-variants.js');
const Runtime=require('../dist/renderer/runtime-core.js');
const Raster=require('../dist/renderer/frame-raster.js');
const {createLazyPreview}=require('../dist/renderer/lazy-preview.js');
const {createMaskAssets}=require('../dist/renderer/core/mask-assets.js');
const {createBlankDocument}=require('../dist/renderer/document-factory.js');

test('finish variants remove unreachable effects and preserve user hook code and non-frame helpers',()=>{
 const prelude='vec4 userHook(vec2 uv){return sampleSource(uv);}',body='return userHook(uv) * color;';
 const full=Runtime.fragmentSource(body,true,prelude);
 for(let finish=0;finish<25;finish++){
  const variant=Variants.frameFragment(full,finish);
  assert.ok(variant.includes(prelude));assert.ok(variant.includes(body));
  assert.ok(variant.includes('vec4 sampleSource('));
  assert.ok(variant.length<full.length*.65);
  assert.ok(Raster.fragmentSource(finish).length<Raster.fragmentSource().length);
 }
 const flat=Variants.frameFragment(full,0);
 assert.ok(!flat.includes('vec4 rimHalloweenStickers('));
 assert.ok(!flat.includes('vec4 rimNeonSign('));
 assert.ok(!flat.includes('vec4 rimChain('));
 assert.ok(Variants.frameFragment(full,24).includes('vec4 rimHalloweenStickers('));
 for(const invalid of [-1,25,NaN,1.5])assert.equal(Variants.frameFragment(full,invalid),full);
 assert.equal(Variants.frameFragment('void main(){}',0),'void main(){}');
 const custom=Runtime.fragmentSource('return vec4(rimCoverage(uv, frameMetrics, 12.));',true);
 assert.equal(Variants.frameFragment(custom,0),custom);
 const alias=Runtime.fragmentSource('return color;',true,'#define CUSTOM_RIM rimColor');
 assert.equal(Variants.frameFragment(alias,0),alias);
 const helper=Runtime.fragmentSource('return color;',true,'#define CUSTOM_ICON rimHalloweenCandy');
 assert.ok(Variants.frameFragment(helper,0).includes('vec3 rimHalloweenCandy('));
});

test('home and layout operations do not create a preview; first document operation replays settings once',()=>{
 const calls=[];let created=0;
 const api=new Proxy({},{get:(_,key)=>(...args)=>{calls.push([key,...args]);if(key==='getView')return{yaw:15,pitch:0};if(key==='getZoom')return 2;}});
 const lazy=createLazyPreview(()=>{created++;return api;});
 lazy.setActive(true);lazy.setEffectsEnabled(false);lazy.setZoom(2);
 assert.equal(lazy.getView().yaw,0);assert.equal(lazy.getZoom(),2);assert.deepEqual(lazy.getCharacterGeometry(),{});assert.equal(created,0);
 let wrapped=0;const original=lazy.setDocument;lazy.setDocument=function(doc){wrapped++;return original(doc);};
 const doc={id:'one'};lazy.setDocument(doc);assert.equal(wrapped,1);
 assert.equal(created,1);assert.deepEqual(calls.slice(0,4),[['setActive',true],['setEffectsEnabled',false],['setZoom',2],['setDocument',doc]]);
 lazy.setDocument({id:'two'});assert.equal(created,1);assert.equal(lazy.getView().yaw,15);
 lazy.dispose();lazy.dispose();assert.equal(calls.filter(c=>c[0]==='dispose').length,1);
 assert.throws(()=>lazy.setDocument(doc),/disposed/);
 let never=0;const unused=createLazyPreview(()=>{never++;return api;});unused.dispose();assert.equal(never,0);
});

test('mask overlays allocate on first use, reuse the same surfaces and reflect edits before display',async()=>{
 const previous=global.document;let canvases=0,overlays=0,puts=0;
 global.document={createElement(){canvases++;return{getContext(){return{drawImage(){},getImageData(){const data=new Uint8ClampedArray(1024*1536*4);data[0]=100;return{data};},createImageData(w,h){overlays++;return{data:new Uint8ClampedArray(w*h*4)};},putImageData(){puts++;}};}};}};
 try{
  const changed=[],assets=createMaskAssets(async()=>({naturalWidth:1024,naturalHeight:1536}),(id,pixels)=>changed.push([id,pixels]));
  await assets.registerMask('motion','embedded');await assets.registerMask('emission','embedded');
  assert.equal(canvases,2);assert.equal(overlays,0);assert.equal(puts,0);assert.equal(changed.length,2);
  const mask=assets.masks.get('motion');mask.pixels.data[0]=200;
  const pixels=mask.overlayPixels;assert.equal(pixels.data[3],130);assert.deepEqual([...pixels.data.slice(0,3)],[78,214,187]);
  assert.equal(canvases,3);assert.equal(overlays,1);assert.ok(mask.overlay);assert.ok(mask.overlayCtx);assert.equal(mask.overlayPixels,pixels);assert.equal(overlays,1);
 }finally{global.document=previous;}
});

test('blank masks encode each distinct solid color once and keep coverage independent',async()=>{
 const previous=global.document;let encodes=0;
 global.document={createElement(){let fill='transparent';return{getContext(){return{set fillStyle(value){fill=value;},fillRect(){}};},toDataURL(){encodes++;return'data:image/png;base64,'+Buffer.from(fill).toString('base64');}};}};
 try{const doc=await createBlankDocument('blank',{mesh:async()=>Runtime.grid(1),textStyle:()=>({})});assert.equal(encodes,4);assert.equal(doc.masks.motion,doc.masks.foil);assert.notEqual(doc.masks.coverage,doc.masks.motion);const old=doc.masks.motion;doc.masks.foil='changed';assert.equal(doc.masks.motion,old);}finally{global.document=previous;}
});
