const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../dist/renderer/runtime-model.js');
const {extractFunction}=require('./fixtures/source-node.cjs');
// Read complete functions from the actual built panel, independent of formatting.
function panelFunctions(...names){
 const source=fs.readFileSync(require.resolve('../dist/renderer/animation-panel.js'),'utf8');
 return names.map(name=>extractFunction(source,name)).join('\n');
}

// Run the real renderer and RAF clock; only GPU/DOM facilities are replaced.
function harness(options={}){
 const listeners=new Map(),documentListeners=new Map(),observers=[];const frames=new Map(),events=[],componentTimes=[],componentZooms=[],viewports=[];let sequence=0,now=0;
 const gl=new Proxy({viewport:(...args)=>viewports.push(args),createTexture:()=>({}),createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,getError:()=>0},{get:(o,k)=>k in o?o[k]:()=>{}});
 const makeCanvas=()=>({dataset:{},width:400,height:600,clientWidth:400,clientHeight:600,setAttribute(){},setPointerCapture(){},getContext:type=>type==='webgl'?null:{fillRect(){}}});
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,after(){},add(){},value:'idle',textContent:''});return nodes.get(id);};
 const document={body:{dataset:{appMode:'editor'}},hidden:false,createElement:makeCanvas,getElementById:node,querySelectorAll:()=>[],addEventListener(name,fn){if(!documentListeners.has(name))documentListeners.set(name,new Set());documentListeners.get(name).add(fn);},removeEventListener(name,fn){documentListeners.get(name)?.delete(fn);}};
 const window={CardRuntime:R,CardBackRenderer:{create:()=>({draw(value,options){componentTimes.push(options.time);componentZooms.push(options.viewportZoom);return {triangles:0,loaded:true};},dispose(){},reset(){}})},addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);}};
 for(const [name,file] of Object.entries({CardCharacterAnimation:'character-animation-model',MeshRigidity:'mesh-rigidity',CardContourFieldRenderer:'contour-field-renderer',CardFrame:'frame-model',CardParticleWorld:'particle-world-model',CardParticleBatch:'particle-batch',CardMaskEdit:'mask-edit-model',CardSpatial:'spatial-model',CardCharacterEffects:'character-effects',CardCosmetics:'cosmetics-model',CardComponents:'component-model',CardLaserFoil:'laser-foil',CardStats:'card-stats',CardTitle:'title-model',CardPreviewUpdate:'preview-update-model',CardInspection:'inspection-model',CardExportProfile:'export-profile',CardPlayerModel:'player-model',CardAdaptiveTextures:'adaptive-textures'}))window[name]=require('../dist/renderer/'+file+'.js');
 const context={window,bindings:window,document,CardExportProfile:window.CardExportProfile,CardAdaptiveTextures:window.CardAdaptiveTextures,innerWidth:400,innerHeight:700,devicePixelRatio:1,performance:{now:()=>now},ResizeObserver:class{constructor(){this.disconnected=0;observers.push(this);}observe(){}disconnect(){this.disconnected++;}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},requestAnimationFrame:callback=>{frames.set(++sequence,callback);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 window.CardSourceAlphaBounds=require('../dist/renderer/source-alpha-bounds.js');window.CardActionAudioRuntime=options.audioRuntime||require('../dist/renderer/action-audio-runtime.js');window.CardShaderVariants=require('../dist/renderer/shader-variants.js');window.CardLazyPreview=require('../dist/renderer/lazy-preview.js');vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer/player-textures.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer/author-preview.js'),'utf8'),context);
 const canvas=makeCanvas(),preview=window.CardSurfaceRenderer.create({canvas,gl,...options});window.cardPreview=preview;
 const component=R.ensure({id:'frame-asset',previewMode:'authored',layers:[],masks:{},shader:{fragmentBody:'return color * (0.9 + 0.1 * sin(time));',fragmentStrength:1}});
 const doc=R.ensure({id:'hero',previewMode:'authored',layers:[{id:'frame',kind:'frame',visible:true}],masks:{},effects:{paused:false},componentScenes:{frame:{document:component}}});
 preview.setDocument(doc);preview.setActive(true);
 const advance=ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);};
 return {context,preview,doc,canvas,events,componentTimes,componentZooms,viewports,node,frames,advance,gl,documentListeners,observers};
}

test('disposing an interactive preview disconnects its observers, document listener and pointer handlers',()=>{
 const h=harness();h.preview.playAction('idle',0,false);
 assert.equal(h.documentListeners.get('visibilitychange').size,1);assert.ok(h.canvas.onpointerdown);assert.ok(h.frames.size>0);
 h.preview.dispose();h.preview.dispose();
 assert.equal(h.documentListeners.get('visibilitychange').size,0);assert.equal(h.observers[0].disconnected,1);assert.equal(h.frames.size,0);
 for(const key of ['onpointerdown','onpointermove','onpointerup','onpointercancel'])assert.equal(h.canvas[key],null);
});
test('asset reset clears audio ownership while changing particle birth poses does not reset audio',()=>{
 const Audio=require('../dist/renderer/action-audio-runtime.js');let resets=0;
 const h=harness({audioRuntime:{create(){const audio=Audio.create(),reset=audio.reset;audio.reset=()=>{resets++;reset();};return audio;}}});
 const C=require('../dist/renderer/component-model.js');const d=structuredClone(h.doc);
 d.actions[0].particleEvents=[{id:'card-sparks',name:'Sparks',at:0,duration:1,simulationSpace:'card',particles:C.particles({enabled:true,count:8})}];
 const before=resets;h.preview.setDocument(d);h.preview.playAction(d.actions[0].id,.2,false);assert.equal(resets,before);
 h.preview.resetAssets();assert.equal(resets,before+1);h.preview.dispose();
});

test('embedded scene draws avoid synchronous GPU error queries unless diagnostics are explicitly requested',()=>{
 const h=harness({embedded:true});let queries=0;h.gl.getError=()=>{queries++;return 0;};
 for(let i=0;i<8;i++)h.preview.drawExternal({angle:[0,0],root:[0,0,0,1],time:i*.1,width:400,height:600});
 assert.equal(queries,0);assert.equal(h.canvas.dataset.glError,'unchecked');
 h.canvas.dataset.gpuDiagnostics='true';h.preview.drawExternal({angle:[0,0],root:[0,0,0,1],width:400,height:600});
 assert.equal(queries,1);assert.equal(h.canvas.dataset.glError,'0');h.preview.dispose();
});

test('late asset completions cannot allocate GPU storage or retain a scene after disposal',()=>{
 const h=harness();h.preview.dispose();let allocations=0;
 h.gl.createTexture=()=>{allocations++;return {};};h.gl.createProgram=()=>{allocations++;return {};};h.gl.createBuffer=()=>{allocations++;return {};};
 const pixels={width:2,height:2,data:new Uint8ClampedArray(16)};
 h.preview.setTexture('late-image',pixels);h.preview.addImage({id:'late-layer',kind:'image'},pixels);
 h.preview.updateMask('emission',pixels);h.preview.setRegion({mode:'mask',map:pixels});h.preview.resetAssets();
 assert.throws(()=>h.preview.setDocument(h.doc),/disposed/);
 assert.throws(()=>h.preview.compileShader({fragmentBody:'return color;'}),/disposed/);
 assert.equal(allocations,0);assert.deepEqual(Object.keys(h.preview.getCharacterGeometry()),[]);
});

test('animated painter order reaches the renderer without rebuilding meshes or textures',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular();h.preview.setDocument(d);
 h.preview.playAction('idle',.9,true);const before={...h.canvas.dataset},a=JSON.parse(before.drawOrder);
 h.preview.playAction('idle',1,true);const b=JSON.parse(h.canvas.dataset.drawOrder);
 assert.ok(a.indexOf('body')<a.indexOf('forearm'));assert.ok(b.indexOf('body')>b.indexOf('forearm'));
 assert.equal(h.canvas.dataset.resourceMeshes,before.resourceMeshes);assert.equal(h.canvas.dataset.resourceTextures,before.resourceTextures);
 h.preview.playAction('idle',.1,true);assert.deepEqual(JSON.parse(h.canvas.dataset.drawOrder),a);h.preview.dispose();
});
test('simultaneous action PNG particles decode once per source, replay deterministically and release textures',()=>{
 const h=harness(),pending=[],created=[],deleted=[];
 h.context.Image=class{constructor(){this.width=8;this.height=8;}set src(value){this._src=value;pending.push(this);}get src(){return this._src;}};
 h.gl.createTexture=()=>{const value={sprite:created.length};created.push(value);return value;};h.gl.deleteTexture=texture=>deleted.push(texture);
 const C=require('../dist/renderer/component-model.js'),d=structuredClone(h.doc);
 d.actions[0].particleEvents=['sprite-a.png','sprite-b.png'].map((sprite,i)=>({id:'sprite-'+i,name:'Sprite '+i,at:0,duration:3,particles:C.particles({enabled:true,count:8,visual:'sprite',sprite,emitter:{target:'card',shape:'point',u:.5,v:.5}})}));
 h.preview.setDocument(d);h.preview.playAction(d.actions[0].id,1,true);
 assert.equal(pending.length,2);for(const image of pending)image.onload();
 assert.equal(created.length,2);assert.equal(h.canvas.dataset.particleEventParticles,'16');
 assert.ok(Number(h.canvas.dataset.particleCount)>=16);assert.ok(Number(h.canvas.dataset.particleTotalCount)<=128);
 h.canvas.dataset.particleDiagnostics='true';h.preview.playAction(d.actions[0].id,1,true);const samples=h.canvas.dataset.particleEventSamples;
 h.preview.playAction(d.actions[0].id,2,true);h.preview.playAction(d.actions[0].id,1,true);
 assert.equal(h.canvas.dataset.particleEventSamples,samples);assert.equal(pending.length,2);assert.equal(created.length,2);
 h.preview.dispose();for(const texture of created)assert.equal(deleted.filter(t=>t===texture).length,1);
});
test('card-space birth poses are reused during paused inspection and invalidated by bone edits',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular(),C=require('../dist/renderer/component-model.js');
 d.actions[0].boneTracks={elbow:{rotation:[{at:0,value:0},{at:1,value:90}]}};
 d.actions[0].particleEvents=[{id:'trail',name:'Trail',at:0,duration:1.8,boneId:'elbow',simulationSpace:'card',particles:C.particles({enabled:true,count:24,lifetime:.5,emitter:{target:'card',shape:'point',u:.6,v:.6}})}];
 const original=R.sampleCharacter;let births=0;
 R.sampleCharacter=(doc,action,...args)=>{if(action?.id==='idle'&&action.particleEvents===undefined){births++;assert.equal(action.deformTracks,undefined);assert.equal(action.expressionTracks,undefined);}return original(doc,action,...args);};
 try {
  h.canvas.dataset.particleDiagnostics='true';h.preview.setDocument(d);h.preview.playAction('idle',1,true);
  const before=births,points=h.canvas.dataset.particleEventSamples;assert.ok(before>0);
  h.preview.pose(12,8);h.preview.pose(0,0);h.preview.playAction('idle',1,true);
  assert.equal(births,before,'inspection and repeated paused draws reuse birth transforms');
  assert.equal(h.canvas.dataset.particleEventSamples,points);
  d.actions[0].boneTracks.elbow.rotation[1].value=140;h.preview.setDocument(d);h.preview.playAction('idle',1,true);
  assert.ok(births>before,'editing the bone track invalidates cached transforms');
  assert.notEqual(h.canvas.dataset.particleEventSamples,points);
 } finally {R.sampleCharacter=original;h.preview.dispose();}
});
test('action crossfade starts at the current pose, pauses, interrupts continuously and completes short clips',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular();d.actions[0].transitionDuration=.4;d.actions[1].duration=.1;
 h.preview.setDocument(d);h.preview.playAction('idle',.3,true);const start=h.canvas.dataset.characterPose;
 h.preview.playAction('raise');assert.equal(h.canvas.dataset.characterPose,start);assert.equal(h.canvas.dataset.actionTransition,'0');
 h.advance(100);h.advance(100);const halfway=h.canvas.dataset.characterPose;assert.notEqual(halfway,start);
 h.preview.setPaused(true);h.advance(100);assert.equal(h.canvas.dataset.characterPose,halfway);
 h.preview.playAction('idle');assert.equal(h.canvas.dataset.characterPose,halfway);assert.equal(h.canvas.dataset.actionTransition,'0');
 for(let i=0;i<7;i++)h.advance(100);assert.equal(h.canvas.dataset.actionTransition,'1');
 h.preview.playAction('raise');for(let i=0;i<7;i++)h.advance(100);assert.equal(h.canvas.dataset.actionTransition,'1');assert.equal(h.preview.getView().paused,true);
 h.preview.playAction('idle',.5,true);assert.equal(h.canvas.dataset.actionTransition,'1');h.preview.dispose();
});

test('editor document synchronization preserves a running transition while a new revision cancels it',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular();h.preview.setDocument(d);h.preview.playAction('idle',.2,true);const before=h.canvas.dataset.characterPose;
 h.preview.playAction('raise');h.preview.setDocument(structuredClone(d));assert.equal(h.canvas.dataset.characterPose,before);assert.equal(h.canvas.dataset.actionTransition,'0');
 h.advance(100);h.advance(100);assert.notEqual(h.canvas.dataset.characterPose,before);
 d.revision=1;h.preview.setDocument(d);assert.equal(h.canvas.dataset.actionTransition,'1');h.preview.dispose();
});

test('native character idle runs without unrelated effects and freezes the same pose after multiple loops',()=>{
 const h=harness(),doc=require('./fixtures/character-animation.cjs').fixture();
 doc.effects.paused=false;h.preview.setDocument(doc);h.preview.stopAction();
 h.advance(100);const first=h.canvas.dataset.characterPose;h.advance(100);assert.notEqual(h.canvas.dataset.characterPose,first);
 h.preview.playAction('idle',9.2,false);const before=h.canvas.dataset.characterPose;
 h.preview.setPaused(true);assert.equal(h.canvas.dataset.characterPose,before);h.advance(100);assert.equal(h.canvas.dataset.characterPose,before);
 h.preview.setPaused(false);h.advance(100);assert.notEqual(h.canvas.dataset.characterPose,before);
 h.preview.playAction('idle',4,true);const endpoint=JSON.parse(h.canvas.dataset.characterPose).find(b=>b.id==='elbow');assert.ok(Math.abs(endpoint.matrix[1])<1e-10);
});

test('finish changes specialize the shader and update the aura; color and clock changes retain the program and meshes',()=>{
 const h=harness(),F=require('../dist/renderer/frame-model.js');
 h.doc.componentScenes={};h.doc.frameStyle={...F.defaults,width:42,finish:'metal'};h.preview.setDocument(h.doc);h.advance(40);
 const before={...h.canvas.dataset},time=h.preview.getView().time;
 h.doc.frameStyle.finish='glow';h.preview.setDocument(h.doc);
 assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(before.resourceMeshes),1);
 assert.equal(h.canvas.dataset.resourceTextures,before.resourceTextures);assert.equal(Number(h.canvas.dataset.resourceCompiles),Number(before.resourceCompiles)+1);assert.equal(h.preview.getView().time,time);
 const meshes=h.canvas.dataset.resourceMeshes,compiles=h.canvas.dataset.resourceCompiles;h.doc.frameStyle.color='#00ffff';h.preview.setDocument(h.doc);h.advance(40);assert.equal(h.canvas.dataset.resourceMeshes,meshes);assert.equal(h.canvas.dataset.resourceCompiles,compiles);
 h.doc.frameStyle.finish='metal';h.preview.setDocument(h.doc);assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(meshes),1);
 assert.equal(h.canvas.dataset.resourceCompiles,compiles,'returning to a cached finish must not compile again');
 const restored=h.canvas.dataset.resourceMeshes;h.doc.frameStyle.width=43;h.preview.setDocument(h.doc);assert.equal(Number(h.canvas.dataset.resourceMeshes)-Number(restored),4);h.preview.dispose();
});

test('document preflight compiles the resolved finish once and a failed preflight preserves the current view',()=>{
 const h=harness();h.advance(40);
 const next=structuredClone(h.doc);next.id='next-preview';next.cosmetics={level:'common'};
 const view=h.preview.getView(),before=h.canvas.dataset.resourceCompiles;
 h.gl.getShaderParameter=()=>false;
 assert.throws(()=>h.preview.compileShader(next.shader,next),/Shader/);
 assert.equal(h.canvas.dataset.resourceCompiles,before);assert.deepEqual(h.preview.getView(),view);
 h.gl.getShaderParameter=()=>true;
 h.preview.compileShader(next.shader,next);const compiled=h.canvas.dataset.resourceCompiles;
 assert.equal(Number(compiled),Number(before)+1);
 h.preview.setDocument(next);assert.equal(h.canvas.dataset.resourceCompiles,compiled);
 h.preview.dispose();
});

test('finish program cache is bounded, reuses recent programs and releases evicted programs once',()=>{
 const h=harness(),F=require('../dist/renderer/frame-model.js'),deleted=[];
 h.doc.componentScenes={};h.gl.deleteProgram=program=>deleted.push(program);
 const set=finish=>{h.doc.frameStyle={...F.defaults,finish};h.preview.setDocument(h.doc);};
 for(const finish of ['flat','glow','cosmic','distressed','web','candy'])set(finish);
 assert.equal(deleted.length,3,'seven finish programs retain at most four');
 const compiled=Number(h.canvas.dataset.resourceCompiles);set('metal');assert.equal(Number(h.canvas.dataset.resourceCompiles),compiled+1);
 set('candy');assert.equal(Number(h.canvas.dataset.resourceCompiles),compiled+1,'the recent finish is reused');
 h.preview.dispose();assert.equal(deleted.length,9);assert.equal(new Set(deleted).size,deleted.length);
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

test('editor transport starts, pauses and seeks the selected action with its timeline closed',()=>{
 const h=harness();Object.assign(h.context,{doc:h.doc,$:h.node,syncPreview:()=>h.preview.setDocument(h.doc)});h.context.window.atelierAnimation={isOpen:()=>false,context:()=>({action:h.doc.actions[0]}),play(){const v=h.preview.getView();if(v.actionId)h.preview.setPaused(!v.paused);else h.preview.playAction('idle');},seek(seconds){h.preview.playAction('idle',seconds,true);}};
 h.context.window.CardDOM={element:h.node};const source=fs.readFileSync(require.resolve('../dist/renderer/app.js'),'utf8');
 const {extractFunction,extractAssignment}=require('./fixtures/source-node.cjs');
 vm.runInContext(extractAssignment(source,"window.CardDOM.element('toggle-play').onclick")+'\n'+extractFunction(source,'seekPreviewEffects'),h.context);
 h.node('toggle-play').onclick();assert.equal(h.preview.getView().actionId,'idle');h.advance(40);h.node('toggle-play').onclick();const time=h.preview.getView().time;h.advance(400);assert.equal(h.preview.getView().time,time);assert.equal(h.doc.effects.paused,true);
 h.node('toggle-play').onclick();h.advance(40);assert.ok(h.preview.getView().time>time);
 vm.runInContext('seekPreviewEffects(3)',h.context);h.advance(400);assert.equal(h.preview.getView().time,3);assert.equal(h.preview.getView().paused,true);h.preview.dispose();
});

test('preview zoom scales every surface about the viewport center without changing authored data or time',()=>{
 const h=harness();h.preview.playAction('idle',1.25,true);const before=JSON.stringify(h.doc);
 assert.deepEqual(h.viewports.at(-1),[0,0,400,600]);h.preview.setZoom(2);
 assert.deepEqual(h.viewports.at(-1),[-200,-300,800,1200]);assert.equal(h.componentZooms.at(-1),2);assert.equal(h.preview.getView().time,1.25);assert.equal(JSON.stringify(h.doc),before);
 h.preview.pose(180);assert.equal(h.canvas.dataset.action,'idle');assert.equal(h.canvas.dataset.actionSeconds,'1.250');h.preview.setZoom(.001);assert.equal(h.preview.getZoom(),.25);assert.deepEqual(h.viewports.at(-1),[150,225,100,150]);
 h.preview.setZoom(99);assert.equal(h.preview.getZoom(),3);h.preview.setZoom(NaN);assert.equal(h.preview.getZoom(),1);assert.deepEqual(h.viewports.at(-1),[0,0,400,600]);h.preview.dispose();
});

test('changing preview angles and dragging preserves a running or paused character action without an open timeline',()=>{
 const h=harness(),doc=require('./fixtures/character-animation.cjs').fixture();h.preview.setDocument(doc);h.context.window.atelierAnimation={isOpen:()=>false};
 for(const paused of [true,false]){h.preview.playAction('idle',.6,paused);const before=h.canvas.dataset.characterPose;h.preview.pose(90,10);assert.equal(h.canvas.dataset.characterPose,before);assert.equal(h.preview.getView().actionSeconds,.6);assert.equal(h.preview.getView().paused,paused);
  h.canvas.onpointerdown({button:0,clientX:10,clientY:10,pointerId:1});h.canvas.onpointermove({buttons:1,clientX:60,clientY:40});h.canvas.onpointerup();assert.equal(h.canvas.dataset.characterPose,before);assert.equal(h.preview.getView().paused,paused);h.advance(40);if(!paused)assert.notEqual(h.canvas.dataset.characterPose,before);else assert.equal(h.canvas.dataset.characterPose,before);
 }h.preview.dispose();
});

test('closing the animation timeline keeps the preview playing and discards only temporary pose drafts',()=>{
 const h=harness();let draft=null;h.context.window.atelierCharacterRig={draftAction:()=>draft,resetPose(){draft=null;}};
 Object.assign(h.context,{opened:true,draftAction:null,playing:true,actionId:'idle',seconds:1,host:{fit(){},setAnimationFeedback(){},previewAction:(...args)=>h.preview.playAction(...args)},$:h.node});h.node('animation-open').classList={remove(){}};h.node('animation-open').setAttribute=()=>{};
 vm.runInContext(panelFunctions('close'),h.context);
 h.preview.playAction('idle',1,false);vm.runInContext('close()',h.context);assert.equal(h.preview.getView().paused,false);assert.equal(h.preview.getView().actionId,'idle');h.advance(40);assert.ok(h.preview.getView().time>1);assert.equal(h.node('animation-timeline').hidden,true);
 draft={};vm.runInContext('close()',h.context);assert.equal(draft,null);assert.equal(h.preview.getView().paused,true);assert.equal(h.preview.getView().time,1);h.preview.dispose();
});

test('opening the timeline preserves an unrecorded character pose and a running preview clock',()=>{
 const h=harness(),doc=require('./fixtures/character-animation.cjs').fixture(),C=require('../dist/renderer/character-animation-model.js');h.preview.setDocument(doc);
 let draft=C.keyframe(doc.actions[0],'elbow','rotation',.6,35);
 h.context.window.atelierCharacterRig={draftAction:()=>draft,resetPose(){draft=null;}};
 h.context.document.body.classList={remove(){}};h.node('animation-open').classList={add(){}};h.node('animation-open').setAttribute=()=>{};
 Object.assign(h.context,{$:h.node,opened:false,playing:false,seconds:.6,actionId:'idle',draftAction:null,valueDraft:false,state:{busy:false},selectedAction:()=>doc.actions[0],refresh(){},updateTime(){},status(){},host:{state:()=>({document:doc}),fit(){},previewAction(id,time,paused,pose){h.preview.playAction(id,time,paused,pose);return true;}},workspace:{ensurePreview(){},enableEffectsPreview(){},syncLayout(){},panel(){vm.runInContext('open(false)',h.context);}}});
 const source=fs.readFileSync(require.resolve('../dist/renderer/animation-panel.js'),'utf8');vm.runInContext(panelFunctions('open','seek'),h.context);
 h.preview.playAction('idle',.6,true,draft);const pose=h.canvas.dataset.characterPose;vm.runInContext('open()',h.context);
 assert.ok(draft);assert.equal(h.canvas.dataset.characterPose,pose);assert.equal(h.preview.getView().actionSeconds,.6);assert.equal(h.node('animation-timeline').hidden,false);
 draft=null;h.context.playing=true;h.preview.playAction('idle',.6,false);vm.runInContext('open()',h.context);assert.equal(h.preview.getView().paused,false);h.advance(40);assert.ok(h.preview.getView().actionSeconds>.6);h.preview.dispose();
});

test('enabling preview effects cannot replace a requested seek or restart with feedback from the previous frame',()=>{
 const h=harness(),source=fs.readFileSync(require.resolve('../dist/renderer/animation-panel.js'),'utf8');let rendered;
 Object.assign(h.context,{seconds:4,playing:false,valueDraft:false,draftAction:null,actionId:'idle',state:{busy:false},selectedAction:()=>({id:'idle',name:'Idle',duration:4,loop:false}),status(){},updateTime(){},host:{previewAction(id,time,paused){rendered={id,time,paused};return true;}},workspace:{enableEffectsPreview(){h.context.seconds=4;}},window:h.context.window});
 vm.runInContext(panelFunctions('seek','play'),h.context);
 vm.runInContext('seek(1.8)',h.context);assert.equal(rendered.time,1.8);assert.equal(rendered.paused,true);
 h.context.seconds=4;vm.runInContext('play()',h.context);assert.equal(rendered.time,0);assert.equal(rendered.paused,false);h.preview.dispose();
});

test('exported player pauses and resumes auto entrance and explicitly selected actions',async()=>{
 const h=harness(),actions=[R.entryPreset('left','arrival'),...h.doc.actions];
 Object.assign(h.context,{CardRuntime:R,CardTitle:h.context.window.CardTitle,Option:class{},fetch:async path=>({json:async()=>path==='manifest.json'?{...h.doc,schema:'card-atelier-assets/1',name:'Player test',width:1024,height:1536,layers:h.doc.layers.map(l=>({x:0,y:0,scale:1,opacity:1,name:l.id,...l})),foregroundMesh:null,masks:[]}:path==='actions.json'?actions:[],text:async()=>''})});
 await vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer/player.js'),'utf8'),h.context);assert.equal(h.context.document.body.dataset.error,undefined);
 for(const explicit of [false,true]){
  if(explicit){h.node('player-action').value='idle';h.node('player-play').onclick();}
  h.advance(40);const before=h.preview.getView().time;h.node('player-pause').onclick();assert.equal(h.node('player-pause').textContent,'播放');h.advance(1000);assert.equal(h.preview.getView().time,before);
  h.node('player-pause').onclick();assert.equal(h.node('player-pause').textContent,'暂停');h.advance(40);assert.ok(h.preview.getView().time>before);
 }
 h.preview.dispose();
});

test('exported one-shot waits for slow image loading and can replay after becoming empty',async()=>{
 const h=harness(),M=require('../dist/renderer/cosmetics-model.js'),images=[];
 const doc={...h.doc,schema:'card-atelier-assets/1',name:'Player reveal',width:1024,height:1536,componentScenes:{},particles:M.particlePreset('trails'),foregroundMesh:null,masks:[],layers:[{id:'slow-image',name:'Slow image',kind:'image',visible:true,asset:'slow.png',x:0,y:0,scale:1,opacity:1}]};
 Object.assign(h.context,{CardRuntime:R,CardTitle:h.context.window.CardTitle,Option:class{},Image:class{constructor(){this.width=4;this.height=4;}set src(value){images.push(()=>this.onload());}},fetch:async path=>({json:async()=>path==='manifest.json'?doc:path==='actions.json'?doc.actions:[],text:async()=>''})});
 const loading=vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer/player.js'),'utf8'),h.context);
 for(let i=0;i<20&&!images.length;i++)await Promise.resolve();
 assert.equal(images.length,1);assert.equal(h.preview.getView().paused,true);h.advance(5000);assert.equal(h.preview.getView().time,0);
 images[0]();await loading;assert.equal(h.context.document.body.dataset.error,undefined);assert.equal(h.context.document.body.dataset.ready,'true');assert.equal(h.node('player-reveal').hidden,false);
 assert.equal(h.preview.getView().time,0);assert.equal(h.preview.getView().paused,false);assert.equal(h.canvas.dataset.particleRevealCount,String(doc.particles.reveal.count));
 for(let i=0;i<50;i++)h.advance(40);assert.equal(h.canvas.dataset.particleCount,'0');
 h.node('player-pause').onclick();h.node('player-reveal').onclick();assert.equal(h.canvas.dataset.particleCount,String(doc.particles.reveal.count));assert.equal(h.preview.getView().paused,false);assert.equal(h.node('player-pause').textContent,'暂停');
 h.node('player-pause').onclick();const time=h.preview.getView().time;h.advance(5000);assert.equal(h.preview.getView().time,time);h.preview.dispose();
});


test('zoom detail waits for a complete texture batch without rebuilding skin meshes or changing the animation clock',()=>{
 const h=harness(),d=require('./fixtures/character-animation.cjs').fixture(),P=require('../dist/renderer/export-profile.js');d.exportProfile={settings:P.config({preset:'mobile-list'}),textures:{}};h.preview.setDocument(d);h.preview.playAction('idle',.6,true);h.preview.setTextureDetail('small');h.preview.setZoom(.25);const pose=h.canvas.dataset.characterPose,meshes=h.canvas.dataset.resourceMeshes,seconds=h.preview.getView().actionSeconds;h.preview.setZoom(3);assert.equal(h.canvas.dataset.detailRequested,'large');assert.equal(h.canvas.dataset.detailLevel,'small');h.preview.setTextureDetail('large');assert.equal(h.canvas.dataset.detailLevel,'large');assert.equal(h.canvas.dataset.detailMaterials,'true');assert.equal(h.canvas.dataset.characterPose,pose);assert.equal(h.preview.getView().actionSeconds,seconds);assert.equal(h.canvas.dataset.resourceMeshes,meshes);h.preview.dispose();
});


test('remote sprite dependencies load only with a particle-enabled detail tier and keep the clock',async()=>{
 const h=harness(),M=require('../dist/renderer/cosmetics-model.js'),P=require('../dist/renderer/export-profile.js'),resolved=[];
 const doc={...h.doc,schema:'card-atelier-assets/1',name:'Remote sprites',width:1024,height:1536,componentScenes:{},layers:h.doc.layers.map(l=>({x:0,y:0,scale:1,opacity:1,name:l.id,...l})),particles:M.particlePreset('trails'),foregroundMesh:null,masks:[],exportProfile:{schema:'card-export-profile/1',settings:P.config({preset:'mobile-list'}),textures:{}}};
 doc.particles={...doc.particles,visual:'sprite',sprite:'@asset:sprite-id'};
 h.context.window.CardRemoteAssets={create:()=>({open:async()=>{},close(){},loadCard:async()=>({manifest:doc,actions:doc.actions,slots:[],vertex:'',fragment:''}),resolve:async src=>{resolved.push(src);return 'https://cdn.example/sprite.png';}})};
 Object.assign(h.context,{URL,URLSearchParams,location:{href:'https://game.example/index.html',search:'?catalog=https://cdn.example/catalog.json&card=card'},Option:class{},Image:class{constructor(){this.width=this.height=4;}set src(value){this.currentSrc=value;queueMicrotask(()=>this.onload());}get src(){return this.currentSrc;}}});
 await vm.runInContext(fs.readFileSync(require.resolve('../dist/renderer/player.js'),'utf8'),h.context);
 assert.equal(h.context.document.body.dataset.error,undefined);
 assert.deepEqual(resolved,[],'small tier must not download a disabled particle asset');
 h.advance(40);const time=h.preview.getView().time;h.node('player-zoom').value='300';h.node('player-zoom').oninput();
 for(let i=0;i<60&&h.context.document.body.dataset.textureLevel!=='large';i++)await new Promise(setImmediate);
 assert.deepEqual(resolved,['@asset:sprite-id']);assert.equal(h.context.document.body.dataset.textureLevel,'large');
 assert.equal(h.canvas.dataset.particleSpriteState,'ready');assert.equal(h.preview.getView().time,time);assert.equal(h.preview.getView().paused,false);
 h.preview.dispose();
});

test('connected ribbon renderer uploads one joined strip and ignores ordinary cosmic passes, then follows the motion toggle',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular(),C=require('../dist/renderer/component-model.js');
 d.actions[0].boneTracks={elbow:{rotation:[{at:0,value:0},{at:1,value:90}]}};
 d.actions[0].particleEvents=[{id:'ribbon',name:'Ribbon',at:0,duration:1.8,boneId:'elbow',trail:{duration:.4,segments:16},particles:C.particles({enabled:true,visual:'cosmic',palette:'rainbow',placement:'behind',emitter:{target:'card',shape:'point',u:.6,v:.6}})}];
 let program,particleProgram;const draws=[],visuals=[];
 h.gl.useProgram=p=>{program=p;};h.gl.uniform1f=(name,value)=>{if(name==='visual'){particleProgram=program;visuals.push(value);}};h.gl.drawArrays=(_,first,count)=>{if(program===particleProgram)draws.push(count);};
 h.canvas.dataset.particleDiagnostics='true';h.preview.setDocument(d);draws.length=visuals.length=0;h.preview.playAction('idle',1,true);
 const mesh=JSON.parse(h.canvas.dataset.particleTrailVertices).ribbon;
 assert.equal(mesh.length,16*60);assert.equal(h.canvas.dataset.particleEventParticles,'16');
 assert.deepEqual(draws,[16*6]);assert.deepEqual(visuals,[3]);
 const original=h.canvas.dataset.particleEventSamples;
 h.preview.playAction('idle',.5,true);h.preview.playAction('idle',1,true);assert.equal(h.canvas.dataset.particleEventSamples,original);
 h.preview.setPreviewLevel('common');h.preview.playAction('idle',1,true);
 const points=JSON.parse(h.canvas.dataset.particleEventSamples).ribbon;
 assert.equal(points.length,17*7);
 for(let i=1;i<17;i++){assert.equal(points[i*7],points[0]);assert.equal(points[i*7+1],points[1]);}
 h.preview.setPreviewLevel('authored');h.preview.playAction('idle',1,true);
 assert.equal(h.canvas.dataset.particleEventSamples,original);
 h.preview.dispose();
});

test('raw player sources specialize the active rim while still compiling the supplied files',()=>{
 const h=harness(),F=require('../dist/renderer/frame-model.js');h.doc.componentScenes={};h.doc.frameStyle={...F.defaults,finish:'metal'};h.preview.setDocument(h.doc);
 const sources=[];h.gl.shaderSource=(_,source)=>sources.push(source);
 const supplied='// supplied shader asset, distinct from the cached program\n'+R.fragment;
 assert.ok(supplied.includes('vec4 rimHalloweenStickers('));
 assert.equal(h.preview.compileSources(R.vertex(R.defaults.shader.geometryBody),supplied).ok,true);
 assert.equal(sources.length,2,'source assets cannot reuse a different generated program');
 assert.ok(sources[1].includes('// supplied shader asset'));
 assert.ok(!sources[1].includes('vec4 rimHalloweenStickers('),'unused rim branches must not reach the driver');
 h.preview.dispose();
});

test('raw shaders that explicitly use another rim finish keep their full helper semantics',()=>{
 const h=harness(),sources=[];h.gl.shaderSource=(_,source)=>sources.push(source);
 const body='return vec4(rimColor(color.rgb,vec3(1.),uv,vec2(0.),time,vec4(.02,.04,.02,.005),2.,vec2(0.),.75),color.a);';
 const supplied=R.fragmentSource(body,true);
 assert.equal(h.preview.compileSources(R.vertex(R.defaults.shader.geometryBody),supplied).ok,true);
 assert.equal(sources.at(-1),supplied);h.preview.dispose();
});


test('world events bypass the current card root and retain paused pixels through inspection and custom sampler changes',()=>{
 const h=harness(),d=require('./fixtures/irregular-card.cjs').irregular(),C=require('../dist/renderer/component-model.js');
 d.actions[0].tracks={x:[{at:0,value:0},{at:1,value:256}],yaw:[{at:0,value:0},{at:1,value:30}],opacity:[{at:0,value:1},{at:1,value:.2}]};
 d.actions[0].particleEvents=[{id:'world',name:'World',at:0,duration:1.8,simulationSpace:'world',particles:C.particles({enabled:true,count:8,lifetime:.6,placement:'front',emitter:{target:'card',shape:'point',u:.6,v:.6}})}];
 const uniforms=[];for(const kind of ['uniform1f','uniform2f','uniform4f'])h.gl[kind]=(...args)=>uniforms.push(args);
 h.canvas.dataset.particleDiagnostics='true';h.preview.setDocument(d);h.preview.pose(0,0);h.preview.playAction('idle',.9,true);
 const before=h.canvas.dataset.particleEventSamples;assert.ok(JSON.parse(before).world.length>0);
 h.preview.pose(90,45);assert.equal(h.canvas.dataset.particleEventSamples,before);
 assert.deepEqual(uniforms.filter(a=>a[0]==='rootTransform').at(-1),['rootTransform',0,0,0,1]);
 assert.deepEqual(uniforms.filter(a=>a[0]==='angle').at(-1),['angle',0,0]);
 assert.deepEqual(uniforms.filter(a=>a[0]==='rootOpacity').at(-1),['rootOpacity',1]);
 h.preview.setParticleWorldSampler(()=>({angle:[0,0],root:[4,0,0,1,1]}));assert.notEqual(h.canvas.dataset.particleEventSamples,before);
 h.preview.setParticleWorldSampler(null);assert.equal(h.canvas.dataset.particleEventSamples,before);
 h.preview.playAction('idle',5.2,false);const playing=h.canvas.dataset.particleEventSamples;h.preview.setPaused(true);
 assert.equal(h.canvas.dataset.particleEventSamples,playing,'loop pause preserves the world birth cycle');h.preview.dispose();
});


test('embedded world emitters interpolate live game roots and preserve recorded positions through reverse seeks',()=>{
 const h=harness({embedded:true}),d=require('./fixtures/irregular-card.cjs').irregular(),C=require('../dist/renderer/component-model.js');
 const particles=C.particles({enabled:true,count:8,lifetime:12,speed:0,spread:0,radius:0,z:0,placement:'front',emitter:{target:'card',shape:'point',u:.6,v:.6}});
 d.actions[0].particleEvents=[{id:'world',name:'World',at:0,duration:1.8,simulationSpace:'world',particles}];
 h.canvas.dataset.particleDiagnostics='true';h.preview.setDocument(d);
 const draw=(time,x,sampler)=>{h.preview.drawExternal({time,angle:[0,0],root:[x,0,0,1,1],width:400,height:600,sampleParticleWorld:sampler});return JSON.parse(h.canvas.dataset.particleEventSamples).world;};
 draw(0,2);draw(.3,4);const before=draw(.6,6);assert.ok(before.length>0);
 for(let i=0;i<before.length/7;i++){const birth=C.particleBirth(particles,i,.6);assert.ok(Math.abs(before[i*7]-(2.1+birth*20/3))<1e-6);}
 assert.deepEqual(draw(.6,20),before,'paused external transforms leave old particles in place');
 draw(.3,30);assert.deepEqual(draw(.6,30),before,'recorded game history survives a reverse seek');
 const calls=[];const sampled=draw(.6,30,(id,t)=>{calls.push([id,t]);return {angle:[0,0],root:[t*3,0,0,1,1]};});
 assert.ok(calls.length>0);assert.notDeepEqual(sampled,before);assert.ok(calls.every(([id,t])=>id==='idle'&&t>=0&&t<=.6));h.preview.dispose();
});
