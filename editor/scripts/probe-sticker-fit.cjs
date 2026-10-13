// QA: fit a bounded, continuous orbit against visible reference frames. Never export their pixels.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const R=require('../renderer/runtime-model.js'),F=require('../renderer/frame-model.js'),K=require('../renderer/finish-catalog.js');
const root=path.resolve(process.argv[2]),start=R.fragment.indexOf('// Shared procedural finish');
const baselinePath=path.join(root,'before-shared.glsl');
let shader=fs.existsSync(baselinePath)?fs.readFileSync(baselinePath,'utf8'):R.fragment.slice(start,R.fragment.indexOf('\nvoid ',start));
const sourceSha256=createHash('sha256').update(shader).digest('hex');
const orbit='center=.023+.140*cos(localTime*.8+.918);';
const light='float verticalLight=(.12+.88*smoothstep(-.80,.25,q.y))*(.70+.30*sqrt(abs(face)));';
if(!shader.includes(orbit)||!shader.includes(light))throw Error('Unexpected baseline: review fit boundary before running');
shader=shader.replace(orbit,'{center=fit_a.x+fit_a.y*cos(localTime*fit_a.z+fit_a.w);spin=localTime*fit_b.x+cell;}')
 .replace(light,'float sweep=cell>1.5&&cell<1.6?fit_b.y*pow(max(0.,-face),6.):0.;float verticalLight=(.12+.88*smoothstep(-.80,.25,q.y+sweep))*(.70+.30*sqrt(abs(face)));');
const frames=[...Array.from({length:13},(_,n)=>n*6),74],timing=JSON.parse(fs.readFileSync(path.join(root,'reference-frame-times.json')));
const parameterNames=['center','orbitRadius','orbitSpeed','orbitPhase','tumbleSpeed','peakLightSweep'];
const data={shader,frames,timing,sourceSha256,parameterNames,style:K.value('frame-halloween-stickers').style,finish:F.finishes.indexOf('halloween-stickers')};
fs.writeFileSync(path.join(root,'stickers-fit.html'),`<!doctype html><meta charset="utf-8"><title>连续轨迹参数量测</title>
<style>body{background:#12191f;color:#dde8ef;font:14px system-ui;margin:24px}button{padding:8px 16px}pre{white-space:pre-wrap}canvas{width:735px;height:180px;image-rendering:auto}small{color:#9bafba}</style>
<h1>顶部蝙蝠 · 连续轨迹参数量测</h1><small>固定配准、14 个已声明观察帧、六个有边界的全局参数；参考像素只参与 QA，完整 1:1 未验收。</small>
<p><button id="fit">量测并拟合</button> <button id="baseline">显示基线</button> <button id="selected">显示候选</button></p>
<canvas id="view" width="245" height="60"></canvas><pre id="report">准备参考图像…</pre><a id="download" hidden>下载参数与迭代记录</a>
<script>
const data=${JSON.stringify(data)},canvas=document.querySelector('#view'),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
if(!gl)throw Error('WebGL unavailable');
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),r=data.style;
const vertex='attribute vec2 point;varying vec2 uv;void main(){vec2 pixel=vec2(375.,48.)+(point*vec2(1.,-1.)+1.)*.5*vec2(245.,60.);uv=(pixel-vec2(70.,124.))/vec2(690.,1035.);gl_Position=vec4(point,0.,1.);}';
const fragment='precision highp float;varying vec2 uv;uniform vec2 view,fit_b;uniform vec4 fit_a;uniform float clock;'+data.shader+'\\nvoid main(){vec4 m=vec4('+[r.width,r.corner,r.depth,r.bevel].map(n=>n/1024).join(',')+');float d=rimDistance(uv*vec2(1.,1.5),m.y);if(d>=0.){gl_FragColor=vec4(0.);return;}gl_FragColor=rimAura(vec3('+rgb(r.color)+'),vec3('+rgb(r.accent)+'),uv,view,clock,m,'+data.finish+'.,vec2(0.,1.));}';
const program=gl.createProgram();
for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(program,s);gl.deleteShader(s);}
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);gl.viewport(0,0,245,60);
const u=Object.fromEntries(['fit_a','fit_b','clock','view'].map(k=>[k,gl.getUniformLocation(program,k)])),pixels=new Uint8Array(245*60*4);
const baseline=[.023,.140,.8,.918,2.3,0],bounds=[[-.01,.055],[.09,.20],[.60,1.3],[.70,1.10],[1.7,2.7],[0,1.8]],steps=[.014,.035,.22,.1,.35,.6];
let selected=baseline.slice(),references=[],trace=[];
const bright=(a,i)=>a[i+1]>95&&a[i]>.3*a[i+1]&&a[i]<1.2*a[i+1]&&a[i+2]<.35*a[i+1];
function render(p,t){gl.uniform4f(u.fit_a,...p.slice(0,4));gl.uniform2f(u.fit_b,...p.slice(4));gl.uniform2f(u.view,0,0);gl.uniform1f(u.clock,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.readPixels(0,0,245,60,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const error=gl.getError();if(error)throw Error('GL '+error);}
function measure(p){let hit=0,union=0,error=0,maskError=0,maskPixels=0;for(const ref of references){render(p,ref.time);for(let y=0;y<60;y++)for(let x=0;x<245;x++){const i=(y*245+x)*4,j=((59-y)*245+x)*4,a=pixels[j+3]/255;let rr=pixels[j]*a,gg=pixels[j+1]*a,bb=pixels[j+2]*a;const target=ref.mask[y*245+x],candidate=gg>95&&rr>.3*gg&&rr<1.2*gg&&bb<.35*gg;hit+=target&&candidate?1:0;union+=target||candidate?1:0;const e=Math.abs(rr-ref.rgb[i])+Math.abs(gg-ref.rgb[i+1])+Math.abs(bb-ref.rgb[i+2]);error+=e;if(target){maskError+=e;maskPixels++;}}}const iou=hit/Math.max(1,union),mae=error/(references.length*245*60*3);return {params:p.slice(),iou,meanRGBError:mae,referenceMaskRGBError:maskError/(3*Math.max(1,maskPixels)),score:.7*(1-iou)+.3*mae/255};}
function display(p){render(p,data.timing.frames[24].time);}
document.querySelector('#baseline').onclick=()=>display(baseline);document.querySelector('#selected').onclick=()=>display(selected);
async function init(){const scratch=document.createElement('canvas');scratch.width=245;scratch.height=60;const ctx=scratch.getContext('2d');for(const f of data.frames){const image=new Image();image.src='reference-'+f+'.png';await image.decode();ctx.clearRect(0,0,245,60);ctx.drawImage(image,375,48,245,60,0,0,245,60);const rgb=ctx.getImageData(0,0,245,60).data;references.push({frame:f,time:data.timing.frames[f].time,rgb:new Uint8Array(rgb),mask:Array.from({length:245*60},(_,n)=>bright(rgb,n*4))});}display(baseline);document.querySelector('#report').textContent=JSON.stringify({status:'ready',frames:data.frames,bounds,baseline:measure(baseline)},null,2);}
const ready=init();
document.querySelector('#fit').onclick=async()=>{const button=document.querySelector('#fit');button.disabled=true;try{await ready;trace=[];const initial=measure(baseline);let best=initial;for(let pass=0;pass<3;pass++)for(let dim=0;dim<6;dim++){const origin=best.params.slice();for(let k=-2;k<=2;k++){const p=origin.slice();p[dim]=Math.min(bounds[dim][1],Math.max(bounds[dim][0],origin[dim]+k*steps[dim]*Math.pow(.5,pass)));const result=measure(p);trace.push({pass,dim,...result});if(result.score<best.score)best=result;}document.querySelector('#report').textContent='量测 '+(trace.length)+' 个候选 · 当前 IoU '+best.iou.toFixed(4);await new Promise(resolve=>requestAnimationFrame(resolve));}const rawOptimum=best;best=[initial,...trace].filter(v=>v.iou>=initial.iou&&v.meanRGBError<=initial.meanRGBError&&v.referenceMaskRGBError<=initial.referenceMaskRGBError).sort((a,b)=>b.iou-a.iou||a.score-b.score)[0];selected=best.params;display(selected);const result={sourceSha256:data.sourceSha256,parameterNames:data.parameterNames,rawOptimum,selectionRule:'Max IoU among sampled candidates without regressing either RGB metric relative to baseline',schema:'cardscape-sticker-continuous-fit/1',accepted1to1:false,referenceFrames:data.frames,bounds,initial,selected:best,trace,glError:0,limits:['Same short source and declared calibration frames; not a blind holdout.','Direct-ROI GPU raster differs slightly from resized full-resolution captures. Revalidate the selected coefficients using the original full-resolution 75-frame probe.','Only the middle top bat orbit, tumble and light are fitted; other glyphs, full-game lifetime and all views remain pending.']};const link=document.querySelector('#download');link.href='data:application/json;base64,'+btoa(JSON.stringify(result));link.download='continuous-fit.json';link.hidden=false;document.querySelector('#report').textContent=JSON.stringify({status:'complete',initial,selected:best,evaluated:trace.length,glError:0},null,2);}catch(error){document.querySelector('#report').textContent=error.stack;}finally{button.disabled=false;}};
</script>`);
console.log(path.join(root,'stickers-fit.html'));
