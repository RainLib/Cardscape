const fs=require('node:fs/promises');const path=require('node:path');const vm=require('node:vm');
const {NativeWorker}=require('../electron/native-client.cjs');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../outputs/card-3d-design-v2');
async function main(){
  const assets=path.join(root,'assets');await fs.mkdir(assets,{recursive:true});
  const context=vm.createContext({window:{}});
  for(const file of ['geometry-data.js','snap-geometry.js','effect-presets.js'])vm.runInContext(await fs.readFile(path.join(source,'model',file),'utf8'),context);
  const original=context.window.CARD_MODEL,snap=context.window.CARD_SNAP_GEOMETRY;
  original.parts=original.parts.filter(p=>['body','art_back','emblem','cloth','ill_background'].includes(p.group));
  const used=new Set(['images/04-card-front-full-bleed.png','layers/00-background.png','images/01-card-back.png']);
  for(const p of [...original.parts,...snap.parts])if(p.texture)used.add(p.texture);
  for(const file of used){await fs.copyFile(path.join(source,file),path.join(assets,path.basename(file)));}
  for(const p of [...original.parts,...snap.parts])if(p.texture)p.texture=p.group==='pop_foreground'?'assets/foreground.png':'assets/'+path.basename(p.texture);
  await fs.writeFile(path.join(assets,'geometry.js'),`window.CARD_MODEL=${JSON.stringify(original)};\nwindow.CARD_SNAP_GEOMETRY=${JSON.stringify(snap)};\nwindow.CARD_EFFECT_PRESETS=${JSON.stringify(context.window.CARD_EFFECT_PRESETS)};`);
  const worker=new NativeWorker();const fg=snap.parts.find(p=>p.group==='pop_foreground');
  const masks={};
  try {
    for(const [id,sourceField,channel] of [['motion','effects',0],['inset','effects',1],['emission','effects',2],['phase','effects',3],['rigid','regions',0],['coverage',null,0]]){
      const weights=fg.uv.filter((_,i)=>i%2===0).map((_,i)=>sourceField?fg[sourceField][i*4+channel]:1);
      const result=await worker.call('bake_mask',{width:1024,height:1536,uv:fg.uv,weights,indices:fg.indices});
      await fs.writeFile(path.join(assets,`mask-${id}.png`),Buffer.from(result.image.split(',')[1],'base64'));masks[id]=`assets/mask-${id}.png`;
      console.log(`Baked ${id}: ${result.elapsedMs.toFixed(1)}ms`);
    }
    const image='data:image/png;base64,'+(await fs.readFile(path.join(assets,'04-card-front-full-bleed.png'))).toString('base64');
    const mask='data:image/png;base64,'+(await fs.readFile(path.join(assets,'mask-coverage.png'))).toString('base64');
    const alpha=await worker.call('alpha',{image,mask});
    await fs.writeFile(path.join(assets,'foreground.png'),Buffer.from(alpha.image.split(',')[1],'base64'));
  } finally {worker.close();}
  const template={schema:'card-atelier/1',name:'破隘旗官',width:1024,height:1536,revision:0,back:'assets/01-card-back.png',masks,meshGuides:[],effects:{depth:1,background:1,cape:true,flow:true,capeLayout:0,paused:false,frame:true},layers:[
    {id:'title',name:'角色标题',kind:'text',text:'破隘旗官',x:0,y:0,scale:1,opacity:1,visible:true,locked:false},
    {id:'frame',name:'立体边框',kind:'frame',x:0,y:0,scale:1,opacity:1,visible:true,locked:true},
    {id:'foreground',name:'人物 / 完整披风 / 战锤',kind:'foreground',src:'assets/foreground.png',master:'assets/04-card-front-full-bleed.png',x:0,y:0,scale:1,opacity:1,visible:true,locked:false},
    {id:'background',name:'峡谷背景',kind:'background',src:'assets/00-background.png',x:0,y:0,scale:1,opacity:1,visible:true,locked:false}
  ]};
  await fs.writeFile(path.join(assets,'template.json'),JSON.stringify(template,null,2));
  await fs.cp(assets,path.join(root,'renderer','assets'),{recursive:true});
  let viewer=await fs.readFile(path.join(source,'model/viewer.js'),'utf8');
  viewer=viewer.replace('const canvas=document.getElementById("model-canvas"),info=document.getElementById("model-info");','const canvas=document.getElementById("model-canvas"),info=document.getElementById("model-info");\nlet documentLayers=[];let titleText="破隘旗官";let currentDocument=null;');
  viewer=viewer.replace('uniform mat4 u_projection;','uniform vec3 u_layerTransform; uniform mat4 u_projection;');
  viewer=viewer.replace('baked=!state.exploded&&!clay&&state.mask===0&&!pop','baked=false');
  viewer=viewer.replace('v_local=local;v_effects=', 'local.xy=local.xy*u_layerTransform.z+u_layerTransform.xy;\nv_local=local;v_effects=');
  viewer=viewer.replace('uniform float u_mask;', 'uniform float u_layerOpacity; uniform float u_mask;');
  viewer=viewer.replace('if(u_logo&&texel.a<.02)discard;', 'if(texel.a<.02)discard;');
  viewer=viewer.replace('gl_FragColor=vec4(col,1.);\n}`;', 'gl_FragColor=vec4(col,texel.a*u_layerOpacity);\n}`;');
  viewer=viewer.replaceAll('gl_FragColor=vec4(col,1.);return;','gl_FragColor=vec4(col,u_layerOpacity);return;').replaceAll('gl_FragColor=vec4(col,texel.a);return;','gl_FragColor=vec4(col,texel.a*u_layerOpacity);return;');
  viewer=viewer.replace('"projection","angles"', '"layerTransform","layerOpacity","projection","angles"');
  viewer=viewer.replaceAll('ctx.strokeText("破隘旗官",384,102)','ctx.strokeText(titleText,384,102)').replaceAll('ctx.fillText("破隘旗官",384,102)','ctx.fillText(titleText,384,102)');
  viewer=viewer.replace('&&!document.getElementById("model").hidden','');
  const uiStart=viewer.indexOf('document.getElementById("angle-value")');
  const uiEnd=viewer.indexOf('Object.assign(canvas.dataset',uiStart);
  viewer=viewer.slice(0,uiStart)+'info.textContent=tri+" 三角面 / "+drawn+" 部件";\n'+viewer.slice(uiEnd);
  const bindingsStart=viewer.indexOf('function syncChecks()');
  const bindingsEnd=viewer.indexOf('let drag=null;',bindingsStart);
  viewer=viewer.slice(0,bindingsStart)+viewer.slice(bindingsEnd);
  const tail=viewer.indexOf('document.querySelectorAll("[data-tab]")');
  viewer=viewer.slice(0,tail)+`\nwindow.cardPreview={
    setDocument(doc){currentDocument=doc;documentLayers=doc.layers;Object.assign(state,doc.effects);if(titleText!==doc.layers.find(l=>l.kind==='text')?.text){titleText=doc.layers.find(l=>l.kind==='text')?.text||'';makeWordmark();}draw();},
    updateMask(id,image){const channel={motion:0,inset:1,emission:2,phase:3}[id];if(channel===undefined)return;for(const p of parts.filter(p=>p.group==='pop_foreground')){for(let i=0;i<p.uv.length/2;i++){const x=Math.max(0,Math.min(image.width-1,Math.round(p.uv[i*2]*(image.width-1)))),y=Math.max(0,Math.min(image.height-1,Math.round(p.uv[i*2+1]*(image.height-1))));let v=image.data[(y*image.width+x)*4]/255;if(id==='motion')v*=1-(p.regions?.[i*4]||0);p.effects[i*4+channel]=v;}gl.bindBuffer(gl.ARRAY_BUFFER,p.effect);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(p.effects));}draw();},
    setTexture(group,image){for(const p of parts.filter(p=>p.group===group)){if(!p.texture)continue;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}draw();},
    setText(layer,image){logo.positions=[-.5,-.75,.12,.5,-.75,.12,.5,.75,.12,-.5,.75,.12];gl.bindBuffer(gl.ARRAY_BUFFER,logo.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(logo.positions));gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.wordmark);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);draw();},
    addImage(layer,image){let p=parts.find(p=>p.name===layer.id);if(!p){p=quad(layer.id,'custom_image',-.5,-.75,.5,.75,.115,[0,1,1,1,1,0,0,0]);p.texture=layer.id;parts.push(p);const count=4;p.pos=buffer(p.positions,gl.ARRAY_BUFFER,Float32Array);p.norm=buffer(p.normals,gl.ARRAY_BUFFER,Float32Array);p.tex=buffer(p.uv,gl.ARRAY_BUFFER,Float32Array);p.effect=buffer(new Array(16).fill(0),gl.ARRAY_BUFFER,Float32Array);p.region=buffer(new Array(16).fill(0),gl.ARRAY_BUFFER,Float32Array);p.popBase=buffer(p.positions,gl.ARRAY_BUFFER,Float32Array);p.idx=buffer(p.indices,gl.ELEMENT_ARRAY_BUFFER,Uint16Array);p.lines=buffer([0,1,1,2,2,3,3,0],gl.ELEMENT_ARRAY_BUFFER,Uint16Array);p.lineCount=8;textures[p.texture]=newTexture();}gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);draw();},
    pose(yaw,pitch=0){state.freeRotate=true;setPose(yaw,pitch,true);},
    setTime(t){state.time=t;state.paused=true;draw();},
    showWire(value){state.wire=value;draw();},
    burst(){state.burstStart=performance.now();draw();}
  };\nmakeWordmark();draw();\n})();\n`;
  viewer=viewer.replace('for(const p of parts){\nif(p.group===', `for(const p of parts){
const layer=documentLayers.find(l=>l.id===p.name||({pop_foreground:'foreground',flat_art:'foreground',energy:'foreground',snap_background:'background',snap_frame:'frame',logo:'title'}[p.group]===l.id));
if(layer?.visible===false)continue;if(p.group==='custom_image'&&!layer)continue;
if(p.group==='custom_image'&&facing()<=.035)continue;
gl.uniform3f(u.layerTransform,layer?(layer.x/1024):0,layer?(-layer.y/1536*1.5):0,layer?.scale||1);gl.uniform1f(u.layerOpacity,layer?.opacity??1);
if(p.group===`);
  viewer=viewer.replace('const alpha=["logo","energy"].includes(p.group);','const alpha=["logo","energy","custom_image","pop_foreground"].includes(p.group)||(layer?.opacity??1)<1;');
  viewer=viewer.replace('updateMask(id,image){const channel=', 'updateMask(id,image){let changed=0;const channel=');
  viewer=viewer.replace('p.effects[i*4+channel]=v;', 'if(Math.abs(p.effects[i*4+channel]-v)>.00001)changed++;p.effects[i*4+channel]=v;');
  viewer=viewer.replace('gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(p.effects));}draw();','gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(p.effects));}canvas.dataset.lastMask=id;canvas.dataset.changedVertices=String(changed);draw();');
  await fs.writeFile(path.join(root,'renderer','preview.js'),viewer);
  console.log('Prepared registered art, 6 native masks, continuous foreground and GPU preview.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
