const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../renderer/runtime-model.js');

// Run the real renderer and RAF clock; only GPU/DOM facilities are replaced.
function harness(){
 const listeners=new Map();const frames=new Map(),events=[],componentTimes=[],componentZooms=[],viewports=[];let sequence=0,now=0;
 const gl=new Proxy({viewport:(...args)=>viewports.push(args),createTexture:()=>({}),createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,getError:()=>0},{get:(o,k)=>k in o?o[k]:()=>{}});
 const makeCanvas=()=>({dataset:{},width:400,height:600,clientWidth:400,clientHeight:600,setAttribute(){},setPointerCapture(){},getContext:type=>type==='webgl'?null:{fillRect(){}}});
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{id,after(){},add(){},value:'idle',textContent:''});return nodes.get(id);};
 const document={body:{dataset:{appMode:'editor'}},hidden:false,createElement:makeCanvas,getElementById:node,querySelectorAll:()=>[],addEventListener(){}};
 const window={CardRuntime:R,CardBackRenderer:{create:()=>({draw(value,options){componentTimes.push(options.time);componentZooms.push(options.viewportZoom);return {triangles:0,loaded:true};},dispose(){},reset(){}})},addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},dispatchEvent:event=>{events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);}};
 for(const [name,file] of Object.entries({MeshRigidity:'mesh-rigidity',CardFrame:'frame-model',CardParticleBatch:'particle-batch',CardMaskEdit:'mask-edit-model',CardSpatial:'spatial-model',CardCosmetics:'cosmetics-model',CardComponents:'component-model',CardStats:'card-stats',CardTitle:'title-model',CardPreviewUpdate:'preview-update-model',CardInspection:'inspection-model',CardExportProfile:'export-profile',CardAdaptiveTextures:'adaptive-textures'}))window[name]=require('../renderer/'+file+'.js');
 const context={window,document,CardExportProfile:window.CardExportProfile,CardAdaptiveTextures:window.CardAdaptiveTextures,innerWidth:400,innerHeight:700,devicePixelRatio:1,performance:{now:()=>now},ResizeObserver:class{observe(){}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},requestAnimationFrame:callback=>{frames.set(++sequence,callback);return sequence;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../renderer/author-preview.js'),'utf8'),context);
 const canvas=makeCanvas(),preview=window.CardSurfaceRenderer.create({canvas,gl});window.cardPreview=preview;
 const component=R.ensure({id:'frame-asset',previewMode:'authored',layers:[],masks:{},shader:{fragmentBody:'return color * (0.9 + 0.1 * sin(time));',fragmentStrength:1}});
 const doc=R.ensure({id:'hero',previewMode:'authored',layers:[{id:'frame',kind:'frame',visible:true}],masks:{},effects:{paused:false},componentScenes:{frame:{document:component}}});
 preview.setDocument(doc);preview.setActive(true);
 const advance=ms=>{now+=ms;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(now);};
 return {context,preview,doc,canvas,events,componentTimes,componentZooms,viewports,node,frames,advance};
}

test('native character idle runs without unrelated effects and freezes the same pose after multiple loops',()=>{
 const h=harness(),doc=require('./fixtures/character-animation.cjs').fixture();
 doc.effects.paused=false;h.preview.setDocument(doc);h.preview.stopAction();
 h.advance(100);const first=h.canvas.dataset.characterPose;h.advance(100);assert.notEqual(h.canvas.dataset.characterPose,first);
 h.preview.playAction('idle',9.2,false);const before=h.canvas.dataset.characterPose;
 h.preview.setPaused(true);assert.equal(h.canvas.dataset.characterPose,before);h.advance(100);assert.equal(h.canvas.dataset.characterPose,before);
 h.preview.setPaused(false);h.advance(100);assert.notEqual(h.canvas.dataset.characterPose,before);
 h.preview.playAction('idle',4,true);const endpoint=JSON.parse(h.canvas.dataset.characterPose).find(b=>b.id==='elbow');assert.ok(Math.abs(endpoint.matrix[1])<1e-10);
});

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

test('editor transport starts, pauses and seeks the selected action with its timeline closed',()=>{
 const h=harness();Object.assign(h.context,{doc:h.doc,$:h.node,syncPreview:()=>h.preview.setDocument(h.doc)});h.context.window.atelierAnimation={isOpen:()=>false,context:()=>({action:h.doc.actions[0]}),play(){const v=h.preview.getView();if(v.actionId)h.preview.setPaused(!v.paused);else h.preview.playAction('idle');},seek(seconds){h.preview.playAction('idle',seconds,true);}};
 const source=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8');
 vm.runInContext(source.match(/^\$\('toggle-play'\)\.onclick=.*$/m)[0]+'\n'+source.match(/^function seekPreviewEffects\(seconds\).*$/m)[0],h.context);
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
 vm.runInContext(fs.readFileSync(require.resolve('../renderer/animation-panel.js'),'utf8').match(/^function close\(\).*$/m)[0],h.context);
 h.preview.playAction('idle',1,false);vm.runInContext('close()',h.context);assert.equal(h.preview.getView().paused,false);assert.equal(h.preview.getView().actionId,'idle');h.advance(40);assert.ok(h.preview.getView().time>1);assert.equal(h.node('animation-timeline').hidden,true);
 draft={};vm.runInContext('close()',h.context);assert.equal(draft,null);assert.equal(h.preview.getView().paused,true);assert.equal(h.preview.getView().time,1);h.preview.dispose();
});

test('opening the timeline preserves an unrecorded character pose and a running preview clock',()=>{
 const h=harness(),doc=require('./fixtures/character-animation.cjs').fixture(),C=require('../renderer/character-animation-model.js');h.preview.setDocument(doc);
 let draft=C.keyframe(doc.actions[0],'elbow','rotation',.6,35);
 h.context.window.atelierCharacterRig={draftAction:()=>draft,resetPose(){draft=null;}};
 h.context.document.body.classList={remove(){}};h.node('animation-open').classList={add(){}};h.node('animation-open').setAttribute=()=>{};
 Object.assign(h.context,{$:h.node,opened:false,playing:false,seconds:.6,actionId:'idle',draftAction:null,valueDraft:false,state:{busy:false},selectedAction:()=>doc.actions[0],refresh(){},updateTime(){},status(){},host:{state:()=>({document:doc}),fit(){},previewAction(id,time,paused,pose){h.preview.playAction(id,time,paused,pose);return true;}},workspace:{ensurePreview(){},enableEffectsPreview(){},syncLayout(){},panel(){vm.runInContext('open(false)',h.context);}}});
 const source=fs.readFileSync(require.resolve('../renderer/animation-panel.js'),'utf8');vm.runInContext(source.match(/^function open\(showPanel=true\).*$/m)[0]+'\n'+source.match(/^function seek\(value\).*$/m)[0],h.context);
 h.preview.playAction('idle',.6,true,draft);const pose=h.canvas.dataset.characterPose;vm.runInContext('open()',h.context);
 assert.ok(draft);assert.equal(h.canvas.dataset.characterPose,pose);assert.equal(h.preview.getView().actionSeconds,.6);assert.equal(h.node('animation-timeline').hidden,false);
 draft=null;h.context.playing=true;h.preview.playAction('idle',.6,false);vm.runInContext('open()',h.context);assert.equal(h.preview.getView().paused,false);h.advance(40);assert.ok(h.preview.getView().actionSeconds>.6);h.preview.dispose();
});

test('enabling preview effects cannot replace a requested seek or restart with feedback from the previous frame',()=>{
 const h=harness(),source=fs.readFileSync(require.resolve('../renderer/animation-panel.js'),'utf8');let rendered;
 Object.assign(h.context,{seconds:4,playing:false,valueDraft:false,draftAction:null,actionId:'idle',state:{busy:false},selectedAction:()=>({id:'idle',name:'Idle',duration:4,loop:false}),status(){},updateTime(){},host:{previewAction(id,time,paused){rendered={id,time,paused};return true;}},workspace:{enableEffectsPreview(){h.context.seconds=4;}},window:h.context.window});
 vm.runInContext(source.match(/^function seek\(value\).*$/m)[0]+'\n'+source.match(/^function play\(\).*$/m)[0],h.context);
 vm.runInContext('seek(1.8)',h.context);assert.equal(rendered.time,1.8);assert.equal(rendered.paused,true);
 h.context.seconds=4;vm.runInContext('play()',h.context);assert.equal(rendered.time,0);assert.equal(rendered.paused,false);h.preview.dispose();
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


test('zoom detail waits for a complete texture batch without rebuilding skin meshes or changing the animation clock',()=>{
 const h=harness(),d=require('./fixtures/character-animation.cjs').fixture(),P=require('../renderer/export-profile.js');d.exportProfile={settings:P.config({preset:'mobile-list'}),textures:{}};h.preview.setDocument(d);h.preview.playAction('idle',.6,true);h.preview.setTextureDetail('small');h.preview.setZoom(.25);const pose=h.canvas.dataset.characterPose,meshes=h.canvas.dataset.resourceMeshes,seconds=h.preview.getView().actionSeconds;h.preview.setZoom(3);assert.equal(h.canvas.dataset.detailRequested,'large');assert.equal(h.canvas.dataset.detailLevel,'small');h.preview.setTextureDetail('large');assert.equal(h.canvas.dataset.detailLevel,'large');assert.equal(h.canvas.dataset.detailMaterials,'true');assert.equal(h.canvas.dataset.characterPose,pose);assert.equal(h.preview.getView().actionSeconds,seconds);assert.equal(h.canvas.dataset.resourceMeshes,meshes);h.preview.dispose();
});
