// GPU verification rejects engine/shader errors even when a script prints "passed".
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
async function main(){
 const args=process.argv.slice(2),read=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
 const project=read('--project'),script=read('--script')||'tests/test_sdk.gd',output=read('--output'),timeout=Number(read('--timeout')||45000),captureDir=read('--captures');
 if(!project||!Number.isFinite(timeout)||timeout<1000||timeout>1200000)throw Error('Usage: npm run test:sdk -- --project EXPORTED_GODOT_DIR [--script tests/test_sdk.gd] [--output LOG_FILE] [--timeout 45000 (max 1200000 for explicit long benchmarks)]');
 if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
 if(script.replace(/^res:\/\//,'')==='tests/test_shader_emission.gd'){
  const C=require('../dist/renderer/component-model.js');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const resource=await fs.readFile(path.join(path.resolve(project),'library.tres'),'utf8'),encoded=/^data_json = (.+)$/m.exec(resource),catalog=JSON.parse(JSON.parse(encoded[1])),doc=catalog.cards.find(c=>c.id===catalog.activeCardId);
  const config=C.particles({enabled:true,count:12,visual:'orb',speed:0,spread:0,lifetime:3,size:.08,z:.25,placement:'surface',blend:'normal',emitter:{target:'back',shape:'point',u:.35,v:.4,side:'both'}});
  const scenes=[];for(const target of ['back','card'])for(const [yaw,pitch] of [[0,0],[90,0],[180,0],[-35,15],[180,20]]){
   const value=C.particles({...config,emitter:{...config.emitter,target}}),samples=new Float64Array(256*7),count=C.sampleInto(value,1.4,doc,yaw*Math.PI/180,samples);
   scenes.push({id:target+'-'+yaw+'-'+pitch,yaw,pitch,config:value,count,samples:Array.from(samples.slice(0,count*7)),...(pitch===0&&yaw!==90?{visible:target==='back'?yaw===180:yaw===0}:{})});
  }
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/shader-emission-reference.json'),JSON.stringify({config,scenes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_frame_neon.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),F=require('../dist/renderer/frame-model.js');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const recipes=['blue','red','white','yellow','green','purple'].map(color=>{const e=K.find('frame-neon-'+color);return {id:e.id,style:e.recipe,geometry:F.geometry(e.recipe)};});
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/neon-reference.json'),JSON.stringify({recipes}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_surface_reference.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),C=require('../dist/renderer/component-model.js'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const ids=['material-circuits','material-frosted','material-wakandanglass','material-rainbow-rays',...K.entries.filter(e=>e.id.endsWith('-rays')&&!['material-rays','material-rainbow-rays'].includes(e.id)).map(e=>e.id),'material-prism-replacement'];
  const requested=read('--recipe');if(requested&&!ids.includes(requested))throw Error('Unknown surface reference recipe: '+requested);
  const recipes=(requested?[requested]:ids).map(id=>{const e=K.find(id);return {id,recipe:e.recipe,styleIndex:C.materialStyles.indexOf(e.recipe.style)};});
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/surface-reference.json'),JSON.stringify({recipes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_connective_finish.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const recipes=K.entries.filter(e=>e.id.startsWith('material-symbiote-')).map(e=>({id:e.id,recipe:e.recipe}));
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/finish-reference.json'),JSON.stringify({recipes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_frame_detail.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),F=require('../dist/renderer/frame-model.js'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const recipes=['frame-chains-silver','frame-glyphs-green','frame-refraction-rainbow','frame-overloaded','frame-distressed-grey','frame-distressed-purple','frame-distressed-pink','frame-distressed-orange','frame-distressed-gold','frame-distressed-green','frame-distressed-blue','frame-distressed-red','frame-distressed-copper','frame-distressed-rainbow','frame-neon-nights','frame-pax-2025','frame-brains','frame-candy-halloween','frame-halloween-stickers'].map(id=>{const e=K.find(id);return {id,style:e.recipe,geometry:F.geometry(e.recipe),styleIndex:F.finishes.indexOf(e.recipe.finish),aura:F.hasAura(e.recipe),dynamic:['glyphs','refraction','neonnights','pax','brains','halloween-stickers'].includes(e.recipe.finish)};});
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/frame-detail-reference.json'),JSON.stringify({recipes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_frame_web.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const recipes=K.entries.filter(e=>e.kind==='frame'&&e.id.startsWith('frame-web-')).map(e=>({id:e.id,style:e.recipe}));
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/web-reference.json'),JSON.stringify({recipes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_frame_fire.gd'){
  const K=require('../dist/renderer/finish-catalog.js'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const recipes=K.entries.filter(e=>e.kind==='frame'&&e.id.startsWith('frame-fire')).map(e=>({id:e.id,style:e.recipe}));
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/fire-reference.json'),JSON.stringify({recipes,...(captureDir?{captureDirectory:path.resolve(captureDir)}:{})}));
 }
 if(script.replace(/^res:\/\//,'')==='tests/test_particle_reveal.gd'){
  const C=require('../dist/renderer/component-model.js'),M=require('../dist/renderer/cosmetics-model.js'),config=M.particlePreset('glimmer'),captureDir=read('--captures');
  if(captureDir)await fs.mkdir(path.resolve(captureDir),{recursive:true});
  const frames=[0,.09,.3,100].map(time=>{const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(config,time,{layers:[]},0,samples,visuals,128,time);return {time,age:time,count,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir&&[0,.3].includes(time)?{capture:path.resolve(captureDir,time===0?'reveal.png':'idle.png')}:{})};});
  for(const shape of ['rect','ellipse','point'])for(const radius of [0,.065,.2]){
   const value=C.particles({...config,radius,emitter:C.emitter({target:'card',shape,u:.3,v:.4,width:.2,height:.25,direction:'angle',angle:70,side:'front'})});
   const time=100,samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count))});
  }
  for(const shape of ['perimeter','ellipse','point'])for(const time of [0,.7,1.4,100,86400]){
   const value=C.particles({...M.particlePreset('krackle'),emitter:C.emitter({target:'card',shape,u:shape==='perimeter'?.5:.3,v:shape==='perimeter'?.5:.4,width:shape==='perimeter'?1:.2,height:shape==='perimeter'?1:.25,side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir&&shape==='perimeter'&&time===.7?{capture:path.resolve(captureDir,'krackle.png')}:{})});
  }
  for(const shape of ['perimeter','ellipse','point'])for(const time of [0,.7,100]){
   const value=C.particles({...M.particlePreset('cosmic'),emitter:C.emitter({target:'card',shape,u:shape==='perimeter'?.5:.3,v:shape==='perimeter'?.5:.4,width:shape==='perimeter'?1:.2,height:shape==='perimeter'?1:.25,direction:shape==='ellipse'?'up':'outward',side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir&&shape==='perimeter'&&time===.7?{capture:path.resolve(captureDir,'cosmic.png')}:{})});
  }
  for(const shape of ['perimeter','ellipse','point'])for(const time of [0,.7,100]){
   const value=C.particles({...M.particlePreset('wakanda'),emitter:C.emitter({target:'card',shape,u:shape==='perimeter'?.5:.3,v:shape==='perimeter'?.5:.4,width:shape==='perimeter'?1:.2,height:shape==='perimeter'?1:.25,side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir&&shape==='perimeter'&&time===.7?{capture:path.resolve(captureDir,'wakanda.png')}:{})});
  }
  for(const id of ['flowers','paws','pizza','adamantium','bubbles','bananas','diamond','trails'])for(const shape of ['perimeter','ellipse','point'])for(const time of [0,.7,100,86400]){
   const value=C.particles({...M.particlePreset(id),emitter:C.emitter({target:'card',shape,u:shape==='perimeter'?.5:.3,v:shape==='perimeter'?.5:.4,width:shape==='perimeter'?1:.2,height:shape==='perimeter'?1:.25,side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir&&shape==='perimeter'&&time===.7?{capture:path.resolve(captureDir,id+'.png')}:{})});
  }
  for(const id of ['bubbles','bananas','diamond'])for(const radius of [0,.07,.2])for(const direction of ['up','angle'])for(const time of [0,.7,100]){
   const value=C.particles({...M.particlePreset(id),radius,emitter:C.emitter({target:'card',shape:'perimeter',direction,angle:90,side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count))});
  }
  for(const id of ['diamond','trails'])for(const time of [.2,.699,.7,1.399,1.4])for(const speed of [0,.055]){
   const value=C.particles({...M.particlePreset(id),speed}),samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count))});
  }
  for(const stagger of [0,.5,.8])for(const shape of ['rect','ellipse','point'])for(const time of [0,.15,.64,.8,.96,1.1,1.599,1.6]){
   const base=M.particlePreset('trails'),value=C.particles({...base,reveal:{...base.reveal,stagger},emitter:C.emitter({target:'card',shape,u:.3,v:.4,width:.2,height:.25,side:'front'})});
   const samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count))});
  }
  for(const time of [.5,1.1,1.6]){
   const value=M.particlePreset('trails'),samples=new Float64Array(256*7),visuals=new Float32Array(256),count=C.sampleCompositionInto(value,time,{layers:[]},0,samples,visuals,128,time);
   frames.push({time,age:time,count,config:value,samples:Array.from(samples.slice(0,count*7)),visuals:Array.from(visuals.slice(0,count)),...(captureDir?{capture:path.resolve(captureDir,'trails-'+time+'.png')}:{})});
  }
  await fs.mkdir(path.join(path.resolve(project),'tests'),{recursive:true});
  await fs.writeFile(path.join(path.resolve(project),'tests/reveal-reference.json'),JSON.stringify({config,frames}));
 }
 const binary=process.env.GODOT_BIN||(process.platform==='darwin'?'/Applications/Godot.app/Contents/MacOS/Godot':'godot');
 const command=['--path',path.resolve(project),'--rendering-method','gl_compatibility','--resolution','600x900','--script','res://'+script.replace(/^res:\/\//,'')];
 const started=Date.now();let log='';
 const result=await new Promise((resolve,reject)=>{const child=spawn(binary,command,{stdio:['ignore','pipe','pipe'],env:{...process.env,...(captureDir?{CARDSCAPE_CAPTURE_DIR:path.resolve(captureDir)}:{})}});let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeout);const collect=chunk=>{const text=chunk.toString();log+=text;process.stdout.write(text);if(log.length>8*1024*1024){child.kill('SIGKILL');}else if(/(?:^|\n)(?:SHADER ERROR|SCRIPT ERROR|ERROR):/.test(log)){child.kill('SIGTERM');}};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,expired});});});
 if(output){await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(path.resolve(output),log);}
 const failures=log.split('\n').filter(line=>/^(?:SHADER ERROR|SCRIPT ERROR|ERROR):/.test(line));
 if(result.expired||result.code!==0||failures.length||!(/"status"\s*:\s*"passed"/.test(log)))throw Error(JSON.stringify({...result,failures,elapsedMs:Date.now()-started})+'\n'+log.slice(-4000));
 console.log(JSON.stringify({status:'passed',gpu:true,shaderErrors:0,elapsedMs:Date.now()-started}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
