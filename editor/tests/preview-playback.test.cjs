const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../renderer/runtime-model.js');

// Run the real renderer and RAF clock; only GPU/DOM facilities are replaced.
function harness(){
 const frames=new Map(),events=[],componentTimes=[];let sequence=0,now=0;
 const gl=new Proxy({createTexture:()=>({}),createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,getError:()=>0},{get:(o,k)=>k in o?o[k]:()=>{}});
 const makeCanvas=()=>({dataset:{},width:400,height:600,clientWidth:400,clientHeight:600,setAttribute(){},setPointerCapture(){},getContext:type=>type==='webgl'?null:{fillRect(){}}});
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,after(){},add(){},value:'idle',textContent:''});return nodes.get(id);};
 const document={body:{dataset:{appMode:'editor'}},hidden:false,createElement:makeCanvas,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
 const window={CardRuntime:R,CardBackRenderer:{create:()=>({draw(value,options){componentTimes.push(options.time);return {triangles:0,loaded:true};},dispose(){},reset(){}})},dispatchEvent:event=>events.push(event)};
 for(const [name,file] of Object.entries({MeshRigidity:'mesh-rigidity',CardFrame:'frame-model',CardParticleBatch:'particle-batch',CardMaskEdit:'mask-edit-model',CardSpatial:'spatial-model',CardCosmetics:'cosmetics-model',CardComponents:'component-model',CardStats:'card-stats',CardTitle:'title-model',CardPreviewUpdate:'preview-update-model',CardInspection:'inspection-model'}))window[name]=require('../renderer/'+file+'.js');
 const context={window,document,devicePixelRatio:1,performance:{now:()=>now},ResizeObserver:class{observe(){}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},requestAnimationFrame:callback=>{frames.set(++sequence,callback);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../renderer/author-preview.js'),'utf8'),context);
 const canvas=makeCanvas(),preview=window.CardSurfaceRenderer.create({canvas,gl});window.cardPreview=preview;
 const component=R.ensure({id:'frame-asset',previewMode:'authored',layers:[],masks:{},shader:{fragmentBody:'return color * (0.9 + 0.1 * sin(time));',fragmentStrength:1}});
 const doc=R.ensure({id:'hero',previewMode:'authored',layers:[{id:'frame',kind:'frame',visible:true}],masks:{},effects:{paused:false},componentScenes:{frame:{document:component}}});
 preview.setDocument(doc);preview.setActive(true);
 const advance=ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);};
 return {context,preview,doc,canvas,events,componentTimes,node,frames,advance};
}

test('changing neon aperture coverage updates only its aura; color and clock changes retain every frame mesh',()=>{
 const h=harness(),F=require('../renderer/frame-model.js');
 h.doc.componentScenes={};h.doc.frameStyle={...F.defaults,width:42,finish:'metal'};h.preview.setDocument(h.doc);h.advance(40);
 const before={...h.canvas.dataset},time=h.preview.getView().time;
 h.doc.frameStyle.finish='glow';h.preview.setDocument(h.doc);
 assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(before.resourceMeshes),1);
 assert.equal(h.canvas.dataset.resourceTextures,before.resourceTextures);assert.equal(h.canvas.dataset.resourceCompiles,before.resourceCompiles);assert.equal(h.preview.getView().time,time);
 const meshes=h.canvas.dataset.resourceMeshes;h.doc.frameStyle.color='#00ffff';h.preview.setDocument(h.doc);h.advance(40);assert.equal(h.canvas.dataset.resourceMeshes,meshes);
 h.doc.frameStyle.finish='metal';h.preview.setDocument(h.doc);assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(meshes),1);
 const restored=h.canvas.dataset.resourceMeshes;h.doc.frameStyle.width=43;h.preview.setDocument(h.doc);assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(restored),4);h.preview.dispose();
});

test('shared pause freezes active action and nested frame clocks, then resumes without resetting time',()=>{
 const h=harness();h.preview.playAction('idle');h.advance(40);h.advance(40);
 const before=h.preview.getView().time;assert.ok(before>0);assert.equal(h.componentTimes.at(-1),before);
 assert.equal(h.preview.setPaused(true),true);assert.equal(h.preview.getView().paused,true);assert.equal(h.doc.effects.paused,true);assert.equal(h.frames.size,0);
 h.advance(5000);assert.equal(h.preview.getView().time,before);assert.equal(h.componentTimes.at(-1),before);
 // Property refresh must not restart a paused action.
 h.preview.setDocument(h.doc);h.advance(100);assert.equal(h.preview.getView().time,before);
 h.preview.setPaused(false);assert.equal(h.preview.getView().time,before);h.advance(40);assert.ok(h.preview.getView().time>before);assert.equal(h.doc.effects.paused,false);assert.equal(h.componentTimes.at(-1),h.preview.getView().time);h.preview.dispose();
});

test('idle effects, paused seeks and action playback use the same pause state',()=>{
 const h=harness();h.advance(40);assert.ok(h.preview.getView().time>0);
 h.preview.setPaused(true);h.preview.setTime(2);h.advance(400);assert.equal(h.preview.getView().time,2);assert.equal(h.componentTimes.at(-1),2);
 h.preview.playAction('idle',2,false);assert.equal(h.doc.effects.paused,false);h.advance(40);assert.ok(h.preview.getView().time>2);
 h.preview.playAction('idle',1,true);assert.equal(h.doc.effects.paused,true);h.advance(400);assert.equal(h.preview.getView().time,1);h.preview.stopAction();h.advance(400);assert.equal(h.preview.getView().time,1);h.preview.dispose();
});

test('editor main control and scrub pause an action after closing its timeline',()=>{
 const h=harness();Object.assign(h.context,{doc:h.doc,$:h.node,syncPreview:()=>h.preview.setDocument(h.doc)});h.context.window.atelierAnimation={isOpen:()=>false};
 const source=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8');
 vm.runInContext(source.match(/^\$\('toggle-play'\)\.onclick=.*$/m)[0]+'\n'+source.match(/^function seekPreviewEffects\(seconds\).*$/m)[0],h.context);
 h.preview.playAction('idle');h.advance(40);h.node('toggle-play').onclick();const time=h.preview.getView().time;h.advance(400);assert.equal(h.preview.getView().time,time);assert.equal(h.doc.effects.paused,true);
 h.node('toggle-play').onclick();h.advance(40);assert.ok(h.preview.getView().time>time);
 vm.runInContext('seekPreviewEffects(3)',h.context);h.advance(400);assert.equal(h.preview.getView().time,3);assert.equal(h.node('toggle-play').textContent,'播放');h.preview.dispose();
});

test('exported player pauses and resumes auto entrance and explicitly selected actions',async()=>{
 const h=harness(),actions=[R.entryPreset('left','arrival'),...h.doc.actions];
 Object.assign(h.context,{CardRuntime:R,CardTitle:h.context.window.CardTitle,Option:class{},fetch:async path=>({json:async()=>path==='manifest.json'?{...h.doc,foregroundMesh:null,masks:[]}:path==='actions.json'?actions:[],text:async()=>''})});
 await vm.runInContext(fs.readFileSync(require.resolve('../renderer/player.js'),'utf8'),h.context);assert.equal(h.context.document.body.dataset.error,undefined);
 for(const explicit of [false,true]){
  if(explicit){h.node('player-action').value='idle';h.node('player-play').onclick();}
  h.advance(40);const before=h.preview.getView().time;h.node('player-pause').onclick();assert.equal(h.node('player-pause').textContent,'播放');h.advance(1000);assert.equal(h.preview.getView().time,before);
  h.node('player-pause').onclick();assert.equal(h.node('player-pause').textContent,'暂停');h.advance(40);assert.ok(h.preview.getView().time>before);
 }
 h.preview.dispose();
});

test('exported one-shot waits for slow image loading and can replay after becoming empty',async()=>{
 const h=harness(),M=require('../renderer/cosmetics-model.js'),images=[];
 const doc={...h.doc,componentScenes:{},particles:M.particlePreset('trails'),foregroundMesh:null,masks:[],layers:[{id:'slow-image',kind:'image',visible:true,asset:'slow.png',x:0,y:0,scale:1,opacity:1}]};
 Object.assign(h.context,{CardRuntime:R,CardTitle:h.context.window.CardTitle,Option:class{},Image:class{constructor(){this.width=4;this.height=4;}set src(value){images.push(()=>this.onload());}},fetch:async path=>({json:async()=>path==='manifest.json'?doc:path==='actions.json'?doc.actions:[],text:async()=>''})});
 const loading=vm.runInContext(fs.readFileSync(require.resolve('../renderer/player.js'),'utf8'),h.context);
 for(let i=0;i<20&&!images.length;i++)await Promise.resolve();
 assert.equal(images.length,1);assert.equal(h.preview.getView().paused,true);h.advance(5000);assert.equal(h.preview.getView().time,0);
 images[0]();await loading;assert.equal(h.context.document.body.dataset.error,undefined);assert.equal(h.context.document.body.dataset.ready,'true');assert.equal(h.node('player-reveal').hidden,false);
 assert.equal(h.preview.getView().time,0);assert.equal(h.preview.getView().paused,false);assert.equal(h.canvas.dataset.particleRevealCount,String(doc.particles.reveal.count));
 for(let i=0;i<50;i++)h.advance(40);assert.equal(h.canvas.dataset.particleCount,'0');
 h.node('player-pause').onclick();h.node('player-reveal').onclick();assert.equal(h.canvas.dataset.particleCount,String(doc.particles.reveal.count));assert.equal(h.preview.getView().paused,false);assert.equal(h.node('player-pause').textContent,'暂停');
 h.node('player-pause').onclick();const time=h.preview.getView().time;h.advance(5000);assert.equal(h.preview.getView().time,time);h.preview.dispose();
});
