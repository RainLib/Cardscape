/* Two real GPU contexts, one reference clock; no reference pixels enter either shader. */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),R=require('../renderer/runtime-model.js'),F=require('../renderer/frame-model.js'),K=require('../renderer/finish-catalog.js');
const root=path.resolve(process.argv[2]);
const beforeLabel=process.argv[3]||'0.19.69';
const previewScale=270/820,registrationScale=690/1024;
const preview={width:1408*registrationScale*previewScale,height:1100*previewScale,x:(70-192*registrationScale)*previewScale,y:(124-192*registrationScale)*previewScale};
const start=R.fragment.indexOf('// Shared procedural finish');
const timing=JSON.parse(fs.readFileSync(path.join(root,'reference-frame-times.json'),'utf8'));
const after=process.argv[4]?fs.readFileSync(path.resolve(process.argv[4]),'utf8'):R.fragment.slice(start,R.fragment.indexOf('\nvoid ',start));
const shaders={before:fs.readFileSync(path.join(root,'before-shared.glsl'),'utf8'),after};
const data={shaders,sourceHashes:Object.fromEntries(Object.entries(shaders).map(([key,code])=>[key,createHash('sha256').update(code).digest('hex')])),style:K.value('frame-halloween-stickers').style,finish:F.finishes.indexOf('halloween-stickers'),timing};
fs.writeFileSync(path.join(root,'stickers-sequence-small.html'),`<!doctype html><meta charset="utf-8"><title>Halloween · 连续帧对照</title>
<style>body{background:#12191f;color:#dce6ed;font:14px system-ui;margin:22px}main{display:flex;gap:24px}section{width:270px}img{width:270px;height:auto}.registered{position:relative;width:270px;height:${preview.height}px;overflow:hidden}.registered canvas{position:absolute;left:${preview.x}px;top:${preview.y}px;width:${preview.width}px;height:auto}button,input{padding:7px}small{color:#9babb7}pre{white-space:pre-wrap}</style>
<h1>Halloween · 连续帧对照</h1><small>同一时间戳、同一配准；完整 1:1 仍待验收。</small>
<p><button id="previous">上一帧</button> <input id="frame" type="number" min="0" max="74" value="0" aria-label="参考帧"> <button id="next">下一帧</button> <button id="capture">捕获连续 75 帧</button></p>
<main><section><h2>Snap 参考</h2><img id="reference" src="reference-0.png"></section><section><h2>${beforeLabel}</h2><div class="registered"><canvas id="before" width="1408" height="1920"></canvas></div></section><section><h2>当前候选</h2><div class="registered"><canvas id="after" width="1408" height="1920"></canvas></div></section></main>
<pre id="report">正在编译…</pre><a id="download" hidden>下载顶部连续帧</a> <a id="download-before" hidden>下载旧版完整回归帧</a> <a id="download-after" hidden>下载新版完整回归帧</a>
<script>
const data=${JSON.stringify(data)},width=1408,height=1920,margin=192,selected=[0,12,24,36,48,60,74];
function renderer(id){
 const canvas=document.querySelector('#'+id),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
 const program=gl.createProgram(),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),r=data.style;
 const vertex='attribute vec2 point;varying vec2 uv;void main(){uv=(((point*vec2(1.,-1.)+1.)*.5)*vec2(1408.,1920.)-192.)/vec2(1024.,1536.);gl_Position=vec4(point,0.,1.);}';
 const fragment='precision highp float;varying vec2 uv;uniform vec2 view;uniform float clock,speed;'+data.shaders[id]+'\\nvoid main(){vec4 m=vec4('+[r.width,r.corner,r.depth,r.bevel].map(n=>n/1024).join(',')+');float d=rimDistance(uv*vec2(1.,1.5),m.y);if(d>m.x){gl_FragColor=vec4(0.);return;}vec3 low=vec3('+rgb(r.color).join(',')+'),hi=vec3('+rgb(r.accent).join(',')+');if(d<0.){gl_FragColor=rimAura(low,hi,uv,view,clock,m,'+data.finish+'.,vec2(0.,speed));return;}gl_FragColor=vec4(rimColor(low,hi,uv,view,clock,m,'+data.finish+'.,vec2(0.,speed),.75),rimCoverage(uv,m,'+data.finish+'.));}';
 for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);gl.deleteShader(shader);}
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
 const uniforms=Object.fromEntries(['view','clock','speed'].map(key=>[key,gl.getUniformLocation(program,key)]));
 return function(time,yaw=0,pitch=0,speed=r.animationSpeed){gl.uniform2f(uniforms.view,yaw,pitch);gl.uniform1f(uniforms.clock,time);gl.uniform1f(uniforms.speed,speed);gl.viewport(0,0,width,height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);const glError=gl.getError();if(glError)throw Error('GL '+glError);return {time,yaw,pitch,speed,glError};};
}
try{
 const draw={before:renderer('before'),after:renderer('after')};
 const top=document.createElement('canvas');top.width=width;top.height=margin;const topContext=top.getContext('2d');
 function capture(id,time,yaw=0,pitch=0,speed=data.style.animationSpeed,cropped=false){const state=draw[id](time,yaw,pitch,speed),canvas=document.querySelector('#'+id);if(cropped){topContext.clearRect(0,0,width,margin);topContext.drawImage(canvas,0,0,width,margin,0,0,width,margin);return {...state,png:top.toDataURL('image/png'),crop:{x:0,y:0,width,height:margin}};}return {...state,png:canvas.toDataURL('image/png')};}
 function download(id,value){const link=document.querySelector('#'+id);link.href='data:application/json;base64,'+btoa(JSON.stringify(value));link.download=id+'.json';link.hidden=false;}
 function show(index){index=Math.max(0,Math.min(74,index));document.querySelector('#frame').value=index;document.querySelector('#reference').src='reference-'+index+'.png';for(const id of ['before','after'])draw[id](data.timing.frames[index].time);document.querySelector('#report').textContent='第 '+index+' 帧 · '+data.timing.frames[index].time.toFixed(2)+' 秒 · GL 0';}
 show(0);document.querySelector('#previous').onclick=()=>show(Number(document.querySelector('#frame').value)-1);document.querySelector('#next').onclick=()=>show(Number(document.querySelector('#frame').value)+1);document.querySelector('#frame').onchange=e=>show(Number(e.target.value));
 document.querySelector('#capture').onclick=async()=>{
  const button=document.querySelector('#capture');button.disabled=true;try{
   const result={schema:'cardscape-sticker-sequence-gpu/1',width,height,margin,timing:data.timing,sourceHashes:data.sourceHashes,versions:{}};
   for(const id of ['before','after']){
    const frames=[];for(const frame of data.timing.frames){frames.push({...capture(id,frame.time,0,0,data.style.animationSpeed,true),referenceFrame:frame.frame});if(frame.frame%5===0){document.querySelector('#report').textContent='捕获 '+id+' '+(frame.frame+1)+'/75';await new Promise(resolve=>requestAnimationFrame(resolve));}}
    const time=data.timing.frames[24].time,full=[...selected.map(n=>capture(id,data.timing.frames[n].time)),capture(id,time,.35,.2),capture(id,time,-.35,-.2),capture(id,0,0,0,0),capture(id,100,0,0,0),capture(id,60)];
    result.versions[id]={frames};download('download-'+id,{schema:'cardscape-sticker-gpu/1',width,height,margin,frames:full});
   }
   show(Number(document.querySelector('#frame').value));download('download',result);document.querySelector('#report').textContent='已捕获两个版本各 75 帧顶部区域与 12 帧完整回归，GL 0';
  }catch(error){document.querySelector('#report').textContent=error.stack;}finally{button.disabled=false;}
 };
}catch(error){document.querySelector('#report').textContent=error.stack;throw error;}
</script>`);
console.log(path.join(root,'stickers-sequence-small.html'));
