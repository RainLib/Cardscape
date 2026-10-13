/* Shared visual components. All distances are card-local units (width = 1). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardComponents=api;})(typeof window==='object'?window:this,()=>{
'use strict';
const materialStyles=['iridescent','holographic','foil','prism','gold','ink','copper','steel','goldprism','blackprism','cosmic','glass','fire','water','rays','refraction','psychedelic','foilmetallic','goldmetallic','gildedprism','glasscircuits','wakandanglass','galacticstorm','bananas','symbiote','circuits','frosted','raysrainbow','caustics','rayspurple'];
const particleVisuals=['dust','glimmer','krackle','streak','ember','snow','confetti','diamond','bubble','sprite','orb','mixed','tech','banana','pixel','heart','leaf','tone','shard','cosmic','wakanda','flower','paw','pizza','starcore','adamantium'];
const materialDefaults={schema:'card-material/1',enabled:false,style:'iridescent',target:'both',strength:.3,speed:.25,frequency:4,color:'#78cfff',accent:'#fa8dde',backgroundMode:'overlay'};
const particleDefaults={schema:'card-particles/1',enabled:false,count:64,lifetime:3,speed:.25,spread:.5,size:.012,color:'#ffcb79',seed:1,z:-.08,visual:'dust',palette:'solid',stretch:1,blend:'add',sprite:'',spriteTint:false,trajectory:'outward',radius:.06,opacity:1,placement:'behind'};
const revealDefaults={enabled:false,duration:.24,count:44,size:.025,travel:.18,stretch:8,visual:'streak',only:false,profile:'burst',stagger:0};
function reveal(v={}){return {...revealDefaults,...v};}
const imageStyles=['environment','texture','foil','pattern','illustration'];
const range=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b,color=x=>/^#[a-fA-F0-9]{6}$/.test(x);
function material(v={}){return {...materialDefaults,...v};}
// The active scene is already described by the editor context. A bound material
// may also carry a complete source document and decoded rasters for rendering.
// Forward its editable configuration and identity, without duplicating pixels.
function materialContext(v){
 if(!v)return v;
 const result=Object.fromEntries(Object.keys(materialDefaults).map(k=>[k,v[k]??materialDefaults[k]]));
 if(v.document)result.sourceScene={id:v.document.id,name:v.document.name,layerIds:(v.document.layers||[]).map(l=>l.id),hasImages:hasMaterialImages(v)};
 return result;
}
function hasMaterialImages(value){return !!value?.document?.layers?.some(l=>l.visible!==false&&!l.previewReference&&l.kind!=='frame'&&(l.src||value.layerRasters?.[l.id]||l.titleArt?.variants?.some(v=>v.src)));}
function materialDepth(layer){return -.08+Math.max(-.12,Math.min(.05,Number(layer?.spatial?.z)||0));}
const regionDefaults={shape:'point',u:.5,v:.5,width:.25,height:.25,direction:'outward',angle:0,layerId:''};
const emitterDefaults={...regionDefaults,shape:'perimeter',width:1,height:1,target:'card',regionId:'',side:'both'};
function emitter(v={}){return {...emitterDefaults,...v};}
function particles(v={}){return {...particleDefaults,...v,reveal:reveal(v.reveal),...(v.palette==='gold'?{color:'#ffcb79'}:{}),...(v.emitter?{emitter:emitter(v.emitter)}:{})};}
function softHalo(v={}){const p=particles(v);return particles({...p,enabled:true,trajectory:'halo',radius:.055,opacity:Math.min(p.opacity,.65),count:Math.min(p.count,32),size:Math.min(p.size,(['bubble','krackle','orb'].includes(p.visual)?.042:.016)),speed:Math.min(p.speed,.055),spread:.5,lifetime:Math.max(p.lifetime,6),stretch:Math.min(p.stretch,3),emitter:emitter(p.emitter||{target:'frame'})});}
function validateRegion(v){if(!v||!['point','rect','ellipse','perimeter'].includes(v.shape)||!range(v.u,0,1)||!range(v.v,0,1)||!range(v.width,.001,1)||!range(v.height,.001,1)||!['outward','up','angle'].includes(v.direction)||!range(v.angle,-180,180)||typeof v.layerId!=='string'||v.layerId.length>100)throw Error('发射区域参数无效');}
function validateEmitter(v){validateRegion(v);if(!['card','frame','back','layer'].includes(v.target)||typeof v.regionId!=='string'||v.regionId.length>100||!['both','front','back'].includes(v.side))throw Error('粒子发射绑定无效');if(v.target==='layer'&&!v.layerId)throw Error('请选择发射源图层');}
function validateMaterial(v){if(!v||v.schema!=='card-material/1'||typeof v.enabled!=='boolean'||!materialStyles.includes(v.style)||!['background','artwork','front','back','both'].includes(v.target)||(v.backgroundMode!==undefined&&!['overlay','replace'].includes(v.backgroundMode))||!range(v.strength,0,1)||!range(v.speed,0,3)||!range(v.frequency,1,20)||!color(v.color)||!color(v.accent))throw Error('外观材质组件参数无效');}
function validateSprite(src){if(typeof src!=='string'||src.length>1500000)throw Error('粒子 PNG 过大');if(/^[\w/-]+\.png$/.test(src)&&!src.split('/').includes('..'))return;if(!src.startsWith('data:image/png;base64,'))throw Error('粒子贴图必须为 PNG');let b;try{b=atob(src.slice(22,66));}catch{throw Error('粒子 PNG 无效');}if(b.length<24||b.charCodeAt(0)!==137||b.slice(1,4)!=='PNG')throw Error('粒子 PNG 无效');const n=i=>((b.charCodeAt(i)*16777216)+(b.charCodeAt(i+1)<<16)+(b.charCodeAt(i+2)<<8)+b.charCodeAt(i+3));if(n(16)<1||n(20)<1||n(16)>512||n(20)>512)throw Error('粒子贴图最长边为 512px');}
function validateParticles(v){if(!v||v.schema!=='card-particles/1'||typeof v.enabled!=='boolean'||!Number.isInteger(v.count)||!range(v.count,1,256)||!range(v.lifetime,.3,12)||!range(v.speed,0,2)||!range(v.spread,0,2)||!range(v.size,.002,.08)||!color(v.color)||!Number.isInteger(v.seed)||!range(v.seed,1,65535)||!range(v.z,-.5,.5))throw Error('粒子组件参数无效');const p=particles(v);if(!particleVisuals.includes(p.visual)||!['solid','gold','rainbow'].includes(p.palette)||!range(p.stretch,1,8))throw Error('粒子外观参数无效');if(!['behind','front','surface'].includes(p.placement)||!['add','normal'].includes(p.blend)||typeof p.spriteTint!=='boolean')throw Error('粒子混合方式无效');if(!['outward','halo','float','field'].includes(p.trajectory)||!range(p.radius,0,.2)||!range(p.opacity,0,1))throw Error('粒子轨迹或强度无效');const r=p.reveal;if(typeof r.enabled!=='boolean'||typeof r.only!=='boolean'||!['streak','source'].includes(r.visual)||!['burst','trails'].includes(r.profile)||!range(r.stagger,0,.8)||!range(r.duration,.08,2)||!Number.isInteger(r.count)||!range(r.count,1,128)||!range(r.size,.002,.08)||!range(r.travel,0,3)||!range(r.stretch,1,12))throw Error('揭示闪光参数无效');if(p.sprite)validateSprite(p.sprite);if(p.visual==='sprite'&&!p.sprite)throw Error('请先导入粒子 PNG');if(v.emitter)validateEmitter(emitter(v.emitter));}
function adjustments(a={},b={}){return {brightness:Math.max(-100,Math.min(100,(a.brightness||0)+(b.brightness||0))),contrast:Math.max(-100,Math.min(100,((1+(a.contrast||0)/100)*(1+(b.contrast||0)/100)-1)*100)),saturation:Math.min(200,(a.saturation??100)*(b.saturation??100)/100),gamma:Math.max(.2,Math.min(3,(a.gamma??1)*(b.gamma??1)))};}
function validate(doc){if(doc.material)validateMaterial(doc.material);if(doc.particles)validateParticles(doc.particles);if(doc.emissionRegions){if(!Array.isArray(doc.emissionRegions)||doc.emissionRegions.length>32)throw Error('最多保存32个发射区域');const ids=new Set();for(const r of doc.emissionRegions){validateRegion(r);if(typeof r.id!=='string'||!r.id||r.id.length>100||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||r.layerId&&!doc.layers.some(l=>l.id===r.layerId))throw Error('发射区域名称或图层无效');ids.add(r.id);}}}
function source(doc={},target='card'){if(target==='back')return doc.assetKind==='back'?doc:doc.backScene?.document||doc.backScene||null;if(target==='frame')return doc.assetKind==='frame'?doc:doc.componentScenes?.frame?.document||doc;return doc;}
function resolveEmitter(value,doc={}){
 const e=emitter(value?.emitter),d=source(doc,e.target);if(!d)return {ok:false,reason:'未选择卡背，请先组合卡背'};
 const region=e.regionId?d.emissionRegions?.find(r=>r.id===e.regionId):null;if(e.regionId&&!region)return {ok:false,reason:'绑定的发射区域不存在，请重新选择'};
 const geometry={...e,...region},layer=geometry.layerId?(d.layers||[]).find(l=>l.id===geometry.layerId):null;
 if(geometry.layerId&&!layer)return {ok:false,reason:'发射源图层不存在，请重新选择'};
 if(e.target==='layer'&&!geometry.layerId)return {ok:false,reason:'请选择发射源图层'};
 if(layer&&layer.visible===false)return {ok:false,reason:'发射源图层已隐藏'};
 return {ok:true,geometry,document:d,layer,reverse:e.target==='back'&&doc.assetKind!=='back',target:e.target,frameDepth:doc.frameStyle?.depth??26};
}
function placementFor(resolved){
 const {document:d,layer:l}=resolved;let p={x:0,y:0,scale:1,rotation:0},z=['frame','back'].includes(resolved.target)? .045:0,registration=1;
 if(l){const R=typeof module==='object'&&module.exports?require('./runtime-model.js'):window.CardRuntime,S=typeof module==='object'&&module.exports?require('./spatial-model.js'):window.CardSpatial;p=R.placement(d,l);if(l.kind!=='frame'){const s=S.resolve(d,l);z=s.z+(p.z??0);registration=S.enabled(d)?(S.camera(d)-z)/(S.camera(d)-.045):1;}}
 return {...p,z,registration};
}
function mapEmitterPoint(resolved,x,y,offset=0){const p=resolved.placement||placementFor(resolved),c=Math.cos(p.rotation),s=Math.sin(p.rotation),scale=p.scale*p.registration;let qx=(p.x/1024+(x*c+y*s)*p.scale)*p.registration,qy=(-p.y/1024+(-x*s+y*c)*p.scale)*p.registration,z=p.z+offset;if(resolved.reverse){const depth=(resolved.frameDepth??26)/1024;qx=-qx;z=.045-depth-p.z-Math.abs(offset);}return {x:qx,y:qy,z,scale};}
function emissionOffset(p){return ['front','surface'].includes(p.placement)?Math.abs(p.z):p.z;}
function hash(i,seed){const x=Math.sin((i+1)*127.1+seed*311.7)*43758.5453;return x-Math.floor(x);}
// Arc-length sampling keeps the same speed across long sides and clipped corners.
function haloPath(e,cut=0,radius=.06){
 const hx=e.shape==='point'?0:e.width*.5,hy=e.shape==='point'?0:e.height*.75;
 if(['ellipse','point'].includes(e.shape))return {ellipse:true,hx,hy,length:e.shape==='point'?Math.max(.001,Math.PI*2*radius):Math.PI*(3*(hx+hy)-Math.sqrt((3*hx+hy)*(hx+3*hy)))};
 cut=Math.max(0,Math.min(cut,hx,hy));const points=cut?[ -hx+cut,hy,hx-cut,hy,hx,hy-cut,hx,-hy+cut,hx-cut,-hy,-hx+cut,-hy,-hx,-hy+cut,-hx,hy-cut]:[-hx,hy,hx,hy,hx,-hy,-hx,-hy],segments=[];let length=0;
 for(let i=0;i<points.length;i+=2){const next=(i+2)%points.length,dx=points[next]-points[i],dy=points[next+1]-points[i+1],size=Math.hypot(dx,dy);if(size){segments.push({x:points[i],y:points[i+1],dx,dy,size,start:length});length+=size;}}
 return {segments,length};
}
function haloPoint(path,at,out){
 const position=((at%1)+1)%1;if(path.ellipse){const a=position*Math.PI*2,c=Math.cos(a),s=Math.sin(a);out[0]=c*path.hx;out[1]=s*path.hy;const nx=path.hx?c/path.hx:c,ny=path.hy?s/path.hy:s,n=Math.hypot(nx,ny)||1;out[2]=nx/n;out[3]=ny/n;return;}
 const distance=position*path.length;let seg=path.segments.at(-1);for(const part of path.segments)if(distance<part.start+part.size){seg=part;break;}const t=(distance-seg.start)/seg.size;out[0]=seg.x+seg.dx*t;out[1]=seg.y+seg.dy*t;out[2]=-seg.dy/seg.size;out[3]=seg.dx/seg.size;
}
function smoothFade(t){const a=Math.max(0,Math.min(1,t));return a*a*(3-2*a);}
// A bounded field includes the artwork and a narrow fringe. Fade at wrapped
// edges so the position reset stays invisible; speed is in card-width units.
function fieldPoint(e,p,time,i,out){
 const hx=(e.shape==='point'?0:e.width*.5)+p.radius,hy=(e.shape==='point'?0:e.height*.75)+p.radius;
 const angle=(e.direction==='up'?0:e.angle)*Math.PI/180+(hash(i+13,p.seed)-.5)*Math.min(1,p.spread)*Math.PI;
 const speed=p.speed*(.5+.5*hash(i+97,p.seed)),wrap=v=>((v%1)+1)%1;
 const u=wrap(hash(i+17,p.seed)+time*speed*Math.sin(angle)/Math.max(.001,2*hx)),v=wrap(hash(i+29,p.seed)+time*speed*Math.cos(angle)/Math.max(.001,2*hy));
 if(['ellipse','point'].includes(e.shape)){
  const theta=u*Math.PI*2,rad=Math.sqrt(v);out[0]=Math.cos(theta)*rad*hx;out[1]=Math.sin(theta)*rad*hy;
  out[2]=smoothFade(v/.08)*(1-smoothFade((v-.88)/.12));
 }else{
  out[0]=(u-.5)*2*hx;out[1]=(v-.5)*2*hy;
  out[2]=smoothFade(u/.06)*(1-smoothFade((u-.94)/.06))*smoothFade(v/.06)*(1-smoothFade((v-.94)/.06));
 }
 out[0]+=e.u-.5;out[1]+=(.5-e.v)*1.5;
}
function sampleInto(value,time,doc={},facing=0,output,limit=256){const p=particles(value);if(!p.enabled)return 0;const resolved=resolveEmitter(p,doc);if(!resolved.ok)return 0;resolved.placement=placementFor(resolved);const e=resolved.geometry;if(e.side==='front'&&Math.cos(facing)<0||e.side==='back'&&Math.cos(facing)>=0)return 0;const cut=['card','frame'].includes(e.target)&&e.shape==='perimeter'&&e.width===1&&e.height===1&&e.u===.5&&e.v===.5?(resolved.document.frameStyle?.corner??48)/1024:0,path=p.trajectory==='halo'?haloPath(e,cut,p.radius):null,point=new Float64Array(4);const count=Math.min(p.count,limit,Math.floor(output.length/7));for(let i=0;i<count;i++){const r=hash(i,p.seed),life=p.visual==='adamantium'&&path?p.lifetime*(.8+.4*hash(i+467,p.seed)):p.lifetime,phase=((Math.max(0,time)/life+r)%1),edge=hash(i+379,p.seed)*4;let x,y,dx,dy;if(edge<1){x=(edge-.5);y=.75;dx=x*.8;dy=1;}else if(edge<2){x=.5;y=.75-(edge-1)*1.5;dx=1;dy=y*.5;}else if(edge<3){x=.5-(edge-2);y=-.75;dx=x*.8;dy=-1;}else{x=-.5;y=-.75+(edge-3)*1.5;dx=-1;dy=y*.5;}
 if(e.shape==='point'){x=0;y=0;const a=hash(i+61,p.seed)*Math.PI*2;dx=Math.cos(a);dy=Math.sin(a);}
 else if(e.shape==='rect'){x=hash(i+17,p.seed)-.5;y=(hash(i+29,p.seed)-.5)*1.5;dx=x;dy=y;}
 else if(e.shape==='ellipse'){const a=hash(i+61,p.seed)*Math.PI*2,rad=Math.sqrt(hash(i+29,p.seed));x=Math.cos(a)*rad*.5;y=Math.sin(a)*rad*.75;dx=Math.cos(a);dy=Math.sin(a);}
 x=x*e.width+e.u-.5;y=y*e.height+(.5-e.v)*1.5;
 // Snap corner contour constrains only the full frame perimeter; legacy cards retain their original rectangle.
 if(e.target==='frame'&&e.shape==='perimeter'&&e.width===1&&e.height===1){const cut=(resolved.document.frameStyle?.corner??48)/1024,excess=Math.max(0,Math.abs(x)+Math.abs(y)-(1.25-cut));x-=Math.sign(x)*excess*.5;y-=Math.sign(y)*excess*.5;}
 if(e.direction!=='outward'){const a=(e.direction==='up'?0:e.angle)*Math.PI/180+(p.emitter?(hash(i+13,p.seed)-.5)*p.spread*Math.PI:0);dx=Math.sin(a);dy=Math.cos(a);}
 const length=Math.hypot(dx,dy)||1,distance=phase*(p.spread+p.speed*p.lifetime);let px=x+dx/length*distance,py=y+dy/length*distance,size=(.5+.5*r)*(1-.55*phase),alpha=Math.sin(Math.PI*phase)**2;
 if(path&&p.visual!=='krackle'){const travel=Math.max(0,time)*p.speed*(.35+.65*hash(i+97,p.seed))*(hash(i+113,p.seed)>.5?1:-1)/path.length;const cluster=hash(i+379,p.seed);haloPoint(path,cluster+travel,point);const wave=.5+.5*Math.sin(Math.PI*2*(phase+r)),offset=p.radius*(.2+.8*((1-Math.min(1,p.spread))*.5+Math.min(1,p.spread)*wave));px=point[0]+e.u-.5+point[2]*offset;py=point[1]+(.5-e.v)*1.5+point[3]*offset;dx=point[3];dy=-point[2];size=(.6+.4*r)*(.96+.04*Math.sin(Math.PI*2*phase));if(p.visual==='mixed'&&r>.82)size*=2.5;if(p.visual==='orb')size*=.45+.55*r;alpha=smoothFade(phase/.18)*(1-smoothFade((phase-.65)/.35));}
 if(p.trajectory==='float'){const seconds=Math.max(0,time),a=(e.direction==='up'?0:e.angle)*Math.PI/180,wrap=v=>((v%1)+1)%1,u=wrap(hash(i+17,p.seed)+seconds*p.speed*Math.sin(a)+(p.spread*.06)*Math.sin(seconds*.7+r*6.283)),v=wrap(hash(i+29,p.seed)+seconds*p.speed*Math.cos(a));px=(u-.5)*e.width+e.u-.5;py=(v-.5)*e.height*1.5+(.5-e.v)*1.5;if(e.shape==='ellipse'){const a=u*Math.PI*2,rad=Math.sqrt(v);px=Math.cos(a)*rad*e.width*.5+e.u-.5;py=Math.sin(a)*rad*e.height*.75+(.5-e.v)*1.5;}if(e.shape==='point'){px=e.u-.5+Math.sin(seconds*.7+r*6.283)*p.radius;py=(.5-e.v)*1.5+Math.cos(seconds*.5+r*6.283)*p.radius;}size=.45+.55*r;alpha=smoothFade(phase/.15)*(1-smoothFade((phase-.7)/.3))*smoothFade(v/.08)*(1-smoothFade((v-.92)/.08));}
 if(p.trajectory==='field'){fieldPoint(e,p,Math.max(0,time),i,point);px=point[0];py=point[1];size=.45+.55*r;alpha=smoothFade(phase/.15)*(1-smoothFade((phase-.7)/.3))*point[2];}
 if(p.visual==='bubble'&&path){
  // Visible official bubbles rise from the contour instead of walking around it.
  const seconds=Math.max(0,time),cycle=Math.floor(seconds/life+r),age=phase*life;
  haloPoint(path,hash(i+379+cycle*137,p.seed),point);
  const offset=p.radius*(.1+.25*hash(i+53,p.seed)),a=(e.direction==='up'?0:e.angle)*Math.PI/180;
  dx=e.direction==='outward'?point[2]:Math.sin(a);dy=e.direction==='outward'?point[3]:Math.cos(a);
  const travel=age*p.speed*(.8+.4*hash(i+97,p.seed));
  const sideways=travel*point[2]*.35*Math.min(1,p.spread)+Math.sin(age*2.4+r*6.283)*p.radius*.10*Math.min(1,p.speed*8);
  px=point[0]+e.u-.5+point[2]*offset+dx*travel+dy*sideways;
  py=point[1]+(.5-e.v)*1.5+point[3]*offset+dy*travel-dx*sideways;
  size=.55+.90*hash(i+443,p.seed);
  const fringe=Math.max(0,Math.abs(px-e.u+.5)-e.width*.5,Math.abs(py-(.5-e.v)*1.5)-e.height*.75);
  alpha=smoothFade(phase/.10)*(1-smoothFade((phase-.65)/.35))*(1-smoothFade((fringe-p.radius*3.5)/Math.max(.001,p.radius*2)));
 }
 if(p.visual==='banana'&&path){
  // Illustrated bananas grow at a contour site, spin both ways and drift locally outward.
  const seconds=Math.max(0,time),cycle=Math.floor(seconds/life+r),age=phase*life;
  haloPoint(path,hash(i+379+cycle*137,p.seed),point);
  const a=(e.direction==='up'?0:e.angle)*Math.PI/180;
  dx=e.direction==='outward'?point[2]:Math.sin(a);dy=e.direction==='outward'?point[3]:Math.cos(a);
  const offset=p.radius*(.12+.20*hash(i+53,p.seed)),travel=age*p.speed*(.65+.75*hash(i+97,p.seed));
  const sideways=Math.sin(age*2+r*6.283)*p.radius*.14*Math.min(1,p.spread)*Math.min(1,p.speed*8);
  px=point[0]+e.u-.5+point[2]*offset+dx*travel+dy*sideways;
  py=point[1]+(.5-e.v)*1.5+point[3]*offset+dy*travel-dx*sideways;
  size=(.75+1.5*hash(i+443,p.seed))*(.3+.7*smoothFade(phase/.20));
  const fringe=Math.max(0,Math.abs(px-e.u+.5)-e.width*.5,Math.abs(py-(.5-e.v)*1.5)-e.height*.75);
  alpha=smoothFade(phase/.10)*(1-smoothFade((phase-.55)/.45))*(1-smoothFade((fringe-p.radius*3.5)/Math.max(.001,p.radius*2)));
 }
 if(p.visual==='diamond'&&path){
  const seconds=Math.max(0,time),cycle=Math.floor(seconds/life+r),age=phase*life;
  haloPoint(path,hash(i+379+cycle*137,p.seed),point);
  const a=(e.direction==='up'?0:e.angle)*Math.PI/180;
  dx=e.direction==='outward'?point[2]:Math.sin(a);dy=e.direction==='outward'?point[3]:Math.cos(a);
  const travel=age*p.speed*(.65+.75*hash(i+97,p.seed)),offset=p.radius*(.08+.20*hash(i+53,p.seed));
  px=point[0]+e.u-.5+point[2]*offset+dx*travel;
  py=point[1]+(.5-e.v)*1.5+point[3]*offset+dy*travel;
  size=(i%4===0?.18+.25*hash(i+443,p.seed):.45+1.10*hash(i+443,p.seed))*(.45+.55*smoothFade(phase/.18));
  const fringe=Math.max(0,Math.abs(px-e.u+.5)-e.width*.5,Math.abs(py-(.5-e.v)*1.5)-e.height*.75);
  alpha=smoothFade(phase/.08)*(1-smoothFade((phase-.55)/.45))*(1-smoothFade((fringe-p.radius*2)/Math.max(.001,p.radius*1.5)));
 }
 if(p.visual==='krackle'&&path){
  const seconds=Math.max(0,time),group=Math.floor(i/3),birth=seconds/p.lifetime+hash(group+201,p.seed),cycle=Math.floor(birth),age=birth-cycle,delay=(i%3)*.10;
  const local=Math.max(0,(age-delay)/(1-delay));
  haloPoint(path,hash(group+379+cycle*137,p.seed),point);
  dx=point[3];dy=-point[2];
  const offset=p.radius*(.15+.72*hash(i+53,p.seed)),spacing=(i%3-1)*Math.min(.022,p.radius*.32);
  const drift=(local-.5)*Math.min(p.radius*.20,p.speed*p.lifetime*.20);
  px=point[0]+e.u-.5+point[2]*offset+point[3]*(spacing+drift);
  py=point[1]+(.5-e.v)*1.5+point[3]*offset-point[2]*(spacing+drift);
  size=(.20+1.05*Math.pow(r,1.4))*(.20+.80*smoothFade(local/.35))*(1-.55*smoothFade((local-.45)/.55));
  alpha=smoothFade(local/.10)*(1-smoothFade((local-.60)/.40));
 }
 if(p.visual==='starcore'&&path){
  // Two overlapping cores and two satellites share an origin. Travel stays local.
  const seconds=Math.max(0,time),group=Math.floor(i/4),slot=i%4;
  const birth=seconds/p.lifetime+hash(group+201,p.seed),cycle=Math.floor(birth),age=birth-cycle;
  const local=Math.max(0,(age-slot*.07)/(1-slot*.07));
  haloPoint(path,hash(group+379+cycle*137,p.seed),point);
  const offset=p.radius*(.25+.45*hash(group+53,p.seed)),orbit=local*1.1+slot*1.9;
  const sideways=Math.cos(orbit)*p.radius*.28,normal=Math.sin(orbit)*p.radius*.20;
  px=point[0]+e.u-.5+point[2]*(offset+normal)+point[3]*sideways;
  py=point[1]+(.5-e.v)*1.5+point[3]*(offset+normal)-point[2]*sideways;
  dx=point[3];dy=-point[2];
  size=(r<.65?.55+.40*r:.09+.15*r)*(.65+.35*smoothFade(local/.3));
  alpha=smoothFade(local/.14)*(1-smoothFade((local-.54)/.46));
 }
 if(p.visual==='cosmic'&&path){
  if(r>.78){
   haloPoint(path,hash(i+379,p.seed),point);
   const angle=e.direction==='outward'?-.55+(hash(i+53,p.seed)-.5)*.45:(e.direction==='up'?Math.PI/2:Math.PI/2-e.angle*Math.PI/180);
   dx=Math.cos(angle);dy=Math.sin(angle);const travel=(phase-.5)*Math.min(p.radius*1.2,p.speed*p.lifetime);
   px=point[0]+e.u-.5+point[2]*p.radius*.35+dx*travel;py=point[1]+(.5-e.v)*1.5+point[3]*p.radius*.35+dy*travel;
   size=.09+.05*r;alpha=smoothFade(phase/.12)*(1-smoothFade((phase-.65)/.35));
  }else{size=.75+.5*r;alpha=(.45+.55*smoothFade(phase/.15)*(1-smoothFade((phase-.8)/.2)))*(.75+.25*Math.sin(Math.max(0,time)*.4+r*6.283));}
 }
 if(p.visual==='cosmic')size=r>.78?.09+.05*r:.75+.5*r;
 if(p.visual==='wakanda'){
  if(path){haloPoint(path,hash(i+379,p.seed),point);const drift=(phase-.5)*Math.min(p.radius*.9,p.speed*p.lifetime);px=point[0]+e.u-.5+point[2]*p.radius*(.2+.65*hash(i+53,p.seed));py=point[1]+(.5-e.v)*1.5+point[3]*p.radius*(.2+.65*hash(i+53,p.seed))+drift;}
  size=r<.58?.55+.55*r:r<.82?.18+.10*r:.30+.10*r;alpha=(r<.58?.8:r<.82?.6:1)*smoothFade(phase/.12)*(1-smoothFade((phase-.65)/.35));
 }
 if(['flower','paw','pizza','adamantium'].includes(p.visual)&&path){
  const seconds=Math.max(0,time),cycle=Math.floor(seconds/life+r);
  // Each birth chooses another bounded site. The phase fade hides the reset.
  haloPoint(path,hash(i+379+cycle*137,p.seed),point);
  const offset=p.radius*(.25+.75*hash(i+53,p.seed))-Math.min(e.width,e.height)*.18*Math.min(1,p.spread)*hash(i+71,p.seed);
  const drift=(phase-.5)*Math.min(p.radius*.6,p.speed*p.lifetime);
  px=point[0]+e.u-.5+point[2]*offset+point[3]*drift;
  py=point[1]+(.5-e.v)*1.5+point[3]*offset-point[2]*drift;
  size=(.25+1.0*Math.pow(r,1.5))*(.35+.65*Math.sin(Math.PI*phase));
  alpha=smoothFade(phase/.12)*(1-smoothFade((phase-.65)/.35));
  if(p.visual==='adamantium'){
   // The observed emblems expand radially from inside the frame, not along it.
   const inset=(.15+.40*hash(i+71,p.seed))*Math.min(1,p.spread),distance=Math.max(.000001,Math.hypot(point[0],point[1]));
   // Observed speed quantiles favor slow emblems with a small faster tail.
   const speedSeed=hash(i+53,p.seed),travel=Math.min(distance*inset+p.radius*.9,phase*p.speed*life*(.47+.95*speedSeed*speedSeed));
   const scale=1-inset+travel/distance;
   px=point[0]*scale+e.u-.5;py=point[1]*scale+(.5-e.v)*1.5;
   // Keep the size seed independent of birth phase to avoid a shared breathing pulse.
   const sizeSeed=hash(i+443,p.seed),large=i%5<2;
   // Similar birth sizes, independent peaks, and progressively slower growth.
   const growthPhase=Math.min(1,phase*life/(p.lifetime*.8)/(large?1.03-.27*sizeSeed:.85)),growthEase=growthPhase*(2-growthPhase);
   size=large?1.02*(.38+(.20+.77*Math.pow(sizeSeed,1.58))*growthEase):(.045+.07*sizeSeed)*(.36+.46*growthEase);
   // A longer fade continues radial travel instead of cutting the emblem abruptly.
   alpha=smoothFade(phase/.08)*(1-smoothFade((phase-.50)/.50));
  }
 }
 if(p.visual==='shard'){size=r>.84?1.1+.25*(r-.84)/.16:.38+.62*r;}
 const q=mapEmitterPoint(resolved,px,py,emissionOffset(p)),k=i*7;output[k]=q.x;output[k+1]=q.y;output[k+2]=q.z;output[k+3]=p.size*q.scale*size;output[k+4]=alpha*p.opacity;output[k+5]=p.visual==='bubble'?0:p.visual==='adamantium'?Math.sin(Math.max(0,time)*.45+r*6.283)*.22:p.visual==='flower'?r*6.283+Math.max(0,time)*.10:p.visual==='paw'?Math.sin(Math.max(0,time)*.7+r*6.283)*.25:p.visual==='pizza'?r*6.283+Math.max(0,time)*(.16+.10*hash(i+53,p.seed)):p.visual==='wakanda'?(r>=.58&&r<.82?(hash(i+71,p.seed)>.5?Math.PI/3:-Math.PI/3):0):p.visual==='shard'?((r*6.283+Math.max(0,time)*(.25+.35*hash(i+53,p.seed))+Math.PI)%(Math.PI*2))-Math.PI:p.visual==='tone'?Math.PI/2+.12:p.visual==='pixel'?0:p.visual==='heart'?Math.sin(Math.max(0,time)*.6+r*6.283)*.35:p.visual==='leaf'?r*6.283+Math.max(0,time)*.35+Math.sin(Math.max(0,time)*1.2+r*6.283)*.4:p.visual==='banana'?r*Math.PI*2+phase*life*(.25+3*hash(i+71,p.seed))*(hash(i+113,p.seed)>.5?1:-1)*Math.min(1,p.speed*8):p.visual==='tech'?r*Math.PI*2+Math.sin(Math.max(0,time)*.3+r*Math.PI*2)*.12:Math.atan2(dy,dx);if(['flower','pizza','banana'].includes(p.visual))output[k+5]=(((output[k+5]+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2))-Math.PI;output[k+6]=r;}return count;}
function sample(value,time,doc={},facing=0){const output=new Float64Array(256*7),count=sampleInto(value,time,doc,facing,output);return Array.from({length:count},(_,i)=>{const k=i*7;return {x:output[k],y:output[k+1],z:output[k+2],size:output[k+3],alpha:output[k+4]};});}
// The legacy seven-value layout stays intact. Shape overrides share one batch.
function sampleCompositionInto(value,time,doc,facing,output,visuals,limit=256,revealTime=time){
 const p=particles(value),r=p.reveal,active=r.enabled&&revealTime>=0&&revealTime<r.duration;
 const budget=Math.max(0,Math.min(256,Math.floor(limit),Math.floor(output.length/7),visuals.length));
 const only=r.enabled&&r.only,idleLimit=only?0:active?Math.floor(budget*p.count/(p.count+r.count)):budget;
 const idle=sampleInto(p,time,doc,facing,output,idleLimit);visuals.fill(-1,0,idle);
 if(!active||!p.enabled)return idle;
 const resolved=resolveEmitter(p,doc);if(!resolved.ok)return idle;const e=resolved.geometry;
 if(e.side==='front'&&Math.cos(facing)<0||e.side==='back'&&Math.cos(facing)>=0)return idle;
 resolved.placement=placementFor(resolved);const count=Math.min(r.count,budget-idle),phase=revealTime/r.duration;
 for(let i=0;i<count;i++){
  const seed=hash(i+701,p.seed),angle=(i+hash(i+719,p.seed)*.6)/count*Math.PI*2;
  // Delayed short rays and fast early rays share the same seven-value layout.
  // Global duration keeps the late cohort slower despite its shorter lifetime.
  const trails=r.profile==='trails',late=trails&&i%5===0;
  const delay=trails?r.duration*Math.min(.8,r.stagger*(late?.8+.4*hash(i+751,p.seed):.12*hash(i+751,p.seed))):0;
  const age=revealTime-delay,local=trails?Math.max(0,age)/(r.duration-delay):phase;
  const velocity=trails?(late?.38+.10*hash(i+769,p.seed):.84+.26*hash(i+769,p.seed)):1;
  const radial=(late?.75:.15)+(late?.2:.75)*hash(i+733,p.seed),travel=r.travel*(trails?Math.max(0,age)/r.duration:phase)*velocity;
  let rx=e.width*.5*radial,ry=e.height*.75*radial;
  if(late){const cx=Math.cos(angle),cy=Math.sin(angle),hx=e.width*.5,hy=e.height*.75;
   const distance=e.shape==='point'?0:e.shape==='ellipse'?1/Math.hypot(cx/hx,cy/hy):Math.min(hx/Math.max(.001,Math.abs(cx)),hy/Math.max(.001,Math.abs(cy)));
   rx=ry=distance*radial;
  }
  const x=e.u-.5+Math.cos(angle)*(rx+travel),y=(.5-e.v)*1.5+Math.sin(angle)*(ry+travel);
  const q=mapEmitterPoint(resolved,x,y,emissionOffset(p)),k=(idle+i)*7;
  output[k]=q.x;output[k+1]=q.y;output[k+2]=q.z;output[k+3]=r.size*q.scale*(.65+.35*seed)*(1-.65*local)*(late?.38+.16*seed:1);
  output[k+4]=age<0?0:(.7+.3*seed)*(1-smoothFade(local))*p.opacity;output[k+5]=angle;output[k+6]=seed;visuals[idle+i]=r.visual==='source'?particleVisuals.indexOf(p.visual):3;
 }
 return idle+count;
}
return {materialStyles,particleVisuals,validateSprite,materialDefaults,particleDefaults,revealDefaults,reveal,regionDefaults,emitterDefaults,imageStyles,material,materialContext,softHalo,hasMaterialImages,materialDepth,particles,emitter,source,resolveEmitter,mapEmitterPoint,validateRegion,validateEmitter,validateMaterial,validateParticles,validate,adjustments,haloPath,haloPoint,fieldPoint,sample,sampleInto,sampleCompositionInto};
});
