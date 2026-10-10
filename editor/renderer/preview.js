(() => {
"use strict";
const cfg=window.CARD_EFFECT_PRESETS, snap=window.CARD_SNAP_GEOMETRY, original=window.CARD_MODEL;
const canvas=document.getElementById("model-canvas"),info=document.getElementById("model-info");
let documentLayers=[];let titleText="破隘旗官";let currentDocument=null;
const gl=canvas.getContext("webgl",{alpha:true,antialias:true,preserveDrawingBuffer:true});
if(!gl){info.textContent="当前浏览器没有 WebGL，可查看参考视频和下载模型。";return;}
const vs=`
attribute vec3 a_position; attribute vec3 a_normal; attribute vec2 a_uv; attribute float a_background; attribute vec4 a_effects; attribute vec4 a_regions; attribute vec3 a_popBase;
uniform vec3 u_layerTransform; uniform mat4 u_projection; uniform vec2 u_angles; uniform vec3 u_shift;
uniform float u_zoom; uniform float u_depth; uniform float u_volume; uniform float u_time; uniform float u_capeGain; uniform float u_capeLayout;
uniform bool u_pop; uniform bool u_capeInset; uniform bool u_breakout; uniform bool u_bottom; uniform bool u_energy;
varying vec3 v_position; varying vec3 v_normal; varying vec2 v_uv; varying vec4 v_effects; varying vec4 v_regions; varying vec3 v_local;
vec3 turn(vec3 p){float c=cos(u_angles.x),s=sin(u_angles.x);vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);c=cos(u_angles.y);s=sin(u_angles.y);return vec3(q.x,c*q.y-s*q.z,s*q.y+c*q.z);}
void main(){vec3 local=a_position;
if(u_pop){
vec3 basePoint=vec3(a_uv.x-.5,.75-a_uv.y*1.5,.01065);
if(!u_breakout||u_depth==0.){local=basePoint;}
else{
float lower=1.-smoothstep(.78,.90,a_uv.y);
local=a_popBase;
float upperAllowed=u_capeLayout==1.?0.:1.,lowerAllowed=u_capeLayout==0.?0.:1.;
float upperCloth=a_regions.z;
float lowerCloth=a_regions.w*smoothstep(.72,.82,a_uv.y)*(1.-smoothstep(.88,1.,a_uv.y));
local.z=.01065+(.025*lower+max(0.,a_popBase.z-.01065-.025*lower)*u_volume)*u_depth;
local.z=mix(local.z,.0145,upperCloth*(1.-upperAllowed));
local.z+=lowerAllowed*lowerCloth*.042*u_depth;
float inset=u_capeInset?a_effects.y:0.;
local.z=mix(local.z,.0145,inset);
float weight=a_effects.x*u_capeGain*min(1.,u_depth)*(1.-smoothstep(.82,.90,a_uv.y)+lowerAllowed*smoothstep(.82,.90,a_uv.y))*(1.-smoothstep(.96,1.,a_uv.y));
// Depth-only cloth movement keeps UV/XY registered and cannot fold the arm mesh.
local.z+=.008*weight*(1.-inset)*cos(u_time*1.04719755+a_uv.x*14.+a_uv.y*8.);local.z=max(local.z,.01065);
}
}
if(u_energy){float lower=1.-smoothstep(.78,.90,a_uv.y);local.xy=vec2(a_uv.x-.5,.75-a_uv.y*1.5);local.x*=1.+.10*lower;local.y+=(.82-a_uv.y)*.15*lower;local.z=.01065+.100*u_depth;}
local.xy=local.xy*u_layerTransform.z+u_layerTransform.xy;
v_local=local;v_effects=a_effects;v_regions=a_regions;v_uv=a_uv;v_position=turn(local+u_shift)*u_zoom;
vec3 normal=a_normal;if(u_pop)normal=normalize(vec3(normal.xy*u_volume*u_depth,normal.z));v_normal=turn(normal);
gl_Position=u_projection*vec4(v_position+vec3(0.,0.,-4.35),1.);}`;
const fs=`
precision highp float;
varying vec3 v_position; varying vec3 v_normal; varying vec2 v_uv; varying vec4 v_effects; varying vec4 v_regions; varying vec3 v_local;
uniform vec3 u_color; uniform vec3 u_borderColor; uniform vec2 u_view;
uniform float u_layerOpacity; uniform float u_mask; uniform float u_energyStyle; uniform float u_metal; uniform float u_rough; uniform float u_time; uniform float u_flowGain; uniform float u_frameGain; uniform float u_shineGain; uniform float u_environmentGain; uniform float u_finish; uniform float u_foilGain; uniform float u_pulse;
uniform bool u_textured; uniform bool u_clay; uniform bool u_wire; uniform bool u_foreground; uniform bool u_bottom; uniform bool u_border; uniform bool u_logo; uniform bool u_energy; uniform bool u_backgroundPlane; uniform bool u_shadows;
uniform vec2 u_backgroundShift; uniform sampler2D u_texture;
float band(vec2 p,vec2 a,vec2 b,float w){vec2 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.,1.);return 1.-smoothstep(w,w*2.,length(p-a-d*t));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 rainbow(float x){return .5+.5*cos(6.2831853*(x+vec3(0.,.33,.67)));}
float luminance(vec3 p){return dot(p,vec3(.2126,.7152,.0722));}
void main(){
if(u_foreground){
float aperture=max(max(abs(v_local.x)-.478,abs(v_local.y)-.728),abs(v_local.x)+abs(v_local.y)-1.156);
// Behind cloth is confined to the opening; outside art clears the front rim.
if(aperture>0.&&v_local.z<.024)discard;
}
if(u_wire){gl_FragColor=vec4(.54,.78,.70,1.);return;}
if(u_energy){
vec2 p=v_uv;float jitter=sin(p.y*107.-u_time*6.2831853)*sin(p.y*53.+u_time*3.14159265)*.0035;
p.x+=jitter;
float arc=max(band(p,vec2(.830,.497),vec2(.983,.738),.0014),band(p,vec2(.983,.738),vec2(.900,.809),.0013));
float pace=pow(.5+.5*sin(p.y*42.-u_time*6.2831853),5.);
float fork=band(p,vec2(.859,.559),vec2(.824,.550),.0009)*band(p,vec2(.824,.550),vec2(.798,.515),.027);
float flash=pow(max(0.,sin(u_time*6.2831853)),14.)+pow(max(0.,sin(u_time*6.2831853+2.1)),22.)*.48;
float alpha=max(arc,fork)*(.06+.32*pace+.60*flash+.75*u_pulse)*u_flowGain;
vec3 energyColor=u_energyStyle<.5?vec3(.48,.79,1.):vec3(1.,.56,.17);
if(alpha<.012)discard;gl_FragColor=vec4(mix(energyColor,vec3(1.),min(.8,flash+u_pulse)),alpha);return;
}
vec2 uv=v_uv;if(u_backgroundPlane)uv+=vec2(-u_backgroundShift.x/1.18,u_backgroundShift.y/1.77);
if(u_mask>0.){
 float weight=0.;if(u_foreground){if(u_mask<1.5)weight=v_effects.x;else if(u_mask<2.5)weight=v_effects.y;else if(u_mask<3.5)weight=v_effects.z;else if(u_mask<4.5)weight=v_effects.w;else weight=v_regions.x;}
 gl_FragColor=vec4(vec3(weight),1.);return;
}
vec4 texel=u_textured?texture2D(u_texture,uv):vec4(u_color,1.);
if(texel.a<.02)discard;
vec3 n=normalize(v_normal),l=normalize(vec3(-.65,.85,1.1)),v=normalize(vec3(0.,0.,4.35)-v_position),h=normalize(l+v);
float diffuse=max(dot(n,l),0.),spec=pow(max(dot(n,h),0.),mix(70.,12.,u_rough));
if(u_clay){gl_FragColor=vec4(vec3(.65,.70,.68)*(.38+.62*diffuse)+spec*.15,1.);return;}
if(u_logo){
float sweep=fract(u_time/6.+u_view.x*.7+u_view.y*.4)*1.7-.35;
float shine=pow(max(0.,1.-abs(v_uv.x-v_uv.y*.19-sweep)/.12),3.)*u_shineGain;
vec3 col=texel.rgb+vec3(.80,.91,1.)*shine;gl_FragColor=vec4(col,texel.a*u_layerOpacity);return;
}
if(u_border){
float angular=atan(v_local.y/1.5,v_local.x);
float flow=pow(.5+.5*sin(angular*3.-u_time*3.14159265),12.)*u_frameGain;
float edge=pow(1.-abs(dot(n,v)),2.);
vec3 base=u_borderColor;
if(u_finish==4.)base=mix(base,rainbow(angular/6.2831853-u_time/6.),.35);
vec3 col=base*(.48+.52*diffuse)+vec3(.55,.67,.87)*spec*.6+base*flow*.70+vec3(.40,.45,.7)*edge*.3;
gl_FragColor=vec4(col,u_layerOpacity);return;
}
if(!u_textured){gl_FragColor=vec4(u_color*(.35+.65*diffuse)+vec3(1.,.79,.55)*spec*(.2+u_metal*.8),1.);return;}
vec3 col=texel.rgb;
if(u_backgroundPlane){
if(u_environmentGain>0.){
float mist=exp(-pow((uv.y-(.59+.025*sin(uv.x*9.+u_time*1.04719755)))/.09,2.));
float drift=.5+.5*sin(uv.x*20.-u_time*1.04719755+sin(uv.y*22.));
col=mix(col,vec3(.62,.74,.73),mist*drift*.085*u_environmentGain);
}
if(u_finish==1.){
vec2 grid=uv*vec2(8.,12.);vec2 cell=floor(grid);vec2 f=fract(grid);
float facet=step(f.x,f.y);float phase=hash(cell)+facet*.13+u_view.x*.7-u_view.y*.4;
vec3 foil=rainbow(phase)*.82+.20;
float beam=pow(max(0.,1.-abs(fract(uv.x*.72+uv.y*.38+u_view.x*.35)-.52)/.28),2.);
col=mix(col,col*.58+foil*(.32+beam*.20),u_foilGain*.72);
}else if(u_finish==2.){
float grain=hash(floor(uv*vec2(500.,750.)));float gold=luminance(col);
vec3 gilded=vec3(1.,.66,.18)*(.18+gold*.84)+vec3(.24,.15,.035)*grain*.13;
col=mix(col,gilded,u_foilGain);
}
}
if(u_finish==3.)col=vec3(luminance(col));
if(u_foreground&&u_shadows)col*=1.-(1.-diffuse)*.065;
if(u_foreground&&u_flowGain>0.&&v_effects.z>0.){
float groove=max(band(v_uv,vec2(.595,.723),vec2(.843,.514),.007),max(band(v_uv,vec2(.647,.718),vec2(.805,.670),.010),band(v_uv,vec2(.805,.670),vec2(.843,.554),.009)));
float gold=smoothstep(.25,.65,texel.r)*smoothstep(.09,.26,texel.r-texel.b);
float ripple=sin(v_effects.w*30.-u_time*3.14159265+sin(v_uv.y*65.+u_time*1.04719755)*.8);
float stream=.18+.82*pow(.5+.5*ripple,3.);
vec3 energyColor=u_energyStyle<.5?vec3(.35,.72,1.):vec3(1.,.56,.12);
if(u_energyStyle<.5)col=mix(col,vec3(luminance(col))*.72,groove*gold*v_effects.z*.55);
col+=energyColor*groove*gold*v_effects.z*(stream*.85+u_pulse*1.3)*u_flowGain;
}
gl_FragColor=vec4(col,texel.a*u_layerOpacity);
}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const a={},u={};["position","normal","uv","background","effects","regions","popBase"].forEach(k=>a[k]=gl.getAttribLocation(program,"a_"+k));
["layerTransform","layerOpacity","projection","angles","shift","zoom","depth","volume","time","capeGain","capeLayout","pop","capeInset","breakout","bottom","energy","color","borderColor","view","mask","energyStyle","metal","rough","flowGain","frameGain","shineGain","environmentGain","finish","foilGain","pulse","textured","clay","wire","foreground","border","logo","backgroundPlane","shadows","backgroundShift","texture"].forEach(k=>u[k]=gl.getUniformLocation(program,"u_"+k));
const parts=[...original.parts.filter(p=>["body","art_back","emblem","cloth","ill_background"].includes(p.group)),...snap.parts];
function quad(name,group,x0,y0,x1,y1,z,uv){return {name,group,positions:[x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z],normals:[0,0,1,0,0,1,0,0,1,0,0,1],indices:[0,1,2,0,2,3],color:[1,1,1],metal:0,rough:1,uv};}
const logo=quad("CharacterWordmark","logo",-.495,-.742,.495,-.595,.12,[0,1,1,1,1,0,0,0]);logo.texture="wordmark";parts.push(logo);
const energy=quad("WeaponEdgeEnergy","energy",0,0,0,0,.11,[.56,.89,1.025,.89,1.025,.475,.56,.475]);parts.push(energy);
const textures={},loaded=new Set();
function newTexture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([40,48,44,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function buffer(data,target,type){const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,new type(data),gl.STATIC_DRAW);return b;}
for(const p of parts){
const count=p.positions.length/3;p.pos=buffer(p.positions,gl.ARRAY_BUFFER,Float32Array);p.norm=buffer(p.normals,gl.ARRAY_BUFFER,Float32Array);p.tex=buffer(p.uv||new Array(count*2).fill(0),gl.ARRAY_BUFFER,Float32Array);p.effect=buffer(p.effects||new Array(count*4).fill(0),gl.ARRAY_BUFFER,Float32Array);p.region=buffer(p.regions||new Array(count*4).fill(0),gl.ARRAY_BUFFER,Float32Array);p.popBase=buffer(p.popBase||p.positions,gl.ARRAY_BUFFER,Float32Array);p.idx=buffer(p.indices,gl.ELEMENT_ARRAY_BUFFER,Uint16Array);
const lines=[];for(let i=0;i<p.indices.length;i+=3){const x=p.indices[i],y=p.indices[i+1],z=p.indices[i+2];lines.push(x,y,y,z,z,x);}p.lines=buffer(lines,gl.ELEMENT_ARRAY_BUFFER,Uint16Array);p.lineCount=lines.length;
if(p.texture&&!textures[p.texture]){textures[p.texture]=newTexture();if(p.texture==="wordmark")continue;const im=new Image();im.onload=()=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);loaded.add(p.texture);requestDraw();};im.onerror=()=>{info.textContent="原画载入失败，可检查网络或切到白模。";};im.src=p.texture;}
}
function makeWordmark(){const c=document.createElement("canvas");c.width=768;c.height=192;const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.textAlign="center";ctx.textBaseline="middle";ctx.font='italic 800 112px "STKaiti","Songti SC","Noto Serif SC",serif';ctx.lineJoin="round";ctx.strokeStyle="#181922";ctx.lineWidth=12;ctx.shadowColor="#0009";ctx.shadowBlur=9;ctx.shadowOffsetY=4;ctx.strokeText(titleText,384,102);ctx.shadowBlur=0;ctx.shadowOffsetY=0;const grad=ctx.createLinearGradient(0,40,0,160);grad.addColorStop(0,"#fff9db");grad.addColorStop(.42,"#edddae");grad.addColorStop(.48,"#fff6d6");grad.addColorStop(1,"#a37c50");ctx.fillStyle=grad;ctx.fillText(titleText,384,102);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.wordmark);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);loaded.add("wordmark");}
const state={tier:6,yaw:0,pitch:0,targetYaw:0,targetPitch:0,zoom:1.12,depth:1,background:1,volume:1,mode:"parallax",breakout:true,cape:true,flow:true,capeInset:true,capeLayout:0,shadows:true,wire:false,exploded:false,freeRotate:false,paused:false,time:0,finish:0,energyStyle:0,mask:0,foil:.70,wordmark:true,frame:true,shine:true,burstStart:-10000};
let renderCount=0;
let previewActive=true,effectsEnabled=true;
let tickHandle=0,lastTick=performance.now(),lastDraw=0,animationOrigin=performance.now(),inViewport=true;
const reduced=matchMedia("(prefers-reduced-motion: reduce)");
function facing(){return Math.cos(state.yaw*Math.PI/180)*Math.cos(state.pitch*Math.PI/180);}
function viewActive(){return previewActive&&!document.hidden&&inViewport;}
function fxEnabled(){return effectsEnabled&&viewActive()&&!reduced.matches&&!state.paused&&state.mode==="parallax"&&state.mask===0&&!state.exploded&&state.breakout&&state.depth>0&&facing()>.12&&(state.cape||state.flow||state.frame||state.shine);}
function moving(){return Math.abs(state.targetYaw-state.yaw)>.015||Math.abs(state.targetPitch-state.pitch)>.015;}
function burst(){const t=(performance.now()-state.burstStart)/900;return t>=0&&t<1?Math.pow(Math.sin(t*Math.PI),2.):0;}
function schedule(){if(tickHandle)return;if(viewActive()&&(fxEnabled()||moving()||burst()>0))tickHandle=requestAnimationFrame(tick);}
function tick(now){tickHandle=0;const dt=Math.min(.1,(now-lastTick)/1000);lastTick=now;const lerp=1-Math.exp(-dt/cfg.camera.responseSeconds);state.yaw+=(state.targetYaw-state.yaw)*lerp;state.pitch+=(state.targetPitch-state.pitch)*lerp;if(!moving()){state.yaw=state.targetYaw;state.pitch=state.targetPitch;}if(fxEnabled())state.time=((now-animationOrigin)/1000)%6;
const hz=moving()?60:30;if(now-lastDraw>=1000/hz-1||(!moving()&&!fxEnabled()&&burst()===0)){lastDraw=now;draw();}else schedule();}
function requestDraw(){draw();}
function setPose(yaw,pitch=0,immediate=false){state.targetYaw=yaw;state.targetPitch=pitch;if(immediate||reduced.matches){state.yaw=yaw;state.pitch=pitch;}lastTick=performance.now();requestDraw();}
function projection(aspect){const f=Math.min(1,aspect/.85)/Math.tan(26*Math.PI/360),near=.1,far=10;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
function backgroundShift(){if(state.volume===0||state.depth===0||state.exploded||state.mode!=="parallax")return [0,0];const yaw=state.yaw*Math.PI/180,pitch=state.pitch*Math.PI/180,side=Math.min(1,Math.max(0,(facing()-.2)/.69)),gain=state.background*Math.min(1,state.depth)*side;return [-.055*Math.max(-1,Math.min(1,Math.sin(yaw)/Math.sin(Math.PI/10)))*gain,.065*Math.max(-1,Math.min(1,Math.sin(pitch)/Math.sin(8*Math.PI/180)))*gain];}
function shift(p){if(!state.exploded)return [0,0,0];return {body:[0,0,0],snap_frame:[0,0,.46],snap_background:[0,0,.1],pop_foreground:[0,0,.32],pop_bottom:[0,0,.32],art_back:[0,0,-.2],emblem:[0,0,-.48],cloth:[0,0,-.4],ill_background:[0,0,.1],logo:[0,0,.66]}[p.group]||[0,0,0];}
function attr(b,n,size){if(n<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,size,gl.FLOAT,false,0,0);}
function bool(key,value){gl.uniform1i(u[key],value?1:0);}
function draw(){
if(!previewActive)return;renderCount++;
const ratio=Math.min(devicePixelRatio||1,1.75),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);if(!w||!h)return;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.useProgram(program);
const side=Math.min(1,Math.max(.015,(facing()-.20)/.69)),flat=state.mode==="flat",clay=state.mode==="clay",depth=flat?0:state.depth*(state.exploded?1:side),pop=state.breakout&&!flat&&depth>0,baked=false;
gl.uniformMatrix4fv(u.projection,false,projection(w/h));gl.uniform2f(u.angles,state.yaw*Math.PI/180,state.pitch*Math.PI/180);gl.uniform2f(u.view,Math.sin(state.yaw*Math.PI/180),Math.sin(state.pitch*Math.PI/180));gl.uniform1f(u.zoom,state.exploded?.78:state.zoom);gl.uniform1f(u.depth,depth);gl.uniform1f(u.volume,state.volume);gl.uniform1f(u.time,state.time);gl.uniform1f(u.capeGain,effectsEnabled&&state.cape&&!state.exploded?1:0);gl.uniform1f(u.capeLayout,state.capeLayout);gl.uniform1f(u.flowGain,effectsEnabled&&state.flow&&!flat&&!clay&&!state.exploded&&pop?1:0);gl.uniform1f(u.environmentGain,effectsEnabled&&state.cape&&!flat&&!clay&&!state.exploded?1:0);gl.uniform1f(u.frameGain,effectsEnabled&&state.frame&&!flat&&!clay&&!state.exploded?1:0);gl.uniform1f(u.shineGain,effectsEnabled&&state.shine&&!flat&&!clay&&!state.exploded?1:0);gl.uniform1f(u.mask,state.mask);gl.uniform1f(u.energyStyle,state.energyStyle);gl.uniform1f(u.pulse,burst());gl.uniform1f(u.foilGain,state.foil);gl.uniform1f(u.finish,state.finish===0&&state.tier===6?4:state.finish);gl.uniform3fv(u.borderColor,cfg.levels[state.tier].color);gl.uniform2fv(u.backgroundShift,baked?[0,0]:backgroundShift());gl.uniform1i(u.texture,0);bool("breakout",pop);bool("capeInset",state.capeInset);bool("shadows",state.shadows);bool("clay",clay);
let tri=0,drawn=0;
for(const p of parts){
const layer=documentLayers.find(l=>l.id===p.name||({pop_foreground:'foreground',flat_art:'foreground',energy:'foreground',snap_background:'background',snap_frame:'frame',logo:'title'}[p.group]===l.id));
if(layer?.visible===false)continue;if(p.group==='custom_image'&&!layer)continue;
if(p.group==='custom_image'&&facing()<=.035)continue;
gl.uniform3f(u.layerTransform,layer?(layer.x/1024):0,layer?(-layer.y/1536*1.5):0,layer?.scale||1);gl.uniform1f(u.layerOpacity,layer?.opacity??1);
if(p.group==="flat_art"&&!baked)continue;if(["pop_foreground","snap_background"].includes(p.group)&&baked)continue;
if(["emblem","cloth"].includes(p.group)&&!clay)continue;if(p.group==="ill_background"&&!state.exploded)continue;if(p.group==="art_back"&&clay)continue;
if(["pop_foreground","flat_art","logo","energy"].includes(p.group)&&facing()<=.035&&!state.exploded)continue;
if(p.group==="logo"&&(!state.wordmark||clay||state.mask>0))continue;if(p.group==="energy"&&(state.mask>0||!state.flow||!pop||clay||state.exploded))continue;
attr(p.pos,a.position,3);attr(p.norm,a.normal,3);attr(p.tex,a.uv,2);attr(p.effect,a.effects,4);attr(p.region,a.regions,4);attr(p.popBase,a.popBase,3);gl.uniform3fv(u.shift,shift(p));gl.uniform3fv(u.color,p.color);gl.uniform1f(u.metal,p.metal);gl.uniform1f(u.rough,p.rough);
bool("pop",p.group==="pop_foreground");bool("foreground",p.group==="pop_foreground");bool("bottom",p.group==="pop_bottom");bool("border",p.group==="snap_frame");bool("logo",p.group==="logo");bool("energy",p.group==="energy");bool("backgroundPlane",["snap_background","ill_background"].includes(p.group));bool("textured",!!p.texture);bool("wire",false);
if(p.texture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);}
const alpha=["logo","energy","custom_image","pop_foreground"].includes(p.group)||(layer?.opacity??1)<1;if(alpha){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}else{gl.disable(gl.BLEND);gl.depthMask(true);}
if(state.wire){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.idx);gl.drawElements(gl.TRIANGLES,p.indices.length,gl.UNSIGNED_SHORT,0);gl.disable(gl.POLYGON_OFFSET_FILL);tri+=p.indices.length/3;drawn++;
if(state.wire){bool("wire",true);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.lines);gl.drawElements(gl.LINES,p.lineCount,gl.UNSIGNED_SHORT,0);}
}
gl.depthMask(true);gl.disable(gl.BLEND);
const angle=Math.round(state.yaw>180?state.yaw-360:state.yaw);
info.textContent=tri+" 三角面 / "+drawn+" 部件";
Object.assign(canvas.dataset,{angle:String(angle),triangles:String(tri),parts:String(drawn),mode:state.mode,loaded:String(loaded.size),depth:String(state.depth),volume:String(state.volume),tier:cfg.levels[state.tier].id,breakout:String(pop),capeMotion:String(state.cape),weaponFlow:String(state.flow),capeInset:String(state.capeInset),capeLayout:["upper","lower","both"][state.capeLayout],artworkPath:baked?"full-bleed-composite":"complete-foreground-parallax",wordmark:String(state.wordmark),shinyLogo:String(state.shine),animatedFrame:String(state.frame),finish:cfg.finishes[state.finish].id,bottom:state.capeLayout===0?"pinned":"free-cape",registration:"master-uv",animating:String(fxEnabled()),settling:String(moving()),effectTime:state.time.toFixed(3),backgroundShift:JSON.stringify(backgroundShift().map(x=>+x.toFixed(5))),viewportActive:String(viewActive()),effectsEnabled:String(effectsEnabled),maskMode:String(state.mask),energyStyle:state.energyStyle===0?"thor-lightning":"amber-flow",renderCount:String(renderCount),renderTime:performance.now().toFixed(1),targetHz:String(moving()?cfg.timing.inspectionTargetHz:cfg.timing.focusTargetHz),armGuard:"rigid-bracer-hand-grip",clothDeformation:"depth-only-shared-xy",rimGuard:"aperture-clip-at-z-0.024",matchStatus:"thor-base-reference; visual-recreation; frame-by-frame-unverified"});
schedule();
}
let drag=null;
canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,yaw:state.targetYaw,pitch:state.targetPitch};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!drag){if(state.freeRotate||state.exploded||reduced.matches)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1;setPose(Math.max(-18,Math.min(18,x*14)),Math.max(-8,Math.min(8,y*6)));return;}if(state.freeRotate||state.exploded)setPose(drag.yaw+(e.clientX-drag.x)*.6,Math.max(-35,Math.min(35,drag.pitch+(e.clientY-drag.y)*.3)));else setPose(Math.max(-18,Math.min(18,drag.yaw+(e.clientX-drag.x)*.12)),Math.max(-8,Math.min(8,drag.pitch+(e.clientY-drag.y)*.06)));});
canvas.addEventListener("pointerup",()=>drag=null);canvas.addEventListener("pointercancel",()=>drag=null);canvas.addEventListener("lostpointercapture",()=>drag=null);window.addEventListener("pointerup",()=>drag=null);window.addEventListener("blur",()=>drag=null);canvas.addEventListener("pointerleave",()=>{if(!drag&&!state.freeRotate&&!state.exploded)setPose(0,0);});
document.addEventListener("visibilitychange",()=>{lastTick=performance.now();draw();});reduced.addEventListener("change",()=>{if(reduced.matches)setPose(state.targetYaw,state.targetPitch,true);draw();});
new ResizeObserver(()=>draw()).observe(canvas);new IntersectionObserver(entries=>{inViewport=entries[0].isIntersecting;lastTick=performance.now();draw();},{threshold:.02}).observe(canvas);

window.cardPreview={
    setActive(value){previewActive=!!value;if(tickHandle){cancelAnimationFrame(tickHandle);tickHandle=0;}canvas.dataset.viewportActive=String(previewActive);lastTick=performance.now();if(value)draw();},
    setEffectsEnabled(value){effectsEnabled=!!value;if(tickHandle){cancelAnimationFrame(tickHandle);tickHandle=0;}lastTick=performance.now();draw();},
    getView(){return {yaw:state.targetYaw,pitch:state.targetPitch,time:state.time};},
    setDocument(doc){currentDocument=doc;documentLayers=doc.layers;Object.assign(state,doc.effects);if(titleText!==doc.layers.find(l=>l.kind==='text')?.text){titleText=doc.layers.find(l=>l.kind==='text')?.text||'';makeWordmark();}draw();},
    updateMask(id,image){let changed=0;const channel={motion:0,inset:1,emission:2,phase:3}[id];if(channel===undefined)return;for(const p of parts.filter(p=>p.group==='pop_foreground')){for(let i=0;i<p.uv.length/2;i++){const x=Math.max(0,Math.min(image.width-1,Math.round(p.uv[i*2]*(image.width-1)))),y=Math.max(0,Math.min(image.height-1,Math.round(p.uv[i*2+1]*(image.height-1))));let v=image.data[(y*image.width+x)*4]/255;if(id==='motion')v*=1-(p.regions?.[i*4]||0);if(Math.abs(p.effects[i*4+channel]-v)>.00001)changed++;p.effects[i*4+channel]=v;}gl.bindBuffer(gl.ARRAY_BUFFER,p.effect);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(p.effects));}canvas.dataset.lastMask=id;canvas.dataset.changedVertices=String(changed);draw();},
    setTexture(group,image){for(const p of parts.filter(p=>p.group===group)){if(!p.texture)continue;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}draw();},
    setText(layer,image){logo.positions=[-.5,-.75,.12,.5,-.75,.12,.5,.75,.12,-.5,.75,.12];gl.bindBuffer(gl.ARRAY_BUFFER,logo.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(logo.positions));gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures.wordmark);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);draw();},
    addImage(layer,image){let p=parts.find(p=>p.name===layer.id);if(!p){p=quad(layer.id,'custom_image',-.5,-.75,.5,.75,.115,[0,1,1,1,1,0,0,0]);p.texture=layer.id;parts.push(p);const count=4;p.pos=buffer(p.positions,gl.ARRAY_BUFFER,Float32Array);p.norm=buffer(p.normals,gl.ARRAY_BUFFER,Float32Array);p.tex=buffer(p.uv,gl.ARRAY_BUFFER,Float32Array);p.effect=buffer(new Array(16).fill(0),gl.ARRAY_BUFFER,Float32Array);p.region=buffer(new Array(16).fill(0),gl.ARRAY_BUFFER,Float32Array);p.popBase=buffer(p.positions,gl.ARRAY_BUFFER,Float32Array);p.idx=buffer(p.indices,gl.ELEMENT_ARRAY_BUFFER,Uint16Array);p.lines=buffer([0,1,1,2,2,3,3,0],gl.ELEMENT_ARRAY_BUFFER,Uint16Array);p.lineCount=8;textures[p.texture]=newTexture();}gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[p.texture]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);draw();},
    pose(yaw,pitch=0){state.freeRotate=true;setPose(yaw,pitch,true);},
    setTime(t){state.time=t;state.paused=true;draw();},
    showWire(value){state.wire=value;draw();},
    burst(){state.burstStart=performance.now();draw();}
  };
makeWordmark();draw();
})();
