// QA only. A single continuous elliptical track is fitted, never a table of reference pixels.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const R=require('../renderer/runtime-model.js'),F=require('../renderer/frame-model.js'),K=require('../renderer/finish-catalog.js');
const root=path.resolve(process.argv[2]),target=process.argv[3]||'right-top-bat';
const targets={'right-top-bat':{cell:[.14,.16],along:.79,region:[540,5,695,115]},'left-top-bat':{cell:[.24,.26],along:.215,region:[105,5,280,100]}};
if(!targets[target])throw Error('Target must be right-top-bat or left-top-bat');
const config=targets[target],marker='// Shared procedural finish',start=R.fragment.indexOf(marker),baselineFile=path.join(root,'before-shared.glsl');
if(process.argv[4]){
 const region=process.argv[4].split(',').map(Number);
 if(region.length!==4||region.some(n=>!Number.isInteger(n))||region[0]<0||region[1]<0||region[2]>820||region[3]>124||region[0]>=region[2]||region[1]>=region[3])throw Error('Region must be x0,y0,x1,y1 within the registered top');
 config.region=region;
}
let shader=fs.existsSync(baselineFile)?fs.readFileSync(baselineFile,'utf8'):R.fragment.slice(start,R.fragment.indexOf('\nvoid ',start));
const sourceSha256=createHash('sha256').update(shader).digest('hex');
const condition=`top&&kind>1.5&&kind<2.5&&cell>${config.cell[0]}&&cell<${config.cell[1]}`;
const boundary=' // One continuous orbit, tumble and light phase for the middle top bat.';
const light='  float verticalLight=(.12+.88*smoothstep(-.80,.25,q.y+sweep))*(.70+.30*sqrt(abs(face)));';
const paint='  paint=mix(vec3(.015,.035,.002),vec3(1.,1.,.065),verticalLight);';
if(!shader.includes(boundary)||!shader.includes(light)||!shader.includes(paint))throw Error('Unexpected baseline: review injection boundary');
shader=shader.replace(boundary,` if(${condition}){float orbit=localTime*fit_a.z+fit_a.w;center=fit_a.x+fit_a.y*cos(orbit);spin=localTime*fit_b.x+fit_d.x;along=mod(fit_c.x+fit_c.y*sin(orbit)+fit_c.z*localTime+.30,1.60)-.30;}\n`+boundary)
 .replace(light,`  if(${condition})sweep=fit_b.y*pow(max(0.,-face),6.);\n`+light)
 .replace(paint,paint+`\n  if(${condition}){float red=mix(fit_d.y,1.,smoothstep(-.1,.3,face));paint=mix(vec3(.015,.035,.002),vec3(red,1.,.065),verticalLight);}`);
const frames=[...Array.from({length:13},(_,n)=>n*6),74],timing=JSON.parse(fs.readFileSync(path.join(root,'reference-frame-times.json')));
const phase=(config.cell[0]+config.cell[1])/2;
const calibratedRight=target==='right-top-bat'&&shader.includes('center=.035+.05*cos(orbit)');
const baseline=calibratedRight?[.035,.05,4.4,.9,2.,.2,.7725,.0175,-.0075,phase,1]:[.06,0,4.4,.9,2.3,0,config.along,0,0,phase,1];
const data={target,shader,sourceSha256,frames,timing,region:config.region,style:K.value('frame-halloween-stickers').style,finish:F.finishes.indexOf('halloween-stickers'),
 parameterNames:['center','orbitRadius','orbitSpeed','orbitPhase','tumbleSpeed','peakLightSweep','alongCenter','alongRadius','alongDrift','spinPhase','reverseRed'],
 baseline,
 seeds:[[.025,.095,4.4,.9,2.3,0,config.along,-.045,0,phase,1],[.025,.095,4.0,1.2,2.3,0,config.along,0,0,phase,1],...[1.7,2.3].flatMap(speed=>[phase,1.57].map(spinPhase=>[.03,.06,2.75,.75,speed,0,config.along,0,0,spinPhase,.55]))],
 bounds:[[-.08,.10],[0,.20],[target==='left-top-bat'?2:2.8,6],[.1,2],[1.7,3.1],[0,1.5],[config.along-.10,config.along+.10],[-.12,.12],[-.045,.045],[-3.14,3.14],[.25,1]],
 steps:[.025,.04,.55,.3,.3,.4,.035,.035,.015,.4,.2]};
// Absolute face compression has a half-turn ambiguity. Check both signs of
// the face instead of accepting a local phase minimum with the wrong tint.
const oppositePhase=p=>{const q=p.slice();q[9]=((q[9]+Math.PI+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return q;};
data.seeds.push(...data.seeds.map(oppositePhase));
if(process.argv[5]){
 const prior=JSON.parse(fs.readFileSync(path.resolve(process.argv[5]),'utf8'));
 if(prior.target!==target||prior.sourceSha256!==sourceSha256||JSON.stringify(prior.region)!==JSON.stringify(config.region)||prior.selected.params.length!==data.baseline.length)throw Error('Prior fit must use the same target, source, region and parameters');
 const p=prior.selected.params;
 if(p.some((v,i)=>!Number.isFinite(v)||v<data.bounds[i][0]||v>data.bounds[i][1]))throw Error('Prior fit lies outside current bounds');
 data.seeds.push(p.slice(),oppositePhase(p));
}
function client(data){
 const canvas=document.querySelector('#view'),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('WebGL unavailable');
 const [x,y,endX,endY]=data.region,width=endX-x,height=endY-y,r=data.style,rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 canvas.width=width;canvas.height=height;const displayScale=Math.min(3,960/width);canvas.style.width=width*displayScale+'px';canvas.style.height=height*displayScale+'px';
 const vertex=`attribute vec2 point;varying vec2 uv;void main(){vec2 pixel=vec2(${x}.,${y}.)+(point*vec2(1.,-1.)+1.)*.5*vec2(${width}.,${height}.);uv=(pixel-vec2(70.,124.))/vec2(690.,1035.);gl_Position=vec4(point,0.,1.);}`;
 const fragment='precision highp float;varying vec2 uv;uniform vec2 view,fit_b,fit_d;uniform vec4 fit_a;uniform vec3 fit_c;uniform float clock;'+data.shader+'\nvoid main(){vec4 m=vec4('+[r.width,r.corner,r.depth,r.bevel].map(n=>n/1024).join(',')+');float d=rimDistance(uv*vec2(1.,1.5),m.y);if(d>=0.){gl_FragColor=vec4(0.);return;}gl_FragColor=rimAura(vec3('+rgb(r.color)+'),vec3('+rgb(r.accent)+'),uv,view,clock,m,'+data.finish+'.,vec2(0.,1.));}';
 const program=gl.createProgram();
 for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);gl.viewport(0,0,width,height);
 const u=Object.fromEntries(['fit_a','fit_b','fit_c','fit_d','clock','view'].map(k=>[k,gl.getUniformLocation(program,k)])),pixels=new Uint8Array(width*height*4),{baseline,bounds,steps}=data;
 let selected=baseline.slice(),references=[],trace=[];
 const bright=(a,i)=>a[i+1]>95&&a[i]>.3*a[i+1]&&a[i]<1.2*a[i+1]&&a[i+2]<.35*a[i+1];
 function render(p,t){gl.uniform4f(u.fit_a,...p.slice(0,4));gl.uniform2f(u.fit_b,...p.slice(4,6));gl.uniform3f(u.fit_c,...p.slice(6,9));gl.uniform2f(u.fit_d,...p.slice(9,11));gl.uniform2f(u.view,0,0);gl.uniform1f(u.clock,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const error=gl.getError();if(error)throw Error('GL '+error);}
 function measure(p){let hit=0,union=0,error=0,maskError=0,maskPixels=0;for(const ref of references){render(p,ref.time);for(let py=0;py<height;py++)for(let px=0;px<width;px++){const i=(py*width+px)*4,j=((height-1-py)*width+px)*4,a=pixels[j+3]/255,rr=pixels[j]*a,gg=pixels[j+1]*a,bb=pixels[j+2]*a,target=ref.mask[py*width+px],candidate=gg>95&&rr>.3*gg&&rr<1.2*gg&&bb<.35*gg;hit+=target&&candidate?1:0;union+=target||candidate?1:0;const e=Math.abs(rr-ref.rgb[i])+Math.abs(gg-ref.rgb[i+1])+Math.abs(bb-ref.rgb[i+2]);error+=e;if(target){maskError+=e;maskPixels++;}}}const iou=hit/Math.max(1,union),mae=error/(references.length*width*height*3);return {params:p.slice(),iou,meanRGBError:mae,referenceMaskRGBError:maskError/(3*Math.max(1,maskPixels)),score:.7*(1-iou)+.3*mae/255};}
 function display(p){render(p,data.timing.frames[48].time);}
 document.querySelector('#baseline').onclick=()=>display(baseline);document.querySelector('#selected').onclick=()=>display(selected);
 async function init(){const scratch=document.createElement('canvas');scratch.width=width;scratch.height=height;const ctx=scratch.getContext('2d');for(const f of data.frames){const image=new Image();image.src='reference-'+f+'.png';await image.decode();ctx.clearRect(0,0,width,height);ctx.drawImage(image,x,y,width,height,0,0,width,height);const rgb=ctx.getImageData(0,0,width,height).data;references.push({frame:f,time:data.timing.frames[f].time,rgb:new Uint8Array(rgb),mask:Array.from({length:width*height},(_,n)=>bright(rgb,n*4))});}display(baseline);document.querySelector('#report').textContent=JSON.stringify({status:'ready',target:data.target,frames:data.frames,parameterNames:data.parameterNames,bounds,baseline:measure(baseline)},null,2);}
 const ready=init();
 document.querySelector('#fit').onclick=async()=>{
  const button=document.querySelector('#fit');button.disabled=true;
  try{
   await ready;trace=[];const initial=measure(baseline);let best=initial;
   for(const seed of data.seeds){const result=measure(seed);trace.push({seed:true,...result});if(result.score<best.score)best=result;}
   for(let pass=0;pass<3;pass++)for(let dim=0;dim<baseline.length;dim++){
    const origin=best.params.slice();for(let k=-2;k<=2;k++){const p=origin.slice();p[dim]=Math.min(bounds[dim][1],Math.max(bounds[dim][0],origin[dim]+k*steps[dim]*Math.pow(.5,pass)));const result=measure(p);trace.push({pass,dim,...result});if(result.score<best.score)best=result;}
    document.querySelector('#report').textContent='量测 '+trace.length+' 个候选 · 当前 IoU '+best.iou.toFixed(4);await new Promise(resolve=>requestAnimationFrame(resolve));
   }
   const rawOptimum=best;best=[initial,...trace].filter(v=>v.iou>=initial.iou&&v.meanRGBError<=initial.meanRGBError&&v.referenceMaskRGBError<=initial.referenceMaskRGBError).sort((a,b)=>b.iou-a.iou||a.score-b.score)[0];selected=best.params;display(selected);
   const result={schema:'cardscape-sticker-track-fit/1',accepted1to1:false,target:data.target,sourceSha256:data.sourceSha256,referenceSourceSha256:data.timing.sourceSha256,referenceFrames:data.frames,region:data.region,registration:{origin:[70,124],cardWidth:690},parameterNames:data.parameterNames,bounds,initial,selected:best,rawOptimum,trace,glError:0,selectionRule:'Max IoU among measured candidates without regressing either RGB metric relative to baseline',limits:['Same short reference and observed calibration frames, not a blind holdout.','Direct ROI raster differs from resized full-resolution capture. Revalidate all 75 frames and other regions.','A continuous elliptical track is inferred from the short preview; full game lifetime and 3D transform are not verified.','Masks include overlapping species and game UI, so visual inspection of the selected glyph is required.']};
   const link=document.querySelector('#download');link.href='data:application/json;base64,'+btoa(JSON.stringify(result));link.download=data.target+'-fit.json';link.hidden=false;document.querySelector('#report').textContent=JSON.stringify({status:'complete',target:data.target,initial,selected:best,evaluated:trace.length,glError:0},null,2);
  }catch(error){document.querySelector('#report').textContent=error.stack;}finally{button.disabled=false;}
 };
}
const file=path.join(root,target+'-fit.html');
fs.writeFileSync(file,`<!doctype html><meta charset="utf-8"><title>贴纸轨迹量测 · ${target}</title><style>body{background:#12191f;color:#dde8ef;font:14px system-ui;margin:24px}button{padding:8px 16px}pre{white-space:pre-wrap}small{color:#9bafba}</style><h1>${target} · 连续轨迹量测</h1><small>14 个声明观察帧，${data.parameterNames.length} 个有边界的连续参数；参考像素只用于 QA，完整 1:1 未验收。</small><p><button id="fit">量测并拟合</button> <button id="baseline">显示基线</button> <button id="selected">显示候选</button></p><canvas id="view"></canvas><pre id="report">准备参考图像…</pre><a id="download" hidden>下载参数与迭代记录</a><script>(${client.toString()})(${JSON.stringify(data)});</script>`);
console.log(file);
