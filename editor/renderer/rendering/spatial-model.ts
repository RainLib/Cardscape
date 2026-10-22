/* Registered artwork shares one camera. Z is relative to the flat frame face. */

const api = (()=>{
'use strict';
const roles={far:{name:'背景 · 远景',z:-.18,clip:true},mid:{name:'背景 · 中景',z:-.10,clip:true},near:{name:'环境 · 前景',z:-.02,clip:true},rear:{name:'人物 · 后部',z:.025,clip:false},body:{name:'人物 · 连续主体',z:.075,clip:false},front:{name:'人物 · 前部',z:.12,clip:false},title:{name:'图片字标',z:.20,clip:false},stat:{name:'数值徽章',z:.015,clip:false},surface:{name:'附加素材',z:.10,clip:true}};
const defaults={schema:'card-spatial/1',enabled:true,cameraDistance:2.7};
// Semantic parts describe real occlusion, never a duplicate armor shell.
const parts={arm:{name:'手臂',mode:'rigid'},forearm:{name:'前臂',mode:'rigid'},hand:{name:'手 / 握持组',mode:'rigid'},leg:{name:'腿',mode:'rigid'},wing:{name:'翅膀',mode:'rigid'},head:{name:'头部',mode:'rigid'},torso:{name:'躯干',mode:'rigid'},weapon:{name:'武器',mode:'rigid'},accessory:{name:'饰物',mode:'rigid'},cape:{name:'披风',mode:'cloth'},skirt:{name:'裙摆',mode:'cloth'},hair:{name:'发梢',mode:'cloth'}};
function rigid(l){return parts[l?.anatomy?.part]?.mode==='rigid'||l?.attachment?.mode==='rigid';}
function classify(d,l,{part,side='center'}: any){if(!character(l)||!parts[part]||!['left','right','center'].includes(side))throw Error('请选择人物部件及有效方位');l.anatomy={schema:'card-character-part/1',part,side};if(l.splitSourceId)l.attachment={maxOffset:.025,blendWidth:64,...l.attachment,mode:parts[part].mode,...(parts[part].mode==='rigid'?{motion:0}:{})};validate(d);}
function enabled(d){return d?.spatial?.enabled===true;}
function camera(d){return enabled(d)?d.spatial.cameraDistance??2.7:2.7;}
function role(l){return l?.spatial?.role||(l?.kind==='foreground'?'body':l?.kind==='background'?'far':l?.titleArt?'title':['cost','power','stat-cost','stat-power'].includes(l?.role)?'stat':'surface');}
function character(l){return l?.kind==='foreground'||['rear','body','front'].includes(l?.spatial?.role);}
// Split parts remain character sources even when temporarily hidden for review.
// Ordinary images and backgrounds must not receive the character's shared masks.
function characterContextLayer(context){
 const selected=context?.layer;if(selected?.kind==='foreground')return true;
 if(selected?.kind!=='image'||typeof selected.id!=='string')return false;
 const layers=context?.document?.layers;
 if(Array.isArray(layers)){const layer=layers.find(l=>l.id===selected.id);return !!layer&&layer.kind==='image'&&!layer.previewReference&&character(layer);}
 const surfaces=context?.document?.characterDepth?.surfaces;
 return Array.isArray(surfaces)&&surfaces.some(s=>s.id===selected.id&&['rear','body','front'].includes(s.role));
}
// Repairs update the working master; identity still comes from the pre-repair original.
function characterMaster(d,l){if(!character(l))return null;const parent=l.splitSourceId?d.layers?.find(p=>p.id===l.splitSourceId):null;return parent?.underpaint?.originalMaster||parent?.master||l.underpaint?.originalMaster||l.master||null;}
function slotDepth(d,l){return (d.slots||[]).find(s=>s.id===l.slotId)?.z??0;}
// Parent links express authored occlusion. Depth and painter order are independent.
// A hidden reference may supply backfill but never proves visible occlusion works.
function occlusionPairs(surfaces){
 const byId=new Map<any, any>(surfaces.map(s=>[s.id,s]));
 return surfaces.flatMap(s=>{
  const parent=byId.get(s.parentLayerId??s.parentId);
  if(!parent||!['front','rear'].includes(s.role))return [];
  const front=s.role==='front'?s:parent,back=s.role==='front'?parent:s;
  return [{frontId:front.id,backId:back.id,active:front.visible!==false&&back.visible!==false,painterMatches:Number.isInteger(front.paintOrder)&&Number.isInteger(back.paintOrder)?front.paintOrder>back.paintOrder:null,depthDelta:Number.isFinite(front.z)&&Number.isFinite(back.z)?front.z-back.z:null}];
 });
}
function imageContext(d,l){if(!character(l))return null;const context: any={schema:'card-character-image/1',spatialEnabled:enabled(d),cameraDistance:camera(d),layerId:l.id,role:role(l),part:l.anatomy?.part||null,side:l.anatomy?.side||null,parentLayerId:l.splitSourceId||null,surfaces:(d.layers||[]).flatMap((p,index)=>character(p)&&!p.previewReference?[{id:p.id,name:p.name,role:role(p),part:p.anatomy?.part||null,side:p.anatomy?.side||null,parentLayerId:p.splitSourceId||null,visible:p.visible!==false,paintOrder:d.layers.length-1-index,slotZ:slotDepth(d,p),z:enabled(d)?resolve(d,p).relativeZ+slotDepth(d,p):null}]:[])};context.occlusionPairs=occlusionPairs(context.surfaces);return context;}
function validateImageContext(value,layerId){
 if(value===undefined||value===null)return null;
 const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v),part=v=>v===null||!!parts[v],side=v=>v===null||['left','right','center'].includes(v),role=v=>['rear','body','front'].includes(v),parent=v=>v===null||id(v);
 if(!value||value.schema!=='card-character-image/1'||typeof value.spatialEnabled!=='boolean'||!Number.isFinite(value.cameraDistance)||value.cameraDistance<2.2||value.cameraDistance>4||value.layerId!==layerId||!id(value.layerId)||!role(value.role)||!part(value.part)||!side(value.side)||!parent(value.parentLayerId)||!Array.isArray(value.surfaces)||!value.surfaces.length||value.surfaces.length>64)throw Error('人物图片任务上下文无效');
 if(Object.keys(value).some(k=>!['schema','spatialEnabled','cameraDistance','layerId','role','part','side','parentLayerId','surfaces','occlusionPairs'].includes(k)))throw Error('人物图片任务上下文字段无效');
 const ids=new Set<any>(),orders=new Set<any>();for(const p of value.surfaces){if(!p||!id(p.id)||ids.has(p.id)||typeof p.name!=='string'||p.name.length>200||!role(p.role)||!part(p.part)||!side(p.side)||!parent(p.parentLayerId)||(value.spatialEnabled?(!Number.isFinite(p.z)||p.z-(p.slotZ??0)<-.400001||p.z-(p.slotZ??0)>.400001):p.z!==null)||p.visible!==undefined&&typeof p.visible!=='boolean'||p.slotZ!==undefined&&(!Number.isFinite(p.slotZ)||p.slotZ<-.2||p.slotZ>.4)||p.paintOrder!==undefined&&(!Number.isInteger(p.paintOrder)||p.paintOrder<0||p.paintOrder>63||orders.has(p.paintOrder))||Object.keys(p).some(k=>!['id','name','role','part','side','parentLayerId','z','visible','paintOrder','slotZ'].includes(k)))throw Error('人物图片任务表面无效');ids.add(p.id);if(p.paintOrder!==undefined)orders.add(p.paintOrder);}
 const selected=value.surfaces.find(p=>p.id===layerId);if(!selected||['role','part','side','parentLayerId'].some(k=>selected[k]!==value[k])||value.surfaces.some(p=>p.parentLayerId&&!ids.has(p.parentLayerId)))throw Error('人物图片任务图层关系无效');
 if(value.occlusionPairs!==undefined){const expected=occlusionPairs(value.surfaces),keys=['frontId','backId','active','painterMatches','depthDelta'];if(!Array.isArray(value.occlusionPairs)||value.occlusionPairs.length!==expected.length||value.occlusionPairs.some((p,i)=>!p||Object.keys(p).length!==keys.length||Object.keys(p).some(k=>!keys.includes(k))||keys.some(k=>p[k]!==expected[i][k])))throw Error('人物图片任务遮挡关系无效');}
 return structuredClone(value);
}
function background(l){return l?.kind==='background'||['background-candidate','baseplate'].includes(l?.role)||['far','mid','near'].includes(l?.spatial?.role);}
// A replacement finish owns one backdrop; other authored background planes return in overlay mode.
function replacementBackground(doc,material){
 if(!material?.enabled||material.backgroundMode!=='replace'||material.style==='ink'||material.target==='back')return null;
 const candidates=(doc.layers||[]).filter(l=>l.visible!==false&&background(l)&&l.role!=='baseplate'&&!l.material_overlay);
 const primary=candidates.find(l=>l.kind==='background')||candidates.find(l=>l.spatial?.role==='far')||candidates[0];
 return primary?.id||null;
}
function connection(d,l){const parent=enabled(d)&&l?.splitSourceId?d.layers?.find(p=>p.id===l.splitSourceId&&p.kind==='foreground'):null;if(!parent)return null;const maxOffset=l.attachment?.maxOffset??.025,blendWidth=l.attachment?.blendWidth??64,parentZ=.045+(parent.spatial?.z??roles.body.z),requested=.045+(l.spatial?.z??roles[role(l)].z);return {parent,parentZ,z:parentZ+Math.max(-maxOffset,Math.min(maxOffset,requested-parentZ)),maxOffset,blendWidth,anchor:l.attachment?.anchor,motion:rigid(l)?0:l.attachment?.motion,mode:rigid(l)?'rigid':'cloth'};}
function naturalAttachment(d,l){const link=connection(d,l);if(!link)throw Error('请选择已拆出的人物部件');const front=role(l)==='front';return {...l.attachment,maxOffset:Math.min(link.maxOffset,front ? .04 : .05),blendWidth:link.blendWidth,motion:link.mode==='rigid'?0:Math.min(link.motion??.35,front ? .25 : .4)};}
function resolve(d,l){const preset=roles[role(l)]||roles.surface,link=connection(d,l),requestedZ=.045+(l?.spatial?.z??preset.z),z=link?.z??requestedZ;return {role:role(l),z,requestedZ,relativeZ:z-.045,clip:l?.spatial?.clip??preset.clip,registration:enabled(d)?(camera(d)-z)/(camera(d)-.045):1};}
// Distance from INTERNAL cut boundaries. Silhouette edges remain free.
// This compact CPU field is rebuilt only when ownership/coverage changes.
function attachmentWeights(uv,ownership,coverage,blendWidth=64,anchor,mode='cloth'){
 const result=new Float32Array(uv.length/2).fill(1);
 // A limb is one rigid surface. Per-vertex parent/child blending would stretch it.
 if(mode==='rigid')return result;
 // An explicit cloth root does not pin the hem or side edges just because
 // hidden backing now occupies those pixels. Coordinates are source pixels.
 if(anchor?.edge==='segment'){const [ax,ay]=anchor.root,[bx,by]=anchor.tip,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;for(let i=0;i<result.length;i++){const x=uv[i*2]*1024,y=uv[i*2+1]*1536,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/den));result[i]=t*t*(3-2*t);}return result;}
 if(anchor&&anchor.edge!=='boundary'){for(let i=0;i<result.length;i++){const x=uv[i*2]*1024,y=uv[i*2+1]*1536,value={top:y,bottom:1536-y,left:x,right:1024-x}[anchor.edge],t=Math.max(0,Math.min(1,(value-anchor.pin)/(anchor.release-anchor.pin)));result[i]=t*t*(3-2*t);}return result;}
 if(!ownership||!coverage)return result;
 const w=128,h=192,n=w*h,inside: any=new Uint8Array(n),solid: any=new Uint8Array(n),distance=new Float32Array(n).fill(1e6);
 const sample=(im,x,y)=>{const px=Math.round(x/(w-1)*(im.width-1)),py=Math.round(y/(h-1)*(im.height-1));return im.data[(py*im.width+px)*4]/255;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;inside[i]=sample(ownership,x,y)>.35;solid[i]=sample(coverage,x,y)>.35;}
 let seeds=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!inside[i])continue;if([i-1,i+1,i-w,i+w].some(j=>solid[j]&&!inside[j])){distance[i]=0;seeds++;}}
 if(!seeds)return result;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;distance[i]=Math.min(distance[i],x?distance[i-1]+1:1e6,y?distance[i-w]+1:1e6);}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;distance[i]=Math.min(distance[i],x<w-1?distance[i+1]+1:1e6,y<h-1?distance[i+w]+1:1e6);}
 for(let i=0;i<result.length;i++){const x=Math.max(0,Math.min(w-1,Math.round(uv[i*2]*(w-1)))),y=Math.max(0,Math.min(h-1,Math.round(uv[i*2+1]*(h-1))));const t=Math.min(1,distance[y*w+x]*8/blendWidth);result[i]=t*t*(3-2*t);}
 return result;
}
function extent(l,size=undefined){const r=l?.sourceWindow;if(!r)return [1,1];if(!size&&l.src?.startsWith('data:image/png;base64,')){try{const b=atob(l.src.slice(22,54)),read=o=>(b.charCodeAt(o)*16777216+b.charCodeAt(o+1)*65536+b.charCodeAt(o+2)*256+b.charCodeAt(o+3));size=[read(16),read(20)];}catch{}}return [(size?.[0]??r.width+2*r.x)/r.width,(size?.[1]??r.height+2*r.y)/r.height];}
function set(d,l,value){if(!l||l.kind==='frame')throw Error('卡框保持固定空间平面');d.spatial={...defaults,...d.spatial,enabled:true};const name=value.role||role(l),preset=roles[name];if(!preset)throw Error('空间角色无效');l.spatial={role:name,z:value.z??preset.z,clip:value.clip??preset.clip};validate(d);}
function validateAttachment(a){if(!Number.isFinite(a.maxOffset)||a.maxOffset<.001||a.maxOffset>.15||!Number.isFinite(a.blendWidth)||a.blendWidth<16||a.blendWidth>192)throw Error('人物连接参数无效');if(a.mode!==undefined&&!['cloth','rigid'].includes(a.mode)||a.mode==='rigid'&&a.motion!==undefined&&a.motion!==0)throw Error('刚性部件不能使用衣料摆动');if(a.anchor?.edge==='segment'){const n=a.anchor;if(![n.root,n.tip].every(p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=0&&p[0]<=1023&&p[1]>=0&&p[1]<=1535)||Math.hypot(n.tip[0]-n.root[0],n.tip[1]-n.root[1])<16)throw Error('衣料锚点距离须至少16px');}else if(a.anchor){const n=a.anchor,limit=['left','right'].includes(n.edge)?1024:1536;if(!['top','bottom','left','right','boundary'].includes(n.edge)||n.edge!=='boundary'&&(!Number.isFinite(n.pin)||!Number.isFinite(n.release)||n.pin<0||n.release>limit||n.release-n.pin<16))throw Error('衣料根部范围无效');}if(a.motion!==undefined&&(!Number.isFinite(a.motion)||a.motion<0||a.motion>2))throw Error('衣料运动强度无效');}
function validate(d){if(d.spatial){const s=d.spatial;if(s.schema!=='card-spatial/1'||typeof s.enabled!=='boolean'||!Number.isFinite(s.cameraDistance)||s.cameraDistance<2.2||s.cameraDistance>4)throw Error('空间相机参数无效');}for(const l of d.layers||[]){if(l.anatomy){const a=l.anatomy;if(!character(l)||a.schema!=='card-character-part/1'||!parts[a.part]||!['left','right','center'].includes(a.side))throw Error('人物部件分类无效');if(rigid(l)&&(l.attachment?.mode==='cloth'||(l.attachment?.motion??0)!==0))throw Error('刚性部件不能使用衣料摆动');}if(l.attachment){if(!l.splitSourceId||!d.layers.some(p=>p.id===l.splitSourceId&&p.kind==='foreground'))throw Error('人物连接参数无效');validateAttachment(l.attachment);}if(!l.spatial)continue;const s=l.spatial;if(l.kind==='frame'||!roles[s.role]||!Number.isFinite(s.z)||s.z<-.4||s.z>.4||typeof s.clip!=='boolean')throw Error('图层空间参数无效');if(['rear','front'].includes(s.role)&&l.kind!=='image')throw Error('人物前后部需要独立图片层');}}
// Metadata audit identifies required visual checks; it cannot certify hidden pixels.
function depthAudit(d){
 const layers=(d?.layers||[]).filter(l=>l.visible!==false&&character(l)&&!l.previewReference),issues=[],groups=new Map<any, any>(),surfaces=layers.map(l=>{
  const link=connection(d,l),s=resolve(d,l),z=s.z+slotDepth(d,l),parentZ=link?link.parentZ+slotDepth(d,link.parent):null;
  if(!l.anatomy)issues.push({code:'unclassified',layerId:l.id});
  if(link&&Math.abs(z-parentZ)>.001)issues.push({code:l.underpaint?.filledPixels||link.parent.underpaint?.filledPixels?'hidden-support-review':'hidden-support-unverified',layerId:l.id,parentId:link.parent.id});
  if(link&&((s.role==='front'&&z<parentZ-.001)||(s.role==='rear'&&z>parentZ+.001)))issues.push({code:'depth-role-conflict',layerId:l.id,parentId:link.parent.id});
  const rootId=l.splitSourceId||l.id,ids=groups.get(rootId)||[];ids.push(l.id);groups.set(rootId,ids);
  return {id:l.id,name:l.name,part:l.anatomy?.part||null,side:l.anatomy?.side||null,role:s.role,z,slotZ:slotDepth(d,l),paintOrder:d.layers.length-1-d.layers.indexOf(l),mode:rigid(l)?'rigid':'cloth',parentId:l.splitSourceId||null,backfillPixels:l.underpaint?.filledPixels||0};
 });
 const pairs=occlusionPairs(surfaces);for(const p of pairs)if(p.active&&p.painterMatches===false)issues.push({code:'painter-role-conflict',layerId:p.frontId,backId:p.backId});
 const characters=[...groups].map(([rootId,surfaceIds]: any)=>{const own=surfaces.filter(s=>surfaceIds.includes(s.id)),z=own.map(s=>s.z),root=(d.layers||[]).find(l=>l.id===rootId);if(surfaceIds.length===1)issues.push({code:'single-character-plane',layerId:rootId});else if(!enabled(d))issues.push({code:'character-camera-disabled',layerId:rootId});else if(Math.max(...z)-Math.min(...z)<=.001)issues.push({code:'coplanar-character-parts',layerId:rootId});return {rootId,name:root?.name||rootId,surfaceIds,depthRange:enabled(d)?[Math.min(...z),Math.max(...z)]:null,partFamilies:Object.fromEntries(['arm','leg','wing','cloth'].map(f=>[f,own.filter(s=>(f==='arm'?['arm','forearm','hand']:f==='cloth'?['cape','skirt','hair']:[f]).includes(s.part)).map(s=>({id:s.id,side:s.side,role:s.role,z:enabled(d)?s.z:null}))])),hiddenSurfaceIds:(d.layers||[]).filter(l=>l.visible===false&&character(l)&&!l.previewReference&&(l.splitSourceId||l.id)===rootId).map(l=>l.id)};});
 return {schema:'card-character-depth-audit/1',spatialEnabled:enabled(d),characters,surfaces,occlusionPairs:pairs,issues,visualVerificationRequired:true};
}
function project(point,yaw,pitch,d=2.7){let [x,y,z]=point;const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);[x,z]=[c*x+s*z,-s*x+c*z];[y,z]=[a*y-b*z,b*y+a*z];return [x/(d-z),y/(d-z)];}
return {roles,parts,defaults,enabled,camera,role,character,characterContextLayer,characterMaster,imageContext,validateImageContext,rigid,classify,depthAudit,background,replacementBackground,resolve,extent,set,validate,validateAttachment,project,connection,attachmentWeights,naturalAttachment};
})();

export default api;
