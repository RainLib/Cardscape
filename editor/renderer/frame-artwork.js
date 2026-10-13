/* Approved frame artwork stays in ordinary, portable component image layers. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./frame-model.js'):root.CardFrame);if(typeof module==='object'&&module.exports)module.exports=api;else root.CardFrameArtwork=api;})(typeof window==='object'?window:this,F=>{
'use strict';
const sources={metal:'assets/frames/stellar-metal-v2.png',flow:'assets/frames/stellar-flow.png'};
const images=new Map(),pending=new Map();let prepared=null,preparing=null;
// Perimeter distance, rather than polar angle, keeps a constant travel speed.
// The same portable math runs in WebGL and exported Godot materials.
const flowPrelude=`vec2 stellarCorner(int i){
 if(i==0)return vec2(.14,.085);if(i==1)return vec2(.86,.085);
 if(i==2)return vec2(.935,.16);if(i==3)return vec2(.935,1.335);
 if(i==4)return vec2(.86,1.41);if(i==5)return vec2(.14,1.41);
 if(i==6)return vec2(.065,1.335);return vec2(.065,.16);
}
float stellarPhase(vec2 p){
 float nearest=10.,phase=0.,offset=0.;
 for(int i=0;i<8;i++){vec2 a=stellarCorner(i),b=stellarCorner(i==7?0:i+1),d=b-a;
  float span=length(d),h=clamp(dot(p-a,d)/dot(d,d),0.,1.),distance=length(p-a-d*h);
  if(distance<nearest){nearest=distance;phase=offset+span*h;}offset+=span;
 }return phase/4.214264;
}
vec2 stellarPoint(float phase){
 float distance=fract(phase)*4.214264,offset=0.;vec2 result=stellarCorner(0);
 for(int i=0;i<8;i++){vec2 a=stellarCorner(i),b=stellarCorner(i==7?0:i+1);float span=length(b-a);
  if(distance>=offset&&distance<offset+span)result=mix(a,b,(distance-offset)/span);offset+=span;
 }return result;
}
float stellarFront(float phase){return smoothstep(-.14,.14,sin(phase*37.699112+.4));}
float stellarStar(vec2 p){
 float core=exp(-dot(p,p)/.000030);
 float rayX=exp(-abs(p.x)/.017-abs(p.y)/.0011);
 float rayY=exp(-abs(p.x)/.0011-abs(p.y)/.022);
 return core+.38*(rayX+rayY);
}`;
const flowBody=`if(surfaceChannel<.5)return color;
vec2 p=uv*vec2(1.,1.5);
float path=stellarPhase(p);
if(surfaceChannel<1.5){
 vec3 eye=normalize(surfaceEye);
 float bright=smoothstep(.35,.90,dot(color.rgb,vec3(.2126,.7152,.0722)));
 float silver=1.-smoothstep(.08,.30,abs(color.r-color.b));
 float scan=exp(-pow((fract(path+eye.x*.18+eye.y*.12+.13)-.5)/.06,2.));
 float gem=smoothstep(.12,.38,color.b-color.r);
 vec3 shine=mix(vec3(1.,.87,.65),vec3(.67,.88,1.),silver);
 return vec4(clamp(color.rgb+shine*scan*(bright*.34+gem*.23),0.,1.),color.a);
}
// Advect the transparent ribbon itself; metal and fixed corner stars stay still.
// Both depth planes use the same displacement and complementary moving masks.
float phase=fract(time*.25);
vec2 tangent=normalize(stellarPoint(path+.0005)-stellarPoint(path-.0005));
vec2 normal=vec2(-tangent.y,tangent.x);
float wave=.007*(sin(phase*6.283185-path*18.849556)-sin(-path*18.849556))+.003*(sin(phase*12.566371+path*31.415927)-sin(path*31.415927));
float slide=.006*(sin(phase*6.283185+path*12.566371)-sin(path*12.566371));
vec2 sourceUV=(p-normal*wave-tangent*slide)/vec2(1.,1.5);
color=sampleSource(sourceUV);
if(color.a<.01)color=vec4(0.);
float ribbonPath=stellarPhase(sourceUV*vec2(1.,1.5));
float front=stellarFront(ribbonPath);
float coverage=surfaceChannel>2.5?front:1.-front;
float headA=exp(-pow((fract(ribbonPath-phase+.5)-.5)/.040,2.));
float headB=exp(-pow((fract(ribbonPath+phase+.03)-.5)/.065,2.));
vec3 rgb=color.rgb*(.92+.30*headA+.22*headB);
float alpha=color.a*coverage;
vec3 energy=rgb*alpha;float glowAlpha=0.;
for(int i=0;i<6;i++){
 float lane=mod(float(i),2.),direction=lane<.5?1.:-1.;
 float travel=fract(phase*direction+float(i)*.167);
 vec2 point=stellarPoint(travel),normal=normalize(point-vec2(.5,.7475));
 point+=normal*(.016+.023*sin(travel*37.699112+.4+lane*3.141593));
 float frontStar=stellarFront(travel),plane=surfaceChannel>2.5?frontStar:1.-frontStar;
 float spark=stellarStar(p-point)*plane;
 vec3 tint=mix(vec3(.40,.85,1.),vec3(.73,.49,1.),lane);
 energy+=mix(tint,vec3(1.),min(1.,spark))*spark*.65;
 glowAlpha+=spark*.64;
}
alpha=clamp(alpha+glowAlpha,0.,1.);
return vec4(clamp(energy/max(alpha,.0001),0.,1.),alpha);`;
function value(style,art){
 if(!art?.metal||!art?.flow)throw Error('先准备原稿边框素材');
 const layer=(id,name,src,z,shaderChannel)=>({id,name,kind:'image',role:'frame-artwork',shaderChannel,shaderTransparent:shaderChannel>1,src,x:0,y:0,scale:1.14,opacity:1,visible:true,locked:false,spatial:{role:'surface',z,clip:false}});
 return {schema:'card-frame/1',style:{...style},document:{schema:'card-atelier/1',id:'stellar-frame-art',name:'星辉能量 · 原稿素材',assetKind:'frame',width:1024,height:1536,previewMode:'authored',frameStyle:{...style},spatial:{schema:'card-spatial/1',enabled:true,cameraDistance:2.7},composition:{top:false,bottom:false,left:false,right:false},layers:[layer('stellar-flow','蓝紫流光 · 框前',art.flow,.004,3),layer('stellar-metal','银金框体与星饰',art.metal,.001,1),{id:'frame',name:'平直框体 · 厚度与内窗',kind:'frame',x:0,y:0,scale:1,opacity:1,visible:true,locked:false},layer('stellar-flow-rear','蓝紫流光 · 框后',art.flow,-.002,2)],masks:art.masks||{},...(art.back?{back:art.back}:{}),effects:{depth:1,background:0,cape:false,flow:false,frame:true,paused:false},deformation:{bend:0,wind:0,speed:1},shader:{editorMode:'glsl',geometryBody:'return q;',fragmentPrelude:flowPrelude,fragmentBody:flowBody,fragmentTarget:'all',fragmentMask:'none',fragmentStrength:1},actions:[{id:'idle',name:'沿框流光',event:'idle',duration:4,loop:true,motion:0,emission:1,bend:0}],slots:[]}};
}
async function prepare(loader,maskFactory){
 if(prepared)return prepared;if(preparing)return preparing;
 preparing=(async()=>{const [metal,flow]=await Promise.all(Object.values(sources).map(loader));if(![metal,flow].every(s=>typeof s==='string'&&/^data:image\/png;base64,/.test(s)))throw Error('边框生产素材编码无效');const masks=maskFactory?maskFactory():{};prepared={metal,flow,...masks};return prepared;})().catch(e=>{preparing=null;throw e;});return preparing;
}
function current(){return prepared;}
// The editor's static image keeps the same front/rear partition as the shader.
// Source PNGs and layer transforms stay untouched; only cached canvas alpha changes.
const pathCorners=[[.14,.085],[.86,.085],[.935,.16],[.935,1.335],[.86,1.41],[.14,1.41],[.065,1.335],[.065,.16]];
const pathSegments=pathCorners.map((a,i)=>{const b=pathCorners[(i+1)%8],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);return {x:a[0],y:a[1],dx,dy,length,squared:length*length};});
let pathOffset=0;for(const segment of pathSegments){segment.offset=pathOffset;pathOffset+=segment.length;}
function frontCoverage(u,v){
 let nearest=Infinity,phase=0;const y=v*1.5;
 for(const s of pathSegments){const x=u-s.x,dy=y-s.y,t=Math.max(0,Math.min(1,(x*s.dx+dy*s.dy)/s.squared)),distance=(x-s.dx*t)**2+(dy-s.dy*t)**2;if(distance<nearest){nearest=distance;phase=(s.offset+s.length*t)/4.214264;}}
 const t=Math.max(0,Math.min(1,(Math.sin(phase*37.699112+.4)+.14)/.28));return t*t*(3-2*t);
}
function createStaticRasterizer(makeCanvas=()=>document.createElement('canvas')){
 const cache=new Map();let bytes=0,renders=0,hits=0;const maxBytes=32*1024*1024;
 function imageForLayer(layer,source){
  if(!source||layer.role!=='frame-artwork'||![2,3].includes(layer.shaderChannel))return source;
  if(cache.has(source)){const entry=cache.get(source);cache.delete(source);cache.set(source,entry);hits++;return layer.shaderChannel===3?entry.front:entry.rear;}
  const sourceWidth=source.naturalWidth||source.width,sourceHeight=source.naturalHeight||source.height;if(!sourceWidth||!sourceHeight)return source;
  const scale=Math.min(1,1024/sourceWidth,1536/sourceHeight),width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
  const front=makeCanvas(),rear=makeCanvas();front.width=rear.width=width;front.height=rear.height=height;
  const fc=front.getContext('2d',{willReadFrequently:true}),rc=rear.getContext('2d');fc.drawImage(source,0,0,width,height);
  const original=fc.getImageData(0,0,width,height),back=rc.createImageData(width,height);back.data.set(original.data);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4+3,alpha=original.data[at];if(!alpha)continue;const covered=Math.round(alpha*frontCoverage((x+.5)/width,(y+.5)/height));original.data[at]=covered;back.data[at]=alpha-covered;}
  fc.putImageData(original,0,0);rc.putImageData(back,0,0);const size=width*height*8;
  while(cache.size&&(bytes+size>maxBytes||cache.size>=4)){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}
  cache.set(source,{front,rear,bytes:size});bytes+=size;renders++;return layer.shaderChannel===3?front:rear;
 }
 return {imageForLayer,stats:()=>({entries:cache.size,bytes,renders,hits,maxBytes}),clear(){cache.clear();bytes=0;}};
}
let staticRasterizer=null;const rasterizer=()=>staticRasterizer||(staticRasterizer=createStaticRasterizer());
const imageForLayer=(layer,image)=>rasterizer().imageForLayer(layer,image);
const sceneDocument=doc=>doc?.componentScenes?.frame?.document||(doc?.assetKind==='frame'?doc:null);
async function loadDocument(doc,loader){
 const scene=sceneDocument(doc);if(!scene)return;
 await Promise.all(scene.layers.filter(l=>l.visible&&l.src).map(async l=>{if(images.has(l.src))return;if(!pending.has(l.src))pending.set(l.src,Promise.resolve(loader(l.src)).then(im=>{images.set(l.src,im);while(images.size>12)images.delete(images.keys().next().value);}).finally(()=>pending.delete(l.src)));await pending.get(l.src);}));
}
function draw(ctx,scene){
 const d=scene?.document;if(!d)return false;
 if(d.layers.some(l=>l.visible&&!l.previewReference&&l.src&&!images.has(l.src)))return false;
 for(const l of [...d.layers].reverse().filter(l=>l.visible&&!l.previewReference)){
  ctx.save();ctx.globalAlpha*=l.opacity??1;ctx.globalCompositeOperation=l.blend==='add'?'lighter':'source-over';ctx.translate(512+(l.x||0),768+(l.y||0));ctx.rotate((l.rotation||0)*Math.PI/180);ctx.scale(l.scale||1,l.scale||1);ctx.translate(-512,-768);
  if(l.kind==='frame')F.draw(ctx,F.resolve(d));else if(l.src)ctx.drawImage(imageForLayer(l,images.get(l.src)),0,0,1024,1536);ctx.restore();
 }
 return true;
}
function preview(doc,makeCanvas=()=>document.createElement('canvas')){
 const d=sceneDocument(doc);if(!d?.layers.some(l=>l.role==='frame-artwork'&&l.src))return null;
 let pad=0;
 for(const layer of d.layers.filter(l=>l.visible&&!l.previewReference)){
  const margin=layer.kind==='frame'&&F.hasAura(F.resolve(d))?F.auraPadding(F.resolve(d)):0,scale=layer.scale??1,angle=(layer.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  for(const [x,y] of [[-margin,-margin],[1024+margin,-margin],[1024+margin,1536+margin],[-margin,1536+margin]]){const dx=(x-512)*scale,dy=(y-768)*scale,px=512+(layer.x||0)+dx*cos-dy*sin,py=768+(layer.y||0)+dx*sin+dy*cos;pad=Math.max(pad,-px,px-1024,-py,py-1536);}
 }
 pad=Math.ceil(pad);if(pad>512)throw Error('边框辅助预览超出 512 px 外扩范围，请调整组件图层位置或缩放');
 const canvas=makeCanvas(),bounds={x:-pad||0,y:-pad||0,width:1024+pad*2,height:1536+pad*2};canvas.width=bounds.width;canvas.height=bounds.height;const ctx=canvas.getContext('2d');ctx.translate(pad,pad);
 if(!draw(ctx,{document:d}))throw Error('边框辅助预览素材尚未准备完成');return {src:canvas.toDataURL('image/png'),bounds,time:0};
}
return {sources,flowPrelude,flowBody,value,prepare,current,loadDocument,draw,createStaticRasterizer,imageForLayer,preview};
});
