// QA page executes the production particle shaders and trajectory sampler.
const fs=require('node:fs/promises'),path=require('node:path');
const B=require('../renderer/particle-batch.js'),C=require('../renderer/component-model.js'),M=require('../renderer/cosmetics-model.js');
async function main(){
 const dir=path.resolve(__dirname,'../outputs/snap-reference-2026-10-11');
 const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:'emblem-calibration-v51.html';
 if(!/^[a-z0-9-]+\.html$/.test(output||''))throw Error('Expected a local HTML filename');
 const version=require('../package.json').version;
 const config=M.particlePreset('adamantium');
 const envelopeName=process.argv.includes('--envelope-profile')?process.argv[process.argv.indexOf('--envelope-profile')+1]:null;
 const envelopes={ 'constant-600':{kind:'envelope',nominalLife:.60,lifeJitter:0,fadeStart:.60,fadeEnd:1,growthLife:.40}, 'varied-600':{kind:'envelope',nominalLife:.60,lifeJitter:.10,fadeStart:.60,fadeEnd:1,growthLife:.40}, 'balanced-600':{kind:'envelope',nominalLife:.60,lifeJitter:.10,fadeStart:.60,fadeEnd:1,growthLife:.44,growthStart:.36,amplitudeRange:.86,sizeScale:.955}, 'varied-500':{kind:'envelope',nominalLife:.50,lifeJitter:.20,fadeStart:.50,fadeEnd:1,growthLife:.40} };
 envelopes['varied-500-final']={...envelopes['varied-500'],sizeScale:1.02};
 if(envelopeName&&!envelopes[envelopeName])throw Error('Unknown QA envelope profile');
 if(envelopeName&&version!=='0.19.84')throw Error('Envelope experiments require the recorded v84 baseline');
 const profileName=process.argv.includes('--growth-profile')?process.argv[process.argv.indexOf('--growth-profile')+1]:null;
 if(envelopeName&&profileName)throw Error('Choose one independent experiment');
 const profiles={balanced:{start:.40,amplitude:.40,span:1,low:.92,range:.33},spread:{start:.40,amplitude:.42,span:1,low:.66,range:.82},earlier:{start:.36,amplitude:.46,span:.85,low:.72,range:.72},varied:{independent:true,start:.30,amplitude:.20,amplitudeRange:.65,amplitudeExponent:1,span:.95,spanRange:-.40},fitted:{independent:true,start:.38,amplitude:.20,amplitudeRange:.77,amplitudeExponent:1.58,span:1.03,spanRange:-.27}};
 if(profileName&&!profiles[profileName])throw Error('Unknown QA growth profile');
 const growthProfile=profileName?{id:profileName,...profiles[profileName]}:envelopeName?{id:envelopeName,...envelopes[envelopeName]}:null;
 if(profileName&&version!=='0.19.83')throw Error('Experimental growth ratios require the recorded v83 linear baseline');
 const hash=(i,seed)=>{const x=Math.sin((i+1)*127.1+seed*311.7)*43758.5453;return x-Math.floor(x);};
 const fade=t=>{const v=Math.max(0,Math.min(1,t));return v*v*(3-2*v);};
 const frames=Array.from({length:77},(_,i)=>Number((i*.03).toFixed(2))).map(time=>{const data=new Float64Array(256*7),count=C.sampleInto(config,time,{layers:[]},0,data,96),packed=new Float32Array(count*6*B.stride);
  if(envelopeName)for(let i=0;i<count;i++){
   const at=i*7,life=growthProfile.nominalLife*(1-growthProfile.lifeJitter+2*growthProfile.lifeJitter*hash(i+467,config.seed)),temporary=new Float64Array(256*7);
   C.sampleInto({...config,lifetime:life},time,{layers:[]},0,temporary,96);
   data.set(temporary.subarray(at,at+7),at);
   const phase=(time/life+data[at+6])%1,seed=hash(i+443,config.seed),large=i%5<2;
   const q=Math.min(1,phase*life/(large?growthProfile.growthLife:.40)/(large?1.03-.27*seed:.85)),ease=q*(2-q);
   data[at+3]=config.size*(large?(growthProfile.sizeScale??1)*((growthProfile.growthStart??.38)+(.20+(growthProfile.amplitudeRange??.77)*Math.pow(seed,1.58))*ease):(.045+.07*seed)*(.36+.46*ease));
   data[at+4]=fade(phase/.08)*(1-fade((phase-growthProfile.fadeStart)/(growthProfile.fadeEnd-growthProfile.fadeStart)))*config.opacity;
  }
  if(profileName)for(let i=0;i<count;i++){
   const at=i*7,phase=(time/config.lifetime+data[at+6])%1,seed=hash(i+443,config.seed),large=i%5<2;
   if(growthProfile.independent){
    const span=large?growthProfile.span+growthProfile.spanRange*seed:.85,q=Math.min(1,phase/span),factor=large?growthProfile.start+(growthProfile.amplitude+growthProfile.amplitudeRange*Math.pow(seed,growthProfile.amplitudeExponent))*q*(2-q):(.045+.07*seed)*(.36+.46*q*(2-q));
    data[at+3]*=factor/((large?.92+.33*seed:.045+.07*seed)*(.40+.65*phase));
   }else{
    const q=Math.min(1,phase/growthProfile.span),groupRatio=large?(growthProfile.low+growthProfile.range*seed)/(.92+.33*seed):1;
    data[at+3]*=groupRatio*(growthProfile.start+growthProfile.amplitude*q*(2-q))/(.40+.65*phase);
   }
  }
  B.pack(data,count,packed);return {time,count,packed:Array.from(packed)};});
 const page=`<!doctype html><meta charset="utf-8"><title>Adamantium production shader comparison</title><style>body{margin:20px;background:#191c22;color:#d6e4ec;font:14px system-ui}.row{display:flex;gap:20px;flex-wrap:wrap}img,canvas{background:#080b10;max-width:100%}figure{margin:0}figcaption{margin:8px 0}button,a{padding:8px 14px;background:#26323e;color:#eee;border:1px solid #536a7b}pre{white-space:pre-wrap}</style><h1>Adamantium · 生产 Shader 与公开短序列</h1><p>左侧是公开参考；中间是程序化图标；右侧是生产采样。尺寸统计按各自卡宽归一，未声称卡片形状、遮挡和随机轨迹逐像素相同。</p><div class="row"><figure><img src="reveal-Wolverine-motion.webp" width="330"><figcaption>SnapFan · Adamantium</figcaption><canvas id="glyph" width="300" height="300"></canvas><figcaption>当前图标 · 颜色保持静态</figcaption></figure><figure><canvas id="field" width="820" height="1000"></canvas><figcaption>40 个粒子 · 共用一个批次 · ${version}</figcaption></figure></div><p>${[0,2,4,6,8,10,15,20,40,60,76].map(i=>`<button data-frame="${i}">${frames[i].time}s</button>`).join(' ')} <button id="tilt">倾斜 / 正面</button> <button id="capture">导出 GPU 量测帧</button> <a id="download" hidden>下载量测帧</a></p><pre id="report"></pre><script>
const V=${JSON.stringify(B.vertex)},F=${JSON.stringify(B.fragment)},frames=${JSON.stringify(frames)},config=${JSON.stringify(config)},growthProfile=${JSON.stringify(growthProfile)};
function create(id){const c=document.getElementById(id),gl=c.getContext('webgl',{preserveDrawingBuffer:true,alpha:false});if(!gl)throw Error('WebGL unavailable');const p=gl.createProgram();for(const [kind,src] of [[gl.VERTEX_SHADER,V],[gl.FRAGMENT_SHADER,F]]){const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);for(const [name,size,at] of [['point',4,0],['style',4,16],['corner',2,32]]){const a=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,40,at);}const u=name=>gl.getUniformLocation(p,name);for(const [name,v] of Object.entries({rootOpacity:1,visual:25,rainbow:0,spriteTint:0,cosmicPass:0,particleTime:0,stretch:1,revealStretch:1,aspect:c.width/c.height,cameraDistance:2.7}))gl.uniform1f(u(name),v);gl.uniform4f(u('rootTransform'),0,0,0,1);gl.uniform3f(u('color'),1,183/255,41/255);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);return {c,gl,u,b};}
const glyph=create('glyph'),field=create('field');let at=0,tilt=false;
const registration={cameraDistance:2.7,rootScale:1.23,rootY:-.06,cardFront:.045};registration.cardWidthPixels=1000*1.45*Math.min(1,.82/.85)*registration.rootScale/(registration.cameraDistance-registration.cardFront*registration.rootScale);
field.gl.uniform4f(field.u('rootTransform'),0,registration.rootY,0,registration.rootScale);
const corners=${JSON.stringify(B.corners)},one=[];for(let i=0;i<6;i++)one.push(0,0,0,.70,1,0,.67,-1,corners[i*2],corners[i*2+1]);
function draw(s,data,time,angle,measure=true){const {gl,u}=s;gl.clearColor(.02,.025,.04,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(u('angle'),angle[0],angle[1]);gl.uniform1f(u('particleTime'),time);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/10);if(!measure)return {error:gl.getError()};const pixels=new Uint8Array(s.c.width*s.c.height*4);gl.readPixels(0,0,s.c.width,s.c.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let yellow=0,blue=0,white=0,black=0;for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r>200&&g>110&&g<235&&b<100)yellow++;if(b>100&&b>r*2&&b>g*1.5)blue++;if(r>220&&g>220&&b>220)white++;if(r<10&&g<10&&b<12)black++;}return {yellow,blue,white,black,error:gl.getError()};}
function render(){const f=frames[at],shape=draw(glyph,one,f.time,[0,0]),cloud=draw(field,f.packed,f.time,tilt?[.32,-.18]:[0,0]);document.getElementById('report').textContent=JSON.stringify({frame:f.time,tilt,shape,cloud,batches:1,count:f.count,growthProfile,referenceAccepted1to1:false},null,2);}
for(const b of document.querySelectorAll('[data-frame]'))b.onclick=()=>{at=Number(b.dataset.frame);render();};document.getElementById('tilt').onclick=()=>{tilt=!tilt;render();};render();
document.getElementById('capture').onclick=async()=>{const captures=[];await new Promise(resolve=>requestAnimationFrame(resolve));for(const f of frames){const result=draw(field,f.packed,f.time,[0,0],false);if(result.error)throw Error('GPU error '+result.error);captures.push({time:f.time,count:f.count,png:field.c.toDataURL('image/png')});if(captures.length%8===0)await new Promise(resolve=>requestAnimationFrame(resolve));}const payload={schema:'cardscape-gpu-emblem-frames/1',version:${JSON.stringify(version)},registration,config,growthProfile,accepted1to1:false,frames:captures};const a=document.getElementById('download');if(a.href.startsWith('blob:'))URL.revokeObjectURL(a.href);a.href=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));a.download='emblem-gpu-'+${JSON.stringify(version)}+(growthProfile?'-'+growthProfile.id:'')+'.json';a.hidden=false;render();document.getElementById('report').textContent=JSON.stringify({exportReady:true,frames:captures.length,gpuError:0,growthProfile,accepted1to1:false},null,2);};
</script>`;
 await fs.writeFile(path.join(dir,output),growthProfile?page.replace('<div class="row">','<p>独立实验：'+growthProfile.id+'。未应用到生产或活跃工程；参数见量测帧元数据。</p><div class="row">'):page);
 // Independent GPU runners can consume the exact samples, without browser globals.
 await fs.writeFile(path.join(dir,output.replace(/\.html$/,'.samples.json')),JSON.stringify({schema:'cardscape-emblem-qa-samples/1',version,config,growthProfile,frames,experimental:!!growthProfile,uiApplied:false,accepted1to1:false}));
 console.log(path.join(dir,output));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
